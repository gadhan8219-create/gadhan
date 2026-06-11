import { useState } from 'react';
import { DEMO_ITEMS, ItemsGrid, PageTitle, UiOnlyNote, WAREHOUSES, stockFor } from './shared';

export default function BunkerTransferPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [by, setBy] = useState('');
  const [values, setValues] = useState<Record<string, number>>({});

  const ready = from && to && from !== to;

  return (
    <div className="space-y-5">
      <PageTitle icon="🔄" title="העברה בין מחסנים" />
      <UiOnlyNote />

      <div className="card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">מחסן מקור</label>
            <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">— בחר מחסן —</option>
              {WAREHOUSES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">מחסן יעד</label>
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">— בחר מחסן —</option>
              {WAREHOUSES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">שם מלא</label>
            <input className="input" value={by} onChange={(e) => setBy(e.target.value)} placeholder="שם המעביר..." />
          </div>
        </div>

        {from && to && from === to && (
          <p className="text-red-600 text-sm">מחסן המקור והיעד חייבים להיות שונים</p>
        )}

        {ready ? (
          <>
            <p className="text-slate-500 text-sm">בחר פריטים וכמויות להעברה:</p>
            <ItemsGrid
              items={DEMO_ITEMS}
              values={values}
              onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))}
              stockOf={(it) => stockFor(it, from)}
            />
            <div className="flex justify-center">
              <button type="button" className="btn-primary min-w-[200px]">🔄 בצע העברה</button>
            </div>
          </>
        ) : (
          <p className="text-slate-400 text-center py-8 text-sm">יש לבחור מחסן מקור ויעד כדי להמשיך</p>
        )}
      </div>
    </div>
  );
}
