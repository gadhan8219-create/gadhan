import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import type { WeaponsItem, WeaponsItemSerial } from '../../lib/database.types';

interface SerialsModal {
  item: WeaponsItem;
  rows: WeaponsItemSerial[];
  addText: string;
  busy: boolean;
  error: string | null;
}

interface EditModal {
  item: WeaponsItem;
  name: string;
  description: string;
  quantity: string;
  busy: boolean;
  error: string | null;
}

const EMPTY_FORM = { name: '', description: '', hasSerials: true, serials: '', quantity: '' };

function parseSerials(text: string): string[] {
  return [...new Set(
    text.split(/[\n,\s]+/).map((s) => s.trim()).filter(Boolean)
  )];
}

export default function WeaponsItemsPage() {
  const [items, setItems] = useState<WeaponsItem[]>([]);
  const [serialStats, setSerialStats] = useState<Record<string, { total: number; issued: number }>>({});
  const [form, setForm] = useState(EMPTY_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [serialsModal, setSerialsModal] = useState<SerialsModal | null>(null);
  const [editModal, setEditModal] = useState<EditModal | null>(null);
  const [search, setSearch] = useState('');

  async function load() {
    const [it, ser] = await Promise.all([
      supabase.from('weapons_items').select('*').order('name'),
      supabase.from('weapons_item_serials').select('item_id, assigned_to_pn'),
    ]);
    if (it.data) setItems(it.data);
    const stats: Record<string, { total: number; issued: number }> = {};
    for (const row of (ser.data ?? []) as Array<{ item_id: string; assigned_to_pn: string | null }>) {
      if (!stats[row.item_id]) stats[row.item_id] = { total: 0, issued: 0 };
      stats[row.item_id].total += 1;
      if (row.assigned_to_pn) stats[row.item_id].issued += 1;
    }
    setSerialStats(stats);
  }
  useEffect(() => { load(); }, []);

  const filtered = items.filter((i) =>
    i.name.includes(search) || (i.description ?? '').includes(search)
  );

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;

    const { data: existing } = await supabase
      .from('weapons_items')
      .select('id, name, active')
      .ilike('name', name)
      .maybeSingle();

    if (existing) {
      if (!existing.active) {
        if (!confirm(`פריט "${existing.name}" קיים אך מושבת. להפעיל מחדש?`)) return;
        await supabase.from('weapons_items').update({ active: true }).eq('id', existing.id);
        setForm(EMPTY_FORM);
        load();
        return;
      }
      alert(`פריט בשם "${existing.name}" כבר קיים.`);
      return;
    }

    const { data, error } = await supabase.from('weapons_items').insert({
      name,
      description: form.description.trim() || null,
      has_serials: form.hasSerials,
      quantity: form.hasSerials ? null : (parseInt(form.quantity) || 0),
    }).select().single();

    if (error) { alert(error.message); return; }

    if (form.hasSerials && form.serials.trim()) {
      const parsed = parseSerials(form.serials);
      if (parsed.length > 0) {
        const rows = parsed.map((s) => ({ item_id: data.id, serial_number: s }));
        const { error: se } = await supabase.from('weapons_item_serials').insert(rows);
        if (se) alert(`פריט נוצר אך הוספת הצ'ים נכשלה: ${se.message}`);
      }
    }

    setForm(EMPTY_FORM);
    load();
  }

  async function toggleActive(item: WeaponsItem) {
    setBusyId(item.id);
    try {
      await supabase.from('weapons_items').update({ active: !item.active }).eq('id', item.id);
      load();
    } finally { setBusyId(null); }
  }

  async function handleDelete(item: WeaponsItem) {
    if (!confirm(`למחוק את "${item.name}" לצמיתות?`)) return;
    setBusyId(item.id);
    try {
      const { error } = await supabase.from('weapons_items').delete().eq('id', item.id);
      if (error) alert(error.message);
      else load();
    } finally { setBusyId(null); }
  }

  async function openSerialsModal(item: WeaponsItem) {
    const { data, error } = await supabase
      .from('weapons_item_serials')
      .select('*')
      .eq('item_id', item.id)
      .order('serial_number');
    if (error) { alert(error.message); return; }
    setSerialsModal({ item, rows: data ?? [], addText: '', busy: false, error: null });
  }

  async function handleAddSerials() {
    if (!serialsModal) return;
    const parsed = parseSerials(serialsModal.addText);
    if (parsed.length === 0) {
      setSerialsModal({ ...serialsModal, error: 'הזן צ׳ אחד או יותר' });
      return;
    }
    setSerialsModal({ ...serialsModal, busy: true, error: null });
    const rows = parsed.map((s) => ({ item_id: serialsModal.item.id, serial_number: s }));
    const { error } = await supabase.from('weapons_item_serials').insert(rows);
    if (error) {
      setSerialsModal({ ...serialsModal, busy: false, error: error.message });
      return;
    }
    const { data } = await supabase
      .from('weapons_item_serials')
      .select('*')
      .eq('item_id', serialsModal.item.id)
      .order('serial_number');
    setSerialsModal({ ...serialsModal, rows: data ?? [], addText: '', busy: false, error: null });
    load();
  }

  async function handleRemoveSerial(row: WeaponsItemSerial) {
    if (!serialsModal) return;
    if (!confirm(`למחוק את הצ׳ ${row.serial_number}?`)) return;
    const { error } = await supabase.from('weapons_item_serials').delete().eq('id', row.id);
    if (error) { alert(error.message); return; }
    const { data } = await supabase
      .from('weapons_item_serials')
      .select('*')
      .eq('item_id', serialsModal.item.id)
      .order('serial_number');
    setSerialsModal({ ...serialsModal, rows: data ?? [] });
    load();
  }

  function openEdit(item: WeaponsItem) {
    setEditModal({ item, name: item.name, description: item.description ?? '', quantity: item.quantity?.toString() ?? '', busy: false, error: null });
  }

  async function handleSaveEdit() {
    if (!editModal) return;
    const name = editModal.name.trim();
    if (!name) { setEditModal({ ...editModal, error: 'חסר שם' }); return; }
    setEditModal({ ...editModal, busy: true, error: null });
    const { error } = await supabase.from('weapons_items').update({
      name,
      description: editModal.description.trim() || null,
      ...(!editModal.item.has_serials ? { quantity: parseInt(editModal.quantity) || 0 } : {}),
    }).eq('id', editModal.item.id);
    if (error) { setEditModal({ ...editModal, busy: false, error: error.message }); return; }
    setEditModal(null);
    load();
  }

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-bold mb-6">ניהול פריטי נשקיה</h2>

      {/* Add form */}
      <form onSubmit={handleAdd} className="card mb-6 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">שם פריט</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="לדוגמה: M16, אפוד, מגנזין" required />
          </div>
          <div>
            <label className="label">תיאור (אופציונלי)</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="פירוט נוסף" />
          </div>
        </div>

        <div className="flex items-center gap-3 py-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.hasSerials}
              onChange={(e) => setForm({ ...form, hasSerials: e.target.checked, serials: '', quantity: '' })}
              className="w-4 h-4 accent-emerald-600"
            />
            <span className="text-sm font-medium text-slate-700">מעקב לפי צ׳ים</span>
          </label>
          <span className="text-xs text-slate-400">
            {form.hasSerials ? 'כל יחידה תיוצג בנפרד עם מספר סידורי' : 'מעקב לפי כמות כוללת'}
          </span>
        </div>

        {form.hasSerials ? (
          <div>
            <label className="label">
              צ׳ים ראשוניים (אופציונלי)
              <span className="text-xs text-slate-500 font-normal mr-2">שורה / פסיק / רווח בין צ׳ים</span>
            </label>
            <textarea className="input min-h-[70px] font-mono text-sm" dir="ltr" placeholder={"1234567\n1234568\n1234569"} value={form.serials} onChange={(e) => setForm({ ...form, serials: e.target.value })} />
          </div>
        ) : (
          <div className="max-w-xs">
            <label className="label">כמות</label>
            <input type="number" min={0} className="input" placeholder="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" className="btn-primary">+ הוסף פריט</button>
        </div>
      </form>

      {/* List */}
      <div className="card space-y-3">
        <input className="input" placeholder="חיפוש פריט..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>שם</th>
                <th>תיאור</th>
                <th>מלאי (חתום / סה״כ)</th>
                <th>סטטוס</th>
                <th className="w-64"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center text-slate-400 py-8 text-sm">{items.length === 0 ? 'אין פריטים עדיין — הוסף את הפריט הראשון' : 'לא נמצאו תוצאות'}</td></tr>
              )}
              {filtered.map((it) => (
                <tr key={it.id} className={it.active ? '' : 'opacity-50'}>
                  <td className="font-medium">{it.name}</td>
                  <td className="text-sm text-slate-500">{it.description ?? '—'}</td>
                  <td className="text-sm">
                    {it.has_serials
                      ? (() => {
                          const s = serialStats[it.id];
                          if (!s) return <span className="text-slate-400">0 / 0</span>;
                          return (
                            <span>
                              <span className={s.issued > 0 ? 'text-amber-700 font-semibold' : 'text-slate-500'}>{s.issued}</span>
                              <span className="text-slate-400"> / {s.total}</span>
                            </span>
                          );
                        })()
                      : <span>{it.quantity ?? 0} יח׳</span>
                    }
                  </td>
                  <td>
                    <span className={`badge ${it.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {it.active ? 'פעיל' : 'מושבת'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-3 flex-wrap text-sm">
                      <button onClick={() => openEdit(it)} className="text-emerald-700 hover:text-emerald-900">ערוך</button>
                      {it.has_serials && <button onClick={() => openSerialsModal(it)} className="text-sky-700 hover:text-sky-900">נהל צ׳ים</button>}
                      <button onClick={() => toggleActive(it)} disabled={busyId === it.id} className="text-slate-600 hover:text-slate-900 disabled:opacity-50">{it.active ? 'השבת' : 'הפעל'}</button>
                      <button onClick={() => handleDelete(it)} disabled={busyId === it.id} className="text-red-600 hover:text-red-800 disabled:opacity-50">מחק</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !editModal.busy && setEditModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-bold">עריכת פריט</h3>
              <button onClick={() => setEditModal(null)} disabled={editModal.busy} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">שם</label>
                <input className="input" value={editModal.name} onChange={(e) => setEditModal({ ...editModal, name: e.target.value })} disabled={editModal.busy} />
              </div>
              <div>
                <label className="label">תיאור</label>
                <input className="input" value={editModal.description} onChange={(e) => setEditModal({ ...editModal, description: e.target.value })} disabled={editModal.busy} />
              </div>
              {!editModal.item.has_serials && (
                <div>
                  <label className="label">כמות</label>
                  <input type="number" min={0} className="input" value={editModal.quantity} onChange={(e) => setEditModal({ ...editModal, quantity: e.target.value })} disabled={editModal.busy} />
                </div>
              )}
              {editModal.error && <p className="text-sm text-red-700">{editModal.error}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditModal(null)} disabled={editModal.busy} className="btn-secondary">בטל</button>
              <button onClick={handleSaveEdit} disabled={editModal.busy} className="btn-primary">{editModal.busy ? 'שומר...' : 'שמור'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Serials modal */}
      {serialsModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSerialsModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">ניהול צ׳ים — {serialsModal.item.name}</h3>
                <p className="text-xs text-slate-500">{serialsModal.rows.length} סה״כ</p>
              </div>
              <button onClick={() => setSerialsModal(null)} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
            </div>
            <div className="mb-4">
              <label className="label">הוסף צ׳ים חדשים</label>
              <textarea className="input min-h-[70px] font-mono text-sm" dir="ltr" placeholder={"123456, 123457\n123458"} value={serialsModal.addText} onChange={(e) => setSerialsModal({ ...serialsModal, addText: e.target.value })} disabled={serialsModal.busy} />
              {serialsModal.error && <p className="text-sm text-red-700 mt-1">{serialsModal.error}</p>}
              <div className="flex justify-end mt-2">
                <button onClick={handleAddSerials} disabled={serialsModal.busy} className="btn-primary !py-1.5 !px-3 text-sm">{serialsModal.busy ? 'מוסיף...' : 'הוסף'}</button>
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg max-h-80 overflow-auto">
              {serialsModal.rows.length === 0
                ? <p className="text-sm text-slate-500 text-center py-6">אין צ׳ים רשומים עדיין</p>
                : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-right p-2 font-medium">צ׳</th>
                        <th className="w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {serialsModal.rows.map((r) => (
                        <tr key={r.id} className="border-b border-slate-100 last:border-0">
                          <td className="p-2 font-mono" dir="ltr">{r.serial_number}</td>
                          <td className="p-2 text-right">
                            <button onClick={() => handleRemoveSerial(r)} className="text-xs text-red-600 hover:text-red-800">מחק</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </div>
            <div className="flex justify-end mt-5">
              <button onClick={() => setSerialsModal(null)} className="btn-secondary">סגור</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
