import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { goodiLookup } from './fuelApi';

type Tab = 'fuel' | 'balance';

/**
 * Downscale + re-encode a receipt photo to JPEG before upload, to keep Storage
 * usage low (free tier = 1 GB). A receipt is a photo of paper — full camera
 * resolution is unnecessary to read it. Falls back to the original file if the
 * browser can't decode it (e.g. some HEIC) or if compression wouldn't help.
 */
async function compressImage(file: File, maxDim = 1280, quality = 0.7): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = dataUrl;
    });
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      if (width >= height) { height = Math.round((height * maxDim) / width); width = maxDim; }
      else { width = Math.round((width * maxDim) / height); height = maxDim; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file; // keep whichever is smaller
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

interface FuelForm {
  cardNumber: string;
  driverName: string;
  receiptFile: File | null;
  receiptPreview: string | null;
}

export default function DelekPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('fuel');
  const [fuelForm, setFuelForm] = useState<FuelForm>({
    cardNumber: '',
    driverName: '',
    receiptFile: null,
    receiptPreview: null,
  });
  const [balanceCard, setBalanceCard] = useState('');
  const [fuelLoading, setFuelLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [fuelResult, setFuelResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [balanceResult, setBalanceResult] = useState<{
    cardName: string; cardNumber: string; fuelType: string;
    litersLeft: number; litersUsed: number; amountUsed: number; lastUsage?: string;
  } | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  async function onReceiptPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFuelForm((f) => ({
        ...f,
        receiptFile: compressed,
        receiptPreview: ev.target?.result as string,
      }));
    };
    reader.readAsDataURL(compressed);
  }

  async function submitFueling() {
    const { cardNumber, driverName, receiptFile } = fuelForm;
    if (!cardNumber) { setFuelResult({ ok: false, msg: 'נא להזין מספר כרטיס' }); return; }
    if (!driverName) { setFuelResult({ ok: false, msg: 'נא להזין שם מתדלק' }); return; }
    if (!receiptFile) { setFuelResult({ ok: false, msg: 'נא לצלם קבלה' }); return; }

    setFuelLoading(true);
    setFuelResult(null);
    try {
      const cn = cardNumber.trim();
      // Verify the card is in the roster (and grab its fuel type for the log).
      const { data: card, error: cardErr } = await supabase
        .from('fuel_cards')
        .select('card_number, fuel_type')
        .eq('card_number', cn)
        .maybeSingle();
      if (cardErr) throw cardErr;
      if (!card) throw new Error(`כרטיס ${cn} לא קיים במערכת`);

      // Upload the receipt to Storage. Object keys must be ASCII (no Hebrew/
      // spaces), so the path is just card/timestamp — the driver name & date
      // live in the fuel_logs row. Sanitize the card number too, to be safe.
      const ext = (receiptFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const safeCard = cn.replace(/[^a-zA-Z0-9_-]/g, '_');
      const path = `${safeCard}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('fuel-receipts')
        .upload(path, receiptFile, { contentType: receiptFile.type || 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      // The stored object key stays ASCII, but the download filename carries the
      // Hebrew driver name + date so a downloaded receipt is human-readable.
      const dateStr = new Date().toLocaleDateString('he-IL').replace(/\//g, '.');
      const downloadName = `${driverName.trim()} ${dateStr}.${ext}`;
      const { data: pub } = supabase.storage
        .from('fuel-receipts')
        .getPublicUrl(path, { download: downloadName });

      // Log the fueling.
      const { error: logErr } = await supabase.from('fuel_logs').insert({
        card_number:  cn,
        fuel_type:    card.fuel_type ?? null,
        driver_name:  driverName.trim(),
        receipt_url:  pub.publicUrl,
        performed_by: profile?.id ?? null,
      });
      if (logErr) throw logErr;

      setFuelResult({ ok: true, msg: `כרטיס ${cn} · ${driverName}` });
      setFuelForm({ cardNumber: '', driverName: '', receiptFile: null, receiptPreview: null });
    } catch (e) {
      setFuelResult({ ok: false, msg: (e as Error).message });
    } finally {
      setFuelLoading(false);
    }
  }

  async function checkBalance() {
    if (!balanceCard) { setBalanceError('נא להזין מספר כרטיס'); return; }
    setBalanceLoading(true);
    setBalanceError(null);
    setBalanceResult(null);
    try {
      const card = await goodiLookup(balanceCard.trim());
      if (!card) { setBalanceError(`כרטיס ${balanceCard} לא נמצא בגודי`); return; }
      setBalanceResult({
        cardName:   card.cardName,
        cardNumber: card.cardNumber,
        fuelType:   card.fuelType,
        litersLeft: card.litersLeft,
        litersUsed: card.litersUsed,
        amountUsed: card.amountUsed,
        lastUsage:  card.lastUsage,
      });
    } catch (e) {
      setBalanceError((e as Error).message);
    } finally {
      setBalanceLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">כרטיסי תדלוק</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {(['fuel', 'balance'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-bold transition border-b-2 ${
              tab === t
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {t === 'fuel' ? '⛽ תדלוק' : '🔍 בדיקת יתרה'}
          </button>
        ))}
      </div>

      {/* Fuel tab */}
      {tab === 'fuel' && (
        <div className="space-y-3">
          <p className="text-slate-500 text-sm text-center">מלא את הפרטים לאחר תדלוק</p>
          <div className="card space-y-4">
            <div>
              <label className="label">מספר כרטיס</label>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                placeholder='לדוג׳: 1234'
                value={fuelForm.cardNumber}
                onChange={(e) => setFuelForm((f) => ({ ...f, cardNumber: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">שם המתדלק</label>
              <input
                className="input"
                type="text"
                placeholder="ישראל ישראלי"
                value={fuelForm.driverName}
                onChange={(e) => setFuelForm((f) => ({ ...f, driverName: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">קבלת תדלוק</label>
              <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-4 cursor-pointer transition ${
                fuelForm.receiptFile
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-slate-300 hover:border-slate-400'
              }`}>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={onReceiptPicked}
                />
                <p className="text-sm text-slate-500">
                  {fuelForm.receiptFile ? `✅ ${fuelForm.receiptFile.name}` : '📷 צלם קבלה / בחר תמונה'}
                </p>
              </label>
              {fuelForm.receiptPreview && (
                <img
                  src={fuelForm.receiptPreview}
                  alt="קבלה"
                  className="w-full mt-2 rounded-xl max-h-40 object-cover"
                />
              )}
            </div>
            <button
              type="button"
              onClick={submitFueling}
              disabled={fuelLoading}
              className="btn-primary w-full"
            >
              {fuelLoading ? 'שומר...' : 'אשר תדלוק'}
            </button>
          </div>

          {fuelResult && (
            <div className={`rounded-xl p-4 text-center ${
              fuelResult.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
            }`}>
              {fuelResult.ok ? (
                <>
                  <p className="text-2xl mb-1">✅</p>
                  <p className="text-emerald-700 font-bold">התדלוק נרשם בהצלחה</p>
                  <p className="text-slate-500 text-sm mt-1">{fuelResult.msg}</p>
                </>
              ) : (
                <p className="text-red-600 font-medium text-sm">{fuelResult.msg}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Balance tab */}
      {tab === 'balance' && (
        <div className="space-y-3">
          <p className="text-slate-500 text-sm text-center">הזן מספר כרטיס לבדיקת יתרת ליטרים</p>
          <div className="card space-y-4">
            <div>
              <label className="label">מספר כרטיס</label>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                placeholder='לדוג׳: 1234'
                value={balanceCard}
                onChange={(e) => setBalanceCard(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={checkBalance}
              disabled={balanceLoading}
              className="btn-primary w-full"
            >
              {balanceLoading ? 'בודק...' : 'בדוק יתרה'}
            </button>
          </div>

          {balanceError && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-center">
              <p className="text-red-600 text-sm font-medium">{balanceError}</p>
            </div>
          )}

          {balanceResult && (
            <div className="card text-center">
              <p className="text-slate-500 text-sm">{balanceResult.cardName}</p>
              <p className="text-slate-400 text-xs mb-2">מס׳ {balanceResult.cardNumber}</p>
              <p className={`text-5xl font-black leading-none my-3 ${
                balanceResult.litersLeft <= 5 ? 'text-red-500'
                : balanceResult.litersLeft <= 15 ? 'text-amber-500'
                : 'text-slate-800'
              }`}>
                {balanceResult.litersLeft.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-slate-500 text-sm mb-2">ליטרים שנותרו</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 mt-2">
                <span>שומשו: <b className="text-slate-700">{balanceResult.litersUsed.toFixed(2)} ל׳</b></span>
                <span>עלות: <b className="text-slate-700">₪{balanceResult.amountUsed.toFixed(2)}</b></span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
