import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import DocViewerModal from '../../components/DocViewerModal';
import { goodiLookup } from './fuelApi';

interface FuelCard {
  id: string;
  card_number: string;
  card_name: string | null;
  fuel_type: string | null;
  liters_left: number;
  notes: string | null;
  is_archived: boolean;
  is_empty: boolean;
  last_synced_at: string | null;
  created_at: string;
}

interface FuelLog {
  id: string;
  card_number: string;
  fuel_type: string | null;
  driver_name: string;
  receipt_url: string | null;
  created_at: string;
}

export default function DelekAdminPage() {
  const [cards, setCards] = useState<FuelCard[]>([]);
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [tab, setTab] = useState<'cards' | 'logs'>('cards');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newCard, setNewCard] = useState({ cardNumber: '', notes: '' });
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<{ path: string; title: string; name: string } | null>(null);

  function openReceipt(receipt: string, driver: string, createdAt: string) {
    const dateStr = new Date(createdAt).toLocaleDateString('he-IL').replace(/\//g, '.');
    const ext = receipt.split('.').pop()?.toLowerCase() || 'jpg';
    setViewing({ path: receipt, title: `קבלה — ${driver} ${dateStr}`, name: `${driver} ${dateStr}.${ext}` });
  }

  async function loadCards() {
    const { data } = await supabase.from('fuel_cards').select('*').order('created_at');
    if (data) setCards(data as FuelCard[]);
  }
  async function loadLogs() {
    const { data } = await supabase.from('fuel_logs').select('*').order('created_at', { ascending: false }).limit(200);
    if (data) setLogs(data as FuelLog[]);
  }
  useEffect(() => { loadCards(); loadLogs(); }, []);

  async function handleAddCard(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cn = newCard.cardNumber.trim();
    if (!cn) return;
    if (cards.some((c) => c.card_number === cn)) { setError(`כרטיס ${cn} כבר קיים`); return; }
    setAdding(true);
    try {
      const goodi = await goodiLookup(cn);
      if (!goodi) throw new Error(`כרטיס ${cn} לא נמצא בגודי`);
      const { error: insErr } = await supabase.from('fuel_cards').insert({
        card_number:    cn,
        card_name:      goodi.cardName,
        fuel_type:      goodi.fuelType,
        liters_left:    goodi.litersLeft,
        notes:          newCard.notes.trim() || null,
        last_synced_at: new Date().toISOString(),
      });
      if (insErr) throw insErr;
      setShowAdd(false);
      setNewCard({ cardNumber: '', notes: '' });
      await loadCards();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function refreshCard(c: FuelCard) {
    setBusy(c.id); setError(null);
    try {
      const goodi = await goodiLookup(c.card_number);
      if (!goodi) throw new Error(`כרטיס ${c.card_number} לא נמצא בגודי`);
      const { error: upErr } = await supabase.from('fuel_cards').update({
        card_name:      goodi.cardName,
        fuel_type:      goodi.fuelType,
        liters_left:    goodi.litersLeft,
        last_synced_at: new Date().toISOString(),
      }).eq('id', c.id);
      if (upErr) throw upErr;
      await loadCards();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function patchCard(c: FuelCard, patch: Partial<FuelCard>) {
    setBusy(c.id);
    const { error: upErr } = await supabase.from('fuel_cards').update(patch).eq('id', c.id);
    if (upErr) setError(upErr.message);
    await loadCards();
    setBusy(null);
  }

  async function deleteCard(c: FuelCard) {
    if (!confirm(`למחוק את כרטיס ${c.card_number} לצמיתות?`)) return;
    setBusy(c.id);
    const { error: delErr } = await supabase.from('fuel_cards').delete().eq('id', c.id);
    if (delErr) setError(delErr.message);
    await loadCards();
    setBusy(null);
  }

  const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('he-IL') : '—');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ניהול כרטיסי דלק</h1>
          <p className="text-slate-500 text-sm">{cards.filter((c) => !c.is_archived).length} כרטיסים פעילים</p>
        </div>
        <button type="button" onClick={() => { setShowAdd(true); setError(null); }} className="btn-primary">
          + הוסף כרטיס
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {(['cards', 'logs'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-bold transition border-b-2 ${
              tab === t ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {t === 'cards' ? 'כרטיסים' : 'יומן תדלוק'}
          </button>
        ))}
      </div>

      {/* Cards tab */}
      {tab === 'cards' && (
        <>
          {cards.length === 0 ? (
            <div className="card text-center py-16 text-slate-400">
              <p className="text-4xl mb-3"></p>
              <p className="font-medium">אין כרטיסים עדיין</p>
              <p className="text-sm mt-1">הוסף כרטיס ראשון</p>
            </div>
          ) : (
            <div className="table-wrap card p-0 overflow-hidden">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>מס׳ כרטיס</th>
                    <th>שם</th>
                    <th>סוג</th>
                    <th>נותר</th>
                    <th>סונכרן</th>
                    <th>סטטוס</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((c) => (
                    <tr key={c.id} className={c.is_archived ? 'opacity-50' : ''}>
                      <td className="font-mono font-bold">{c.card_number}</td>
                      <td>{c.card_name ?? '—'}</td>
                      <td>
                        <span className={`badge ${c.fuel_type === 'בנזין' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {c.fuel_type ?? '—'}
                        </span>
                      </td>
                      <td className={`font-bold ${c.liters_left <= 5 ? 'text-red-600' : c.liters_left <= 15 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {c.liters_left.toFixed(1)} ל׳
                      </td>
                      <td className="text-xs text-slate-500">{fmtDate(c.last_synced_at)}</td>
                      <td>
                        {c.is_archived
                          ? <span className="badge bg-slate-100 text-slate-500">בארכיון</span>
                          : c.is_empty
                            ? <span className="badge bg-red-100 text-red-700">ריק</span>
                            : <span className="badge bg-emerald-100 text-emerald-700">פעיל</span>}
                      </td>
                      <td>
                        <div className="flex gap-2 text-sm">
                          <button type="button" disabled={busy === c.id} onClick={() => refreshCard(c)}
                            className="text-blue-600 hover:text-blue-800 disabled:opacity-40" title="סנכרן מגודי">
                            {busy === c.id ? '…' : '↻'}
                          </button>
                          <button type="button" disabled={busy === c.id} onClick={() => patchCard(c, { is_empty: !c.is_empty })}
                            className="text-amber-600 hover:text-amber-800 disabled:opacity-40" title={c.is_empty ? 'בטל ריק' : 'סמן ריק'}>
                            {c.is_empty ? '⊘' : '∅'}
                          </button>
                          <button type="button" disabled={busy === c.id} onClick={() => patchCard(c, { is_archived: !c.is_archived })}
                            className="text-slate-500 hover:text-slate-700 disabled:opacity-40" title={c.is_archived ? 'שחזר' : 'העבר לארכיון'}>
                            {c.is_archived ? '' : ''}
                          </button>
                          <button type="button" disabled={busy === c.id} onClick={() => deleteCard(c)}
                            className="text-red-600 hover:text-red-800 disabled:opacity-40" title="מחק">
                            מחק
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Logs tab */}
      {tab === 'logs' && (
        logs.length === 0 ? (
          <div className="card text-center py-16 text-slate-400">
            <p className="text-4xl mb-3"></p>
            <p className="font-medium">אין תדלוקים עדיין</p>
          </div>
        ) : (
          <div className="table-wrap card p-0 overflow-hidden">
            <table className="table-base">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>מס׳ כרטיס</th>
                  <th>סוג</th>
                  <th>מתדלק</th>
                  <th>קבלה</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="text-xs text-slate-500">{new Date(l.created_at).toLocaleString('he-IL')}</td>
                    <td className="font-mono font-bold">{l.card_number}</td>
                    <td>{l.fuel_type ?? '—'}</td>
                    <td>{l.driver_name}</td>
                    <td>
                      {l.receipt_url
                        ? <button type="button" onClick={() => openReceipt(l.receipt_url!, l.driver_name, l.created_at)} className="text-blue-600 hover:text-blue-800 text-sm">צפה</button>
                        : <span className="text-slate-400 text-sm">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Add card modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800">הוסף כרטיס</h2>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>
            <p className="text-xs text-slate-500">הנתונים (שם, סוג דלק, יתרה) ייובאו אוטומטית מגודי לפי מספר הכרטיס.</p>
            <form onSubmit={handleAddCard} className="space-y-3">
              <div>
                <label className="label">מספר כרטיס</label>
                <input className="input" type="text" inputMode="numeric" placeholder="1234"
                  value={newCard.cardNumber}
                  onChange={(e) => setNewCard((c) => ({ ...c, cardNumber: e.target.value }))} required />
              </div>
              <div>
                <label className="label">הערות (אופציונלי)</label>
                <input className="input" type="text" placeholder="ג׳יפ פלוגה א׳"
                  value={newCard.notes}
                  onChange={(e) => setNewCard((c) => ({ ...c, notes: e.target.value }))} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary flex-1">ביטול</button>
                <button type="submit" disabled={adding} className="btn-primary flex-1">{adding ? 'מייבא מגודי…' : 'הוסף'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewing && (
        <DocViewerModal
          bucket="fuel-receipts"
          pathOrUrl={viewing.path}
          title={viewing.title}
          downloadName={viewing.name}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
