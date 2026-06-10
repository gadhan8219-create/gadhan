import { useState } from 'react';

interface FuelCard {
  id: string;
  cardNumber: string;
  cardName: string;
  fuelType: 'בנזין' | 'סולר';
  litersTotal: number;
  litersUsed: number;
  active: boolean;
}

// TODO: טעינה מ-Supabase
const MOCK_CARDS: FuelCard[] = [];

export default function DelekAdminPage() {
  const [cards] = useState<FuelCard[]>(MOCK_CARDS);
  const [showAdd, setShowAdd] = useState(false);
  const [newCard, setNewCard] = useState({
    cardNumber: '',
    cardName: '',
    fuelType: 'בנזין' as 'בנזין' | 'סולר',
    litersTotal: '',
  });
  const [tab, setTab] = useState<'cards' | 'logs'>('cards');

  async function handleAddCard(e: React.FormEvent) {
    e.preventDefault();
    // TODO: Supabase insert
    setShowAdd(false);
    setNewCard({ cardNumber: '', cardName: '', fuelType: 'בנזין', litersTotal: '' });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ניהול כרטיסי דלק</h1>
          <p className="text-slate-500 text-sm">{cards.length} כרטיסים פעילים</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="btn-primary"
        >
          + הוסף כרטיס
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {(['cards', 'logs'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-bold transition border-b-2 ${
              tab === t
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {t === 'cards' ? '💳 כרטיסים' : '📋 יומן תדלוק'}
          </button>
        ))}
      </div>

      {/* Cards tab */}
      {tab === 'cards' && (
        <>
          {cards.length === 0 ? (
            <div className="card text-center py-16 text-slate-400">
              <p className="text-4xl mb-3">⛽</p>
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
                    <th>שומשו</th>
                    <th>סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((c) => {
                    const left = c.litersTotal - c.litersUsed;
                    const pct = c.litersTotal > 0 ? (left / c.litersTotal) * 100 : 0;
                    return (
                      <tr key={c.id}>
                        <td className="font-mono font-bold">{c.cardNumber}</td>
                        <td>{c.cardName}</td>
                        <td>
                          <span className={`badge ${
                            c.fuelType === 'בנזין' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {c.fuelType}
                          </span>
                        </td>
                        <td className={`font-bold ${pct <= 20 ? 'text-red-600' : pct <= 40 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {left.toFixed(1)} ל׳
                        </td>
                        <td className="text-slate-500">{c.litersUsed.toFixed(1)} ל׳</td>
                        <td>
                          <span className={`badge ${c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {c.active ? 'פעיל' : 'לא פעיל'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Logs tab */}
      {tab === 'logs' && (
        <div className="card text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium">יומן תדלוק</p>
          <p className="text-sm mt-1">יחובר ל-Supabase בשלב הבא</p>
        </div>
      )}

      {/* Add card modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800">הוסף כרטיס</h2>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleAddCard} className="space-y-3">
              <div>
                <label className="label">מספר כרטיס</label>
                <input className="input" type="text" inputMode="numeric" placeholder="1234"
                  value={newCard.cardNumber}
                  onChange={(e) => setNewCard((c) => ({ ...c, cardNumber: e.target.value }))} required />
              </div>
              <div>
                <label className="label">שם / תיאור</label>
                <input className="input" type="text" placeholder="ג׳יפ 1234"
                  value={newCard.cardName}
                  onChange={(e) => setNewCard((c) => ({ ...c, cardName: e.target.value }))} required />
              </div>
              <div>
                <label className="label">סוג דלק</label>
                <select className="input" value={newCard.fuelType}
                  onChange={(e) => setNewCard((c) => ({ ...c, fuelType: e.target.value as 'בנזין' | 'סולר' }))}>
                  <option value="בנזין">בנזין</option>
                  <option value="סולר">סולר</option>
                </select>
              </div>
              <div>
                <label className="label">מכסה בליטרים</label>
                <input className="input" type="number" min={0} placeholder="200"
                  value={newCard.litersTotal}
                  onChange={(e) => setNewCard((c) => ({ ...c, litersTotal: e.target.value }))} required />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary flex-1">ביטול</button>
                <button type="submit" className="btn-primary flex-1">הוסף</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
