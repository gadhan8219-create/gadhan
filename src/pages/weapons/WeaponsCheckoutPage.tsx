import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { WeaponsItem } from '../../lib/database.types';

interface SelectedItem {
  serial: string;   // has_serials = true
  quantity: string; // has_serials = false
}

const UNITS = ['פלוגה א', 'פלוגה ב', 'פלוגה ג', 'צמה', 'ניוד', 'מחסר', 'חפק'];

export default function WeaponsCheckoutPage() {
  const { profile } = useAuth();

  const [items, setItems] = useState<WeaponsItem[]>([]);
  // Only available (unassigned) serials per item
  const [availableSerials, setAvailableSerials] = useState<Record<string, string[]>>({});

  const [personalNumber, setPersonalNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [unit, setUnit] = useState('');
  const [selected, setSelected] = useState<Record<string, SelectedItem>>({});
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [it, ser] = await Promise.all([
      supabase.from('weapons_items').select('*').eq('active', true).order('name'),
      // Only serials that are NOT currently assigned to anyone
      supabase
        .from('weapons_item_serials')
        .select('item_id, serial_number')
        .is('assigned_to_pn', null)
        .order('serial_number'),
    ]);
    if (it.data) setItems(it.data);
    const map: Record<string, string[]> = {};
    for (const row of (ser.data ?? []) as Array<{ item_id: string; serial_number: string }>) {
      if (!map[row.item_id]) map[row.item_id] = [];
      map[row.item_id].push(row.serial_number);
    }
    setAvailableSerials(map);
  }

  useEffect(() => { load(); }, []);

  const filtered = items.filter((i) => i.name.includes(search));
  const selectedCount = Object.keys(selected).length;

  function toggle(item: WeaponsItem) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[item.id]) { delete next[item.id]; }
      else { next[item.id] = { serial: '', quantity: '1' }; }
      return next;
    });
  }

  function setSerial(id: string, val: string) {
    setSelected((prev) => ({ ...prev, [id]: { ...prev[id], serial: val } }));
  }

  function setQty(id: string, val: string) {
    setSelected((prev) => ({ ...prev, [id]: { ...prev[id], quantity: val } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!personalNumber || !fullName || !unit) {
      setError('נא למלא מספר אישי, שם מלא ומסגרת');
      return;
    }
    if (selectedCount === 0) {
      setError('נא לבחור לפחות פריט אחד');
      return;
    }

    // Validate: serial items must have a serial filled
    for (const [itemId, sel] of Object.entries(selected)) {
      const item = items.find((i) => i.id === itemId);
      if (item?.has_serials && !sel.serial.trim()) {
        setError(`נא להזין מספר סידורי עבור: ${item.name}`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const now = new Date().toISOString();
      const serialUpdates: PromiseLike<unknown>[] = [];

      for (const [itemId, sel] of Object.entries(selected)) {
        const item = items.find((i) => i.id === itemId);
        if (!item) continue;

        if (item.has_serials && sel.serial.trim()) {
          // Mark the serial as assigned
          serialUpdates.push(
            supabase
              .from('weapons_item_serials')
              .update({
                assigned_to_pn: personalNumber.trim(),
                assigned_to_name: fullName.trim(),
                assigned_at: now,
              })
              .eq('item_id', itemId)
              .eq('serial_number', sel.serial.trim())
              .then()
          );
        }
        // Quantity items: tracked separately in the future (weapons_checkouts)
      }

      await Promise.all(serialUpdates);
      setSuccess(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setPersonalNumber(''); setFullName(''); setPhone(''); setUnit('');
    setSelected({}); setSearch(''); setSuccess(false); setError(null);
    load(); // reload serials — previously assigned ones will no longer appear
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="card">
          <h2 className="text-xl font-bold text-slate-800 mb-2">הדוח נשמר בהצלחה</h2>
          <p className="text-slate-500 mb-2">{fullName} · {personalNumber}</p>
          <p className="text-slate-500 mb-6">{selectedCount} פריטים נרשמו</p>
          <button className="btn-primary" onClick={reset}>דוח חדש</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">החתמת נשק</h1>
        <p className="text-slate-500 text-sm mt-1">מבצע: {profile?.full_name}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* פרטי חייל */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-slate-700">פרטי חייל</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">מספר אישי *</label>
              <input className="input" inputMode="numeric" maxLength={7} placeholder="7 ספרות"
                value={personalNumber} onChange={(e) => setPersonalNumber(e.target.value)} required />
            </div>
            <div>
              <label className="label">שם מלא *</label>
              <input className="input" placeholder="שם פרטי ומשפחה"
                value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div>
              <label className="label">טלפון</label>
              <input className="input" type="tel" placeholder="05X-XXXXXXX"
                value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="label">מסגרת *</label>
              <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)} required>
                <option value="">בחר מסגרת</option>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* פריטים */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">פריטים</h2>
            {selectedCount > 0 && (
              <span className="badge bg-emerald-100 text-emerald-700">{selectedCount} נבחרו</span>
            )}
          </div>

          <input className="input" placeholder="חיפוש פריט..."
            value={search} onChange={(e) => setSearch(e.target.value)} />

          {items.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">טוען פריטים...</p>
          ) : (
            <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
              {filtered.map((item) => {
                const isSelected = !!selected[item.id];
                const free = availableSerials[item.id] ?? [];

                return (
                  <div key={item.id}
                    className={`rounded-lg border transition ${isSelected ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>
                    <label className="flex items-center gap-3 p-3 cursor-pointer">
                      <input type="checkbox" className="accent-emerald-600 w-4 h-4 shrink-0"
                        checked={isSelected} onChange={() => toggle(item)} />
                      <span className="text-sm font-medium text-slate-800 flex-1">{item.name}</span>
                      {item.has_serials && free.length === 0 && (
                        <span className="text-xs text-amber-600 shrink-0">כל הצ'ים משויכים</span>
                      )}
                      {item.description && (
                        <span className="text-xs text-slate-400 hidden sm:block shrink-0">{item.description}</span>
                      )}
                    </label>

                    {isSelected && (
                      <div className="px-3 pb-3">
                        {item.has_serials ? (
                          <>
                            <label className="label text-xs">מספר סידורי (צ׳)</label>
                            <input
                              className="input text-sm font-mono"
                              dir="ltr"
                              placeholder={free.length > 0 ? 'הזן או בחר מהרשימה' : 'הזן ידנית'}
                              list={`serials-${item.id}`}
                              value={selected[item.id].serial}
                              onChange={(e) => setSerial(item.id, e.target.value)}
                            />
                            {free.length > 0 && (
                              <datalist id={`serials-${item.id}`}>
                                {free.map((s) => <option key={s} value={s} />)}
                              </datalist>
                            )}
                            {free.length === 0 && (
                              <p className="text-xs text-amber-600 mt-1">אין צ'ים פנויים — הזן ידנית</p>
                            )}
                          </>
                        ) : (
                          <>
                            <label className="label text-xs">כמות</label>
                            <input type="number" min={1} className="input text-sm w-24"
                              value={selected[item.id].quantity}
                              onChange={(e) => setQty(item.id, e.target.value)} />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && items.length > 0 && (
                <p className="text-sm text-slate-400 text-center py-4">לא נמצאו פריטים</p>
              )}
            </div>
          )}
        </div>

        {/* חתימה */}
        <div className="card space-y-2">
          <h2 className="font-semibold text-slate-700">חתימה דיגיטלית</h2>
          <div className="border-2 border-dashed border-slate-300 rounded-lg h-24 flex items-center justify-center text-slate-400 text-sm">
            אזור חתימה — יצורף בשלב הבא
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm">{error}</div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'שומר...' : 'שמור דוח'}
        </button>
      </form>
    </div>
  );
}
