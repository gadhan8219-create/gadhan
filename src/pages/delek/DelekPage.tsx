import { useState } from 'react';

type Tab = 'fuel' | 'balance';

interface FuelForm {
  cardNumber: string;
  driverName: string;
  receiptFile: File | null;
  receiptPreview: string | null;
}

export default function DelekPage() {
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

  function onReceiptPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFuelForm((f) => ({
        ...f,
        receiptFile: file,
        receiptPreview: ev.target?.result as string,
      }));
    };
    reader.readAsDataURL(file);
  }

  async function submitFueling() {
    const { cardNumber, driverName, receiptFile } = fuelForm;
    if (!cardNumber) { setFuelResult({ ok: false, msg: 'נא להזין מספר כרטיס' }); return; }
    if (!driverName) { setFuelResult({ ok: false, msg: 'נא להזין שם מתדלק' }); return; }
    if (!receiptFile) { setFuelResult({ ok: false, msg: 'נא לצלם קבלה' }); return; }

    setFuelLoading(true);
    setFuelResult(null);
    // TODO: Supabase Storage + log
    await new Promise((r) => setTimeout(r, 1000));
    setFuelResult({ ok: true, msg: `כרטיס ${cardNumber} · ${driverName}` });
    setFuelForm({ cardNumber: '', driverName: '', receiptFile: null, receiptPreview: null });
    setFuelLoading(false);
  }

  async function checkBalance() {
    if (!balanceCard) { setBalanceError('נא להזין מספר כרטיס'); return; }
    setBalanceLoading(true);
    setBalanceError(null);
    setBalanceResult(null);
    // TODO: Supabase
    await new Promise((r) => setTimeout(r, 700));
    setBalanceError('חיבור ל-Supabase טרם הוגדר — בשלב הבא');
    setBalanceLoading(false);
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
