import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { todayISO } from '../lib/attendance';
import {
  radioGreenByUnit,
  weaponsChecksByUnit,
  attendanceDailyByUnit,
  type UnitPct,
  type WeaponsUnitChecks,
  type UnitAttendance,
} from '../lib/dashboard';
import { listVehiclesDueForTest, daysUntil, type Vehicle } from '../lib/vehicles';
import { supabase } from '../lib/supabase';

export default function DashboardPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  // Admin sees every unit (null); raspar is locked to its own unit.
  const scopeUnit = isAdmin ? null : (profile?.unit_id ?? '');

  const [radio, setRadio] = useState<UnitPct[]>([]);
  const [weapons, setWeapons] = useState<WeaponsUnitChecks[]>([]);
  const [attendance, setAttendance] = useState<UnitAttendance[]>([]);
  const [vehiclesDue, setVehiclesDue] = useState<Vehicle[]>([]);
  const [unitNames, setUnitNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const today = todayISO();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [r, w, a, veh, units] = await Promise.all([
          radioGreenByUnit(scopeUnit),
          weaponsChecksByUnit(scopeUnit),
          attendanceDailyByUnit(today, scopeUnit),
          listVehiclesDueForTest(scopeUnit),
          supabase.from('units').select('id, name'),
        ]);
        if (cancelled) return;
        setRadio(r);
        setWeapons(w);
        setAttendance(a);
        setVehiclesDue([...veh].sort((x, y) => daysUntil(x.next_test_date!) - daysUntil(y.next_test_date!)));
        setUnitNames(new Map(((units.data ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name])));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeUnit]);

  // Reported units first, then the ones that didn't complete.
  const attendanceSorted = useMemo(
    () =>
      [...attendance].sort((a, b) => {
        if (a.performed !== b.performed) return a.performed ? -1 : 1;
        return a.unitName.localeCompare(b.unitName, 'he');
      }),
    [attendance],
  );
  const completed = attendanceSorted.filter((u) => u.performed);
  const notCompleted = attendanceSorted.filter((u) => !u.performed);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">שלום, {profile?.full_name}</h2>
        <p className="text-slate-500 text-sm mt-1">
          {isAdmin ? 'תצוגת מנהל מערכת — כל המסגרות' : 'תצוגת רס"פ — מסגרת בלבד'}
        </p>
      </div>

      {/* ── פעולות מהירות ── */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-3">פעולות מהירות</h3>
        <div className="flex gap-3 flex-wrap">
          <Link to="/personnel/attendance" className="btn-primary">דיווח דוח 1</Link>
          <Link to="/personnel/records" className="btn-secondary">ייצוא דוח 1</Link>
          <Link to="/weapons/checkout" className="btn-secondary">החתמת נשק</Link>
          <Link to="/weapons/transfer" className="btn-secondary">זיכוי / העברה / אפסון</Link>
          <Link to="/bunker/shatsal" className="btn-secondary">דיווח שצ"ל</Link>
        </div>
      </div>

      {/* ── נשק: ירוק בעיניים + בדיקות, זה ליד זה ── */}
      <div>
        <h3 className="text-lg font-semibold mb-2">נשק</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <DashSection
            title="ירוק בעיניים"
            subtitle="אחוז נשקים עם ביקורת בשבוע האחרון לפי מסגרת"
            to="/weapons/inventory"
          >
            {loading ? (
              <SkeletonRows />
            ) : weapons.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-2">
                {weapons.map((u) => (
                  <PctBar key={u.unitId} label={u.unitName} pct={u.greenPct} detail={`${u.greenOk}/${u.total}`} />
                ))}
              </div>
            )}
          </DashSection>

          <DashSection
            title="בדיקות נשק / אופטיקה"
            subtitle="אחוז נשקים שעברו בדיקה בשבוע האחרון לפי מסגרת"
            to="/weapons/inventory"
          >
            {loading ? (
              <SkeletonRows />
            ) : weapons.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-2">
                {weapons.map((u) => (
                  <PctBar key={u.unitId} label={u.unitName} pct={u.weaponPct} detail={`${u.weaponOk}/${u.total}`} />
                ))}
              </div>
            )}
          </DashSection>
        </div>
      </div>

      {/* ── קשר: ירוק בעיניים ── */}
      <div>
        <h3 className="text-lg font-semibold mb-2">קשר</h3>
        <DashSection
          title="ירוק בעיניים"
          subtitle="אחוז ציוד קשר שנבדק בשבוע האחרון לפי מסגרת"
          to="/unit-stock"
        >
          {loading ? (
            <SkeletonRows />
          ) : radio.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-2">
              {radio.map((u) => (
                <PctBar key={u.unitId} label={u.unitName} pct={u.pct} detail={`${u.ok}/${u.total}`} />
              ))}
            </div>
          )}
        </DashSection>
      </div>

      {/* ── שלישות: סיכום נוכחות יומי ── */}
      <div>
        <h3 className="text-lg font-semibold mb-2">שלישות</h3>
        <DashSection
          title="סיכום נוכחות יומי (דוח 1)"
          subtitle={`נכון לתאריך ${today} — מסגרות שדיווחו, ומסגרות שטרם השלימו`}
          to="/personnel/records"
        >
          {loading ? (
            <SkeletonRows />
          ) : attendanceSorted.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-3">
              {completed.map((u) => (
                <div key={u.unitId} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{u.unitName}</div>
                    <span className="badge bg-emerald-100 text-emerald-700">דיווחה ({u.reported}/{u.totalSoldiers})</span>
                  </div>
                  {u.byStatus.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {u.byStatus.map((s) => (
                        <span key={s.status} className="badge bg-sky-50 text-sky-700">
                          {s.status}: <b className="mr-1">{s.count}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {notCompleted.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="text-sm font-semibold text-red-700 mb-1">לא הושלם</div>
                  <div className="flex flex-wrap gap-2">
                    {notCompleted.map((u) => (
                      <span key={u.unitId} className="badge bg-red-100 text-red-700">
                        {u.unitName} ({u.reported}/{u.totalSoldiers})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DashSection>
      </div>

      {/* ── רכב: בדיקות קרובות ── */}
      <div>
        <h3 className="text-lg font-semibold mb-2">רכב</h3>
        <DashSection
          title="רכבים נדרשים לבדיקה"
          subtitle="רכבים שבדיקתם הבאה בעוד פחות מ-4 ימים (או באיחור)"
          to="/vehicles/military"
        >
          {loading ? (
            <SkeletonRows />
          ) : vehiclesDue.length === 0 ? (
            <div className="text-sm text-emerald-600 py-4 text-center">אין רכבים הנדרשים לבדיקה בימים הקרובים</div>
          ) : (
            <div className="space-y-1.5">
              {vehiclesDue.map((v) => {
                const d = daysUntil(v.next_test_date!);
                return (
                  <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{v.car_plate} · {unitNames.get(v.unit_id ?? '') ?? '—'}</span>
                    <span className={`badge ${d < 0 ? 'bg-red-200 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                      {d < 0 ? `באיחור ${-d} ימים` : d === 0 ? 'היום' : `בעוד ${d} ימים`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </DashSection>
      </div>
    </div>
  );
}

function DashSection({
  title,
  subtitle,
  to,
  children,
}: {
  title: string;
  subtitle: string;
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link to={to} className="card block hover:ring-2 hover:ring-sky-200 transition">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <span className="text-sky-600 text-sm whitespace-nowrap">לדוח ←</span>
      </div>
      {children}
    </Link>
  );
}

function PctBar({ label, pct, detail }: { label: string; pct: number; detail: string }) {
  const color = pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-slate-500">
          <b className="text-slate-800">{pct}%</b> <span className="text-xs">({detail})</span>
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-6 rounded bg-slate-100" />
      ))}
    </div>
  );
}

function Empty() {
  return <div className="text-sm text-slate-400 py-4 text-center">אין נתונים להצגה</div>;
}
