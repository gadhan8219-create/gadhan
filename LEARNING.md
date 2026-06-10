# LEARNING.md — ידע מלא של gadhan-all

> CRM מאוחד לניהול: ציוד קשר (radio) · נשקים (weapons) · דלק (delek)

---

## 1. ארכיטקטורה כללית

```
React SPA (Vite + TypeScript + Tailwind)
    ↓
Supabase (Auth + PostgreSQL)
    ↓
Vercel (deploy אוטומטי מ-main)
```

**עקרון מנחה:** כל מודול עצמאי (`radio/`, `weapons/`, `delek/`) — ניתן להוסיף מודול נוסף בלי לשנות את הקיים.

---

## 2. Auth — מבנה

### Supabase Auth
- כניסה: `supabase.auth.signInWithPassword({ email, password })`
- Session נשמר ב-localStorage אוטומטית
- `AuthProvider` (src/lib/auth.tsx) מספק context לכל האפליקציה

### Profile
```typescript
// src/lib/database.types.ts
interface Profile {
  id: string;          // = auth.uid
  username: string;
  full_name: string;
  role: 'admin' | 'raspar';
  unit_id: string;
  phone: string;
  personal_number: string;
  active: boolean;
}
```

### הרשאות
| role | גישה |
|------|------|
| `admin` | כל הדפים |
| `raspar` | דפים ציבוריים (ללא דפי admin) |

### ProtectedRoute
```tsx
// דף לכל מאומת:
<ProtectedRoute><MyPage /></ProtectedRoute>

// דף למנהל בלבד:
<ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>
```

---

## 3. מודול קשר (radio) — מלא

### מצב: ✅ מלא ומחובר ל-Supabase

### Supabase Tables (radio)
| טבלה | תוכן |
|------|------|
| `profiles` | משתמשי המערכת |
| `units` | מסגרות |
| `teams` | צוותים |
| `soldiers` | חיילים |
| `items` | פריטי ציוד קשר |
| `signings` | החתמות (checkout/return/inspection) |
| `signing_items` | פריטים בהחתמה |
| `item_serials` | מספרים סידוריים |
| `unit_signings` | החתמות מסגרת |
| `unit_signing_items` | פריטי החתמות מסגרת |
| `audit_logs` | יומן ביקורת |

### Pages (radio)
| דף | נתיב | תיאור |
|----|------|--------|
| LoginPage | /login | כניסה |
| DashboardPage | / | דשבורד |
| SignFormPage | /sign | החתמה חדשה לחייל |
| SigningsPage | /signings | כל ההחתמות |
| SoldiersPage | /soldiers | ניהול חיילים |
| ItemsPage | /items | ניהול פריטים (admin) |
| LogsPage | /logs | יומן ביקורת |
| UsersPage | /users | ניהול משתמשים (admin) |
| ReportsPage | /reports | ייצוא דוחות |
| UnitSignFormPage | /unit-sign | החתמת מסגרת (admin) |
| UnitSigningsPage | /unit-signings | החתמות מסגרות (admin) |
| UnitStockReportPage | /unit-stock | דוח מלאי/בדיקות |
| SoldiersImportPage | /soldiers-import | ייבוא חיילים (admin) |

### Lib files (radio)
| קובץ | תפקיד |
|------|--------|
| `lib/supabase.ts` | Supabase client |
| `lib/auth.tsx` | AuthContext, useAuth, AuthProvider |
| `lib/database.types.ts` | TypeScript types לכל הטבלאות |
| `lib/audit.ts` | כתיבה ל-audit_logs |
| `lib/heldItems.ts` | פריטים בחזקת חיילים |
| `lib/itemHolders.ts` | מחזיקי פריט |
| `lib/itemSerials.ts` | סריאלים של פריטים |
| `lib/serialInspections.ts` | בדיקות סריאלים |
| `lib/soldiersImport.ts` | ייבוא חיילים מ-CSV |
| `lib/unitStock.ts` | מלאי מסגרות |

---

## 4. מודול נשקים (weapons) — UI בלבד

### מצב: 🔲 UI בלבד — Supabase עתידי

### רקע
הדפים הוסבו מ-gadhan (Vanilla HTML + GAS backend).
**כל קריאות ה-GAS הוסרו.**
הנתונים יחוברו ל-Supabase בשלב הבא.

### Pages (weapons)
| דף | נתיב | מקור (gadhan) | תיאור |
|----|------|---------------|--------|
| WeaponsCheckoutPage | /weapons/checkout | weapons-checkout-secure.html | קבלת נשק לחייל (58 פריטים + חתימה) |
| WeaponsInventoryPage | /weapons/inventory | weapons-inventory.html | מלאי נשקים לפי מסגרת |
| WeaponsTransferPage | /weapons/transfer | weapons-transfer.html | העברה / זיכוי / ראש-בראש |
| ArmoryCountPage | /weapons/armory | armory-count.html | ספירת מלאי פיזי (admin) |

