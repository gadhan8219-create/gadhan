import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useIdleLogout } from '../lib/useIdleLogout';

interface NavLeaf { to: string; label: string; end?: boolean; admin?: boolean }
interface NavSection { id: string; label: string; items: NavLeaf[]; admin?: boolean }

const HOME: NavLeaf = { to: '/', label: 'בית', end: true };

const SECTIONS: NavSection[] = [
  {
    id: 'radio', label: 'קשר', items: [
      { to: '/sign', label: 'החתמת קשר - חיילים' },
      { to: '/unit-sign', label: 'החתמת מסגרת', admin: true },
      { to: '/items', label: 'ניהול פריטי קשר', admin: true },
      { to: '/reports', label: 'ייצוא דוחות' },
      { to: '/unit-stock', label: 'דוח מלאי / בדיקות' },
      { to: '/unit-signings', label: 'החתמות מסגרת', admin: true },
    ],
  },
  {
    id: 'weapons', label: 'נשק', items: [
      { to: '/weapons/checkout', label: 'החתמת נשק - חיילים' },
      { to: '/weapons/transfer', label: 'העברה / זיכוי' },
      { to: '/weapons/inventory', label: 'סיכום נשקייה' },
      { to: '/weapons/armory', label: 'ניהול פריטי נשקיה', admin: true },
    ],
  },
  {
    id: 'delek', label: 'דלק', items: [
      { to: '/delek', label: 'תדלוק', end: true },
      { to: '/delek/admin', label: 'ניהול כרטיסי דלק', admin: true },
    ],
  },
  {
    id: 'bunker', label: 'בונקר', items: [
      { to: '/bunker/inventory', label: 'מלאי', admin: true },
      { to: '/bunker/receive', label: 'קבלות', admin: true },
      { to: '/bunker/dispense', label: 'ניפוק', admin: true },
      { to: '/bunker/credit', label: 'זיכוי', admin: true },
      { to: '/bunker/transfer', label: 'העברה', admin: true },
      { to: '/bunker/regulate', label: 'וויסותים', admin: true },
      { to: '/bunker/shatsal', label: 'שצ״ל' },
      { to: '/bunker/summary', label: 'סיכום' },
    ],
  },
  {
    id: 'personnel', label: 'שלישות', items: [
      { to: '/personnel/attendance', label: 'דיווח נוכחות (דוח 1)' },
      { to: '/personnel/records', label: 'דוחות' },
    ],
  },
  {
    id: 'vehicles', label: 'רכב', items: [
      { to: '/vehicles/manage', label: 'ניהול כלי רכב' },
      { to: '/vehicles/summary', label: 'סיכום רכבים' },
    ],
  },
  {
    id: 'maneuver', label: 'תמרון', items: [
      { to: '/maneuver/requirements', label: 'דרישות תמרון' },
      { to: '/maneuver/entries', label: 'כניסות / יציאות' },
      { to: '/maneuver/work', label: 'משטח עבודה' },
    ],
  },
  {
    id: 'admin', label: '⚙️ ניהול מערכת', admin: true, items: [
      { to: '/soldiers-import', label: 'ייבוא חיילים' },
      { to: '/soldiers', label: 'רשימת חיילים' },
      { to: '/users', label: 'ניהול משתמשים' },
    ],
  },
];

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `block rounded-lg px-3 py-1.5 text-sm transition ${
    isActive ? 'bg-emerald-700 text-white' : 'text-slate-300 hover:bg-slate-800'
  }`;
}

function sectionOf(path: string): string | null {
  for (const s of SECTIONS) {
    if (s.items.some((i) => (i.end ? path === i.to : path === i.to || path.startsWith(i.to + '/') || path.startsWith(i.to)))) {
      return s.id;
    }
  }
  return null;
}

export default function Layout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = profile?.role === 'admin';

  // Auto sign-out after 30 minutes of inactivity.
  useIdleLogout();

  const [open, setOpen] = useState<string | null>(() => sectionOf(location.pathname));
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Keep the section containing the active route expanded as the user navigates.
  useEffect(() => {
    const active = sectionOf(location.pathname);
    if (active) setOpen(active);
    setDrawerOpen(false);
  }, [location.pathname]);

  const sections = SECTIONS.filter((s) => !s.admin || isAdmin);

  return (
    <div className="min-h-screen md:flex">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-slate-900 text-slate-100 px-4 py-3">
        <button
          type="button"
          aria-label="פתח תפריט"
          onClick={() => setDrawerOpen(true)}
          className="p-2 -m-2 rounded-lg hover:bg-slate-800"
        >
          <span className="block w-6 h-0.5 bg-current mb-1.5"></span>
          <span className="block w-6 h-0.5 bg-current mb-1.5"></span>
          <span className="block w-6 h-0.5 bg-current"></span>
        </button>
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="גדחה״ן" className="w-8 h-8 object-contain rounded" />
          <span className="text-sm">גדחה״ן CRM</span>
        </div>
      </header>

      {drawerOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setDrawerOpen(false)} aria-hidden />
      )}

      <aside className={`
        bg-slate-900 text-slate-100 flex flex-col
        fixed inset-y-0 right-0 w-64 z-50 transform transition-transform
        ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}
        md:static md:translate-x-0 md:w-60 md:z-auto
      `}>
        <div className="px-5 py-5 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="גדחה״ן" className="w-10 h-10 object-contain rounded" />
            <p className="text-xs text-slate-400">מערכת ניהול גדחה״ן</p>
          </div>
          <button type="button" aria-label="סגור תפריט" onClick={() => setDrawerOpen(false)}
            className="md:hidden text-slate-400 hover:text-white text-2xl leading-none px-2">×</button>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {/* Home */}
          <NavLink to={HOME.to} end={HOME.end}
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800'
              }`}>
            {HOME.label}
          </NavLink>

          {/* Accordion sections */}
          {sections.map((section) => {
            const items = section.items.filter((i) => !i.admin || isAdmin);
            if (items.length === 0) return null;
            const isOpen = open === section.id;
            const active = section.id === sectionOf(location.pathname);
            return (
              <div key={section.id}>
                <button type="button"
                  onClick={() => setOpen((o) => (o === section.id ? null : section.id))}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    active ? 'text-emerald-400' : 'text-slate-200 hover:bg-slate-800'
                  }`}>
                  <span>{section.label}</span>
                  <span className="text-xs">{isOpen ? '▾' : '◂'}</span>
                </button>
                {isOpen && (
                  <div className="mt-1 mr-2 space-y-0.5">
                    {items.map((i) => (
                      <NavLink key={i.to} to={i.to} end={i.end} className={navLinkClass}>{i.label}</NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-slate-800 text-sm">
          <div className="font-medium">{profile?.full_name}</div>
          <div className="text-xs text-slate-400 mb-3">{profile?.role === 'admin' ? 'מנהל מערכת' : 'רס"פ'}</div>
          <div className="flex gap-3">
            <button onClick={() => { setDrawerOpen(false); navigate('/change-password'); }}
              className="text-xs text-slate-300 hover:text-white">שנה סיסמה</button>
            <button onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
              className="text-xs text-slate-300 hover:text-white">התנתק</button>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
