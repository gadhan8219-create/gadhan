// Shared presentational helpers + placeholder data for the Bunker (בונקר) UI.
// This module is UI-only — no backend wiring yet. The demo data exists purely
// so the screens render with realistic structure.

export const WAREHOUSES = [
  { value: 'נפתלי', label: 'מחסן א — נפתלי' },
  { value: 'בילו',  label: 'מחסן ב — בילו' },
];

export const UNITS = ['פלוגה א', 'פלוגה ב', 'פלוגה ג', 'צמה', 'ניוד', 'מחסר', 'חפק'];

export interface BunkerStock {
  key: string;
  label: string;
  nafatli: number;
  bilo: number;
}

// Placeholder inventory — replace with live data when the backend is wired.
export const DEMO_STOCK: BunkerStock[] = [
  { key: '5.56',        label: 'כדור 5.56',        nafatli: 12000, bilo: 8400 },
  { key: '7.62',        label: 'כדור 7.62',        nafatli: 4200,  bilo: 3100 },
  { key: '0.5',         label: 'כדור 0.5',         nafatli: 900,   bilo: 0 },
  { key: 'rimon-reses', label: 'רימון רסס',        nafatli: 140,   bilo: 60 },
  { key: 'rimon-ashan', label: 'רימון עשן',        nafatli: 80,    bilo: 35 },
  { key: 'rimon-hade',  label: 'רימון הלם',        nafatli: 50,    bilo: 20 },
  { key: 'matol',       label: 'מטול לאו',          nafatli: 18,    bilo: 6 },
  { key: 'mag',         label: 'מחסנית מאג',        nafatli: 220,   bilo: 110 },
  { key: 'maglan',      label: 'מחסנית M16',       nafatli: 600,   bilo: 380 },
  { key: 'flares',      label: 'נורי תאורה',        nafatli: 95,    bilo: 40 },
];

export interface BunkerItem { key: string; label: string; }
export const DEMO_ITEMS: BunkerItem[] = DEMO_STOCK.map(({ key, label }) => ({ key, label }));

export function stockFor(item: BunkerItem, warehouse: string): number {
  const s = DEMO_STOCK.find((x) => x.key === item.key);
  if (!s) return 0;
  if (warehouse === 'נפתלי') return s.nafatli;
  if (warehouse === 'בילו')  return s.bilo;
  return s.nafatli + s.bilo;
}

// ── Reusable presentational pieces ───────────────────────────────────────────

export function PageTitle({ icon, title, subtitle }: { icon?: string; title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{icon ? `${icon} ` : ''}{title}</h1>
      {subtitle && <p className="text-slate-500 text-sm mt-0.5">{subtitle}</p>}
    </div>
  );
}

export function UiOnlyNote() {
  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800">
      ממשק תצוגה בלבד — טרם חובר למסד הנתונים.
    </div>
  );
}

// Live stock-aware grid backed by real items. Shows the available quantity and
// (when `cap`) limits the entered amount to it. Used by dispense (capped) and
// credit (uncapped — over-return is allowed).
export interface LiveItem { id: string; name: string; available: number }

interface LiveItemsGridProps {
  items: LiveItem[];
  values: Record<string, number>;
  onChange: (id: string, val: number) => void;
  cap?: boolean;
  accent?: 'emerald' | 'red';
}

export function LiveItemsGrid({ items, values, onChange, cap, accent = 'emerald' }: LiveItemsGridProps) {
  const accentText = accent === 'red' ? 'text-red-600' : 'text-emerald-600';
  if (items.length === 0) {
    return <p className="text-slate-400 text-sm text-center py-6">אין פריטים זמינים</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((it) => (
        <div key={it.id} className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">{it.name}</span>
          <span className="text-xs text-slate-400">
            זמין: <b className={it.available > 0 ? 'text-emerald-600' : 'text-slate-400'}>{it.available.toLocaleString('he-IL')}</b>
          </span>
          <input
            type="number"
            min={0}
            max={cap ? it.available : undefined}
            value={values[it.id] ?? ''}
            onChange={(e) => {
              let v = parseInt(e.target.value) || 0;
              if (v < 0) v = 0;
              if (cap && v > it.available) v = it.available;
              onChange(it.id, v);
            }}
            placeholder="0"
            className={`input text-center font-bold ${accentText}`}
          />
        </div>
      ))}
    </div>
  );
}

// History page-size controls: a "how many to display" selector plus a
// "show more" button. Shared by every bunker log screen (dispense, credit,
// transfer, shatsal, receive, regulate).
const HISTORY_SIZES = [5, 10, 20, 50, 100];

interface HistoryControlsProps {
  limit: number;
  onLimitChange: (n: number) => void;
  count: number;
  label?: string;
}

export function HistoryControls({ limit, onLimitChange, count, label = 'פעולות' }: HistoryControlsProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <label className="flex items-center gap-2 text-sm text-slate-500">
        כמות {label} להצגה:
        <select
          className="input !w-auto !py-1 !px-2"
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
        >
          {HISTORY_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      {count >= limit && (
        <button type="button" onClick={() => onLimitChange(limit + 5)} className="btn-secondary">
          הצג עוד
        </button>
      )}
    </div>
  );
}

interface ItemsGridProps {
  items: BunkerItem[];
  values: Record<string, number>;
  onChange: (key: string, val: number) => void;
  stockOf?: (item: BunkerItem) => number;
  accent?: 'emerald' | 'red' | 'amber';
}

export function ItemsGrid({ items, values, onChange, stockOf, accent = 'emerald' }: ItemsGridProps) {
  const accentText =
    accent === 'red' ? 'text-red-600' : accent === 'amber' ? 'text-amber-600' : 'text-emerald-600';
  if (items.length === 0) {
    return <p className="text-slate-400 text-sm text-center py-6">לא נמצאו פריטים</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((it) => {
        const stock = stockOf?.(it);
        const disabled = stock === 0;
        return (
          <div key={it.key} className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">{it.label}</span>
            {stockOf && (
              <span className="text-xs text-slate-400">
                זמין: <b className={stock! > 0 ? 'text-emerald-600' : 'text-slate-400'}>{stock}</b>
              </span>
            )}
            <input
              type="number"
              min={0}
              max={stock}
              value={values[it.key] ?? ''}
              disabled={disabled}
              onChange={(e) => onChange(it.key, parseInt(e.target.value) || 0)}
              placeholder="0"
              className={`input text-center font-bold ${accentText} disabled:opacity-40`}
              title={disabled ? 'אין מלאי' : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