### רשימת פריטי נשק (58 פריטים)
ראה `src/lib/weaponsItems.ts` — רשימה מלאה עם key + label.

### הערות מיגרציה
- הUIים הוסבו לקומפוננטות React
- `authClient` → `useAuth()` מ-Supabase
- כל fetch לGAS → stub (TODO: Supabase)
- חתימה דיגיטלית — נשמרת כ-base64 string

---

## 5. מודול דלק (delek) — UI בלבד

### מצב: 🔲 UI בלבד — Supabase עתידי

### רקע
הדפים הוסבו מ-gadhan-delek (Vanilla HTML + GAS backend).
**כל קריאות ה-GAS הוסרו.**

### Pages (delek)
| דף | נתיב | מקור | תיאור |
|----|------|------|--------|
| DelekPage | /delek | index.html | תדלוק + בדיקת יתרה |
| DelekAdminPage | /delek/admin | admin.html | ניהול כרטיסי דלק (admin) |

### מבנה נתונים (עתידי ב-Supabase)
```typescript
interface FuelCard {
  id: string;
  card_number: string;
  card_name: string;
  fuel_type: 'בנזין' | 'סולר';
  liters_total: number;
  liters_used: number;
  active: boolean;
}

interface FuelLog {
  id: string;
  card_id: string;
  driver_name: string;
  liters: number;
  receipt_url: string;   // Supabase Storage
  created_at: string;
  logged_by: string;
}
```

---

## 6. עיצוב — Design System

> ⚠️ **כלל עיצוב:** אל תוסיף אימוג'ים לממשק (כפתורים, כותרות, תפריט) בלי אישור מפורש מהמשתמש. הסגנון של הפרויקט הוא עסקי ורציני.

### צבעים
| שימוש | Tailwind | Hex |
|-------|----------|-----|
| Primary | `emerald-600` | #059669 |
| Primary hover | `emerald-700` | #047857 |
| Sidebar bg | `slate-900` | #0f172a |
| Sidebar text | `slate-100` | #f1f5f9 |
| Body bg | `slate-50` | #f8fafc |
| Card bg | `white` | #ffffff |

### פונט
**Heebo** — נטען מ-Google Fonts ב-index.html.

### Mobile
- Sidebar: drawer מימין (mobile) / תמידי (desktop)
- Content: `p-4 md:p-8`
- Tables: `overflow-x-auto`

### קלאסות CSS מותאמות (index.css)
```css
.btn-primary    /* emerald-600 */
.btn-secondary  /* slate-200 */
.btn-danger     /* red-600 */
.input          /* שדה קלט */
.label          /* תווית */
.card           /* כרטיס */
.badge          /* תגית */
.table-wrap     /* עטיפת טבלה */
.table-base     /* טבלה */
```

---

## 7. Layout — ניווט

### מודולים ב-Sidebar
```
📻 קשר (radio)        — /sign, /soldiers, /signings, ...
🔫 נשקים (weapons)   — /weapons/checkout, /weapons/inventory, ...
⛽ דלק (delek)        — /delek, /delek/admin
```

### ניווט מובייל
- header עליון עם כפתור hamburger
- Drawer נפתח מימין (RTL)
- נסגר אוטומטית בניווט

---

## 8. Deploy

### Vercel
- Connected to: `https://github.com/gadhan8219-create/gadhan.git`
- Branch: `main` בלבד
- Auto-deploy: כל push

### env vars ב-Vercel
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

### Build
```bash
npm run build   # tsc + vite build → dist/
```

---

## 9. מלכודות נפוצות

### Auth loading
`loading` מ-`useAuth()` כולל גם session וגם profile load.
אל תציג תוכן לפני `!loading`.

### RTL + Tailwind
Tailwind לא הופך אוטומטית. `mr-` ו-`ml-` לא מתחלפים.
השתמש ב-`space-x-reverse` כשצריך.

### env vars
רק `VITE_*` זמינים ב-browser. שאר env vars לא נחשפים.

---

## 10. היסטוריית המיגרציה

| תאריך | פעולה |
|-------|--------|
| 2026-06-10 | יצירת הפרויקט המאוחד |
| 2026-06-10 | העתקת gadhan-radio כבסיס |
| 2026-06-10 | מיגרציית UI של gadhan weapons (4 דפים) |
| 2026-06-10 | מיגרציית UI של gadhan-delek (2 דפים) |

---

*עודכן: 2026-06-10*
