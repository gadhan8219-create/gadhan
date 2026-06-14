import { useEffect, useState } from 'react';
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

export default function DashboardPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  // Admin sees every unit (null); raspar is locked to its own unit.
  const scopeUnit = isAdmin ? null : (profile?.unit_id ?? '');

  const [radio, setRadio] = useState<UnitPct[]>([]);
  const [weapons, setWeapons] = useState<WeaponsUnitChecks[]>([]);
  const [attendance, setAttendance] = useState<UnitAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const today = todayISO();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [r, w, a] = await Promise.all([
          radioGreenByUnit(scopeUnit),
          weaponsChecksByUnit(scopeUnit),
          attendanceDailyByUnit(today, scopeUnit),
        ]);
        if (cancelled) return;
        setRadio(r);
        setWeapons(w);
        setAttendance(a);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeUnit]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">שלום, {profile?.full_name}</h2>
        <p className="text-slate-500 text-sm mt-1">
          {isAdmin ? 'תצוגת מנהל מערכת — כל המסגרות' : 'תצוגת רס"פ — מסגרת בלבד'}
        </p>
      </div>

      {/* ── ירוק בעיניים: קשר ── */}
      <DashSection
        title="🟢 ירוק בעיניים — קשר"
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

      {/* ── ירוק בעיניים: נשקייה ── */}
      <DashSection
        title="🟢 ירוק בעיניים — נשקייה"
        subtitle="אחוז נשקים עם ביקורת ירוק בעיניים בשבוע האחרון לפי מסגרת"
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

      {/* ── בדיקות נשק / אופטיקה ── */}
      <DashSection
        title="🔧 בדיקות נשק / אופטיקה"
        subtitle="אחוז נשקים שעברו בדיקת נשק/אופטיקה בשבוע האחרון לפי מסגרת"
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

      {/* ── סיכום נוכחות יומי ── */}
      <DashSection
        title="🧍 סיכום נוכחות יומי (דוח 1)"
        subtitle={`נכון לתאריך ${today} — אילו מסגרות דיווחו, ופירוט כמותי לפי סטטוס`}
        to="/personnel/records"
      >
        {loading ? (
          <SkeletonRows />
        ) : attendance.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-3">
            {attendance.map((u) => (
              <div key={u.unitId} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{u.unitName}</div>
                  {u.performed ? (
                    <span className="badge bg-emerald-100 text-emerald-700">דיווחה ({u.reported}/{u.totalSoldiers})</span>
                  ) : (
                    <span className="badge bg-red-100 text-red-700">
                      לא הושלם ({u.reported}/{u.totalSoldiers})
                    </span>
                  )}
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
          </div>
        )}
      </DashSection>

      {/* ── פעולות מהירות ── */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-3">פעולות מהירות</h3>
        <div className="flex gap-3 flex-wrap">
          <Link to="/personnel/attendance" className="btn-primary">🧍 דיווח דוח 1</Link>
          <Link to="/weapons/checkout" className="btn-secondary">🔫 החתמת נשק</Link>
          <Link to="/weapons/transfer" className="btn-secondary">↔️ זיכוי / העברה / אפסון</Link>
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
