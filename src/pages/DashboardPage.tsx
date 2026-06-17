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
import {
  listVehiclesFull,
  daysUntil,
  TEST_ALERT_DAYS,
  VEHICLE_DOC_LABELS,
  type VehicleFull,
} from '../lib/vehicles';
import { supabase } from '../lib/supabase';

// A vehicle whose next-test mileage is within this many km of the current
// mileage (or already exceeded) is due for a test by kilometrage.
const MILEAGE_ALERT_KM = 5000;

/** Next-test-by-date status. */
function dateInfo(v: VehicleFull): { due: boolean; days: number | null } {
  if (v.next_test_date == null) return { due: false, days: null };
  const days = daysUntil(v.next_test_date);
  return { due: days < TEST_ALERT_DAYS, days };
}

/** Next-test-by-kilometrage status (needs both the target range and current mileage). */
function mileageInfo(v: VehicleFull): { due: boolean; remaining: number | null } {
  if (v.next_test_range == null || v.mileage == null) return { due: false, remaining: null };
  const remaining = v.next_test_range - v.mileage;
  return { due: remaining <= MILEAGE_ALERT_KM, remaining };
}

/** True when any required detail wasn't entered (matches the summary screen's red cells). */
function isIncomplete(v: VehicleFull): boolean {
  if (!v.unit_id) return true;
  if (v.next_test_date == null && v.next_test_range == null) return true;
  if (v.mileage == null) return true;
  if (v.license && VEHICLE_DOC_LABELS.some((l) => !v.documents.some((d) => d.name === l))) return true;
  return false;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  // Admin sees every unit (null); raspar is locked to its own unit.
  const scopeUnit = isAdmin ? null : (profile?.unit_id ?? '');

  const [radio, setRadio] = useState<UnitPct[]>([]);
  const [weapons, setWeapons] = useState<WeaponsUnitChecks[]>([]);
  const [attendance, setAttendance] = useState<UnitAttendance[]>([]);
  const [vehicles, setVehicles] = useState<VehicleFull[]>([]);
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
          listVehiclesFull(scopeUnit),
          supabase.from('units').select('id, name'),
        ]);
        if (cancelled) return;
        setRadio(r);
        setWeapons(w);
        setAttendance(a);
        setVehicles(veh);
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

  // Vehicles missing some detail.
  const incompleteVehicles = useMemo(
    () => vehicles.filter(isIncomplete).sort((a, b) => a.car_plate.localeCompare(b.car_plate, 'he')),
    [vehicles],
  );

  // Vehicles due for a test — by date (≤4 days / overdue) or by kilometrage
  // (within 5000 km of the next-test range). Most urgent first.
  const dueVehicles = useMemo(() => {
    const urgency = (v: VehicleFull) => {
      const vals: number[] = [];
      const di = dateInfo(v);
      const mi = mileageInfo(v);
      if (di.due) vals.push(di.days!);                 // days remaining (negative = overdue)
      if (mi.due) vals.push(mi.remaining! / 1250);     // ~km→day proxy (5000km ≈ 4)
      return vals.length ? Math.min(...vals) : Infinity;
    };
    return vehicles
      .filter((v) => dateInfo(v).due || mileageInfo(v).due)
      .sort((a, b) => urgency(a) - urgency(b));
  }, [vehicles]);

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

      {/* ── רכב: חסרי פרטים + נדרשים לבדיקה ── */}
      <div>
        <h3 className="text-lg font-semibold mb-2">רכב</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <DashSection
            title="רכבים חסרי פרטים"
            subtitle="רכבים שלא הוזנו לגביהם כל הפרטים (מסגרת / בדיקה הבאה / קילומטרג׳ / מסמכים)"
            to="/vehicles/summary"
          >
            {loading ? (
              <SkeletonRows />
            ) : incompleteVehicles.length === 0 ? (
              <div className="text-sm text-emerald-600 py-4 text-center">לכל הרכבים הוזנו כל הפרטים</div>
            ) : (
              <div className="space-y-1.5">
                {incompleteVehicles.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{v.car_plate} · {v.type_name}</span>
                    <span className="text-xs text-slate-500">{unitNames.get(v.unit_id ?? '') ?? 'ללא מסגרת'}</span>
                  </div>
                ))}
              </div>
            )}
          </DashSection>

          <DashSection
            title="רכבים נדרשים לבדיקה"
            subtitle="בדיקה הבאה בעוד פחות מ-4 ימים / באיחור, או פחות מ-5000 ק״מ לבדיקה"
            to="/vehicles/summary"
          >
            {loading ? (
              <SkeletonRows />
            ) : dueVehicles.length === 0 ? (
              <div className="text-sm text-emerald-600 py-4 text-center">אין רכבים הנדרשים לבדיקה</div>
            ) : (
              <div className="space-y-1.5">
                {dueVehicles.map((v) => {
                  const di = dateInfo(v);
                  const mi = mileageInfo(v);
                  return (
                    <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{v.car_plate} · {unitNames.get(v.unit_id ?? '') ?? '—'}</span>
                      <span className="flex gap-1 flex-wrap justify-end">
                        {di.due && (
                          <span className={`badge ${di.days! < 0 ? 'bg-red-200 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                            {di.days! < 0 ? `באיחור ${-di.days!} ימים` : di.days === 0 ? 'היום' : `בעוד ${di.days} ימים`}
                          </span>
                        )}
                        {mi.due && (
                          <span className={`badge ${mi.remaining! < 0 ? 'bg-red-200 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                            {mi.remaining! < 0 ? `חריגה ${-mi.remaining!} ק״מ` : `נותרו ${mi.remaining} ק״מ`}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </DashSection>
        </div>
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
