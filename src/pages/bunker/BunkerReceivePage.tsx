import { useState } from 'react';
import { DEMO_ITEMS, ItemsGrid, PageTitle, UiOnlyNote, WAREHOUSES } from './shared';

export default function BunkerReceivePage() {
  const [warehouse, setWarehouse] = useState('');
  const [by, setBy] = useState('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, number>>({});

  const items = DEMO_ITEMS.filter((i) => !search || i.label.includes(search));

  return (
    <div className="space-y-5">
      <PageTitle icon="📥" title="קבלת מלאי למחסן" />
      <UiOnlyNote />

      <div className="card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">מחסן</label>
            <select className="input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
              <option value="">— בחר מחסן —</option>
              {WAREHOUSES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">שם המקבל</label>
            <input className="input" value={by} onChange={(e) => setBy(e.target.value)} placeholder="שם מלא..." />
          </div>
          <div>
            <label className="label">מקור</label>
            <input className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="מאיפה הגיע המלאי..." />
          </div>
        </div>

        {warehouse ? (
          <>
            <input className="input max-w-xs" placeholder="🔍 סינון פריט..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <ItemsGrid items={items} values={values} onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))} />
            <div className="flex justify-center">
              <button type="button" className="btn-primary min-w-[200px]">📥 אשר קבלה</button>
            </div>
          </>
        ) : (
          <p className="text-slate-400 text-center py-8 text-sm">יש לבחור מחסן כדי להמשיך</p>
        )}
      </div>
    </div>
  );
}
