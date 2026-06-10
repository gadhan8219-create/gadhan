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

## 4. מודול נשקים (weapons) — מחובר ✅

### מצב: ✅ מחובר ל-Supabase + Drive PDF

---

### Supabase Tables (weapons)
| טבלה | תוכן |
|------|------|
| `weapons_items` | פריטי נשק (id, name, has_serials, quantity, active) |
| `weapons_item_serials` | מספרים סידוריים (assigned_to_pn, assigned_to_name, assigned_at, is_zeroed, zeroed_at) |

**כלל בסיסי:** `assigned_to_pn IS NULL` = זמין | `NOT NULL` = חתום לחייל

---

### Edge Function — יצירת PDF
**שם:** `generate-weapon-checkout-pdf`

> ⚠️ **PDF נוצר ב-GAS מ-HTML, לא ב-pdf-lib.** ה-edge function בונה מחרוזת HTML (RTL)
> ושולח ל-GAS דרך action `savePdfFromHtml`. ה-GAS ממיר ל-PDF עם
> `Utilities.newBlob(html, 'text/html').getAs('application/pdf')` — מנוע ה-HTML של Google
> תומך BiDi מלא, ולכן עברית + מספרים (טלפון/תאריך/צ׳) יוצאים תקין.
> **רקע:** pdf-lib הפך ספרות בטקסט RTL (טלפון 0504484377 → 7734844050). HTML→PDF פתר את זה.

**Secrets נדרשים:**
```
GAS_PDF_URL                      — כתובת GAS web-app לשמירת PDF ב-Drive
GAS_PDF_SECRET                   — WEBHOOK_SECRET (GAS Script Property)
WEAPONS_CHECKOUT_DRIVE_FOLDER_ID — Root folder ID ב-Drive
```

**POST body:**
```typescript
{
  title: string;             // 'החתמת נשק' | 'זיכוי נשק' | 'סיכום נשק בהחזקה'
  note?: string;             // subtitle אפשרי
  soldier: { full_name, personal_number, phone?, unit_name, team_name? };
  items: [{ name, quantity, serial? }];
  performed_by: string;
  timestamp: string;         // ISO-8601
  signature_png_b64?: string; // base64 PNG ללא data: prefix
  drive_path: string[];      // e.g. ['נשקיה', 'מסגרת א', 'החתמות']
  filename: string;          // 'שם החייל.pdf'
}
```

**מבנה Drive:** `ROOT/נשקיה/{unit_name}/החתמות|זיכויים/{soldier_name}.pdf`
- החתמות: PDF החתמת נשק לחייל — נוצר/מוחלף בכל החתמה
- זיכויים: PDF זיכוי — נוצר/מוחלף בכל זיכוי
- אם זיכוי חלקי: גם `החתמות/{soldier_name}.pdf` מתעדכן עם הפריטים שנותרו

**GAS web-app (proxy לDrive):**
```
URL: https://script.google.com/macros/s/AKfycbyCg1GFpHOL67VKG0kEPB51C4sBT1WW4XLZYX8PZQZZbuNUAp_kr05Y09z00d2-B4MX/exec
```
actions: `savePdf` (pdfBase64) | `savePdfFromHtml` (html → PDF) | `sendErrorEmail`
ה-GAS רץ תחת חשבון המשתמש ← אין בעיית Drive quota (SA quota = 0)

**שגיאות — אימייל אוטומטי:**
אם edge function נכשל → קוראת `sendErrorEmail` ל-GAS → `MailApp.sendEmail('gadhan8219@gmail.com', ...)`.
ה-GAS עצמו גם שולח מייל ב-catch של `savePdf`.

---

### PDF — זרימה אסינכרונית (Fire-and-Forget)
**עיקרון:** DB update קודם, PDF בלי await.
```typescript
// ✅ נכון — הצלחה מוצגת מיד אחרי DB
await dbUpdate();
setSuccess(true);             // UI מיד
fetch(fnUrl, { ... })         // בלי await
  .then(r => r.json())
  .then(r => { if (r.ok) setPdfUrl(r.url); })
  .catch(() => {});            // שגיאה → מייל מה-backend

// ❌ שגוי — לחכות לPDF לפני הצלחה
const result = await fetch(fnUrl, { ... });
setSuccess(true); // המשתמש מחכה לDrive
```

---

### Pages (weapons)
| דף | נתיב | תיאור |
|----|------|--------|
| WeaponsCheckoutPage | /weapons/checkout | החתמת נשק לחייל — חייל קיים/חדש, בחירת פריטים, SerialPicker, חתימת canvas, PDF ל-Drive |
| WeaponsTransferPage | /weapons/transfer | זיכוי / העברה / ראש-בראש / איפסון |
| WeaponsInventoryPage | /weapons/inventory | מלאי נשקים לפי מסגרת |
| ArmoryCountPage | /weapons/armory | ספירת מלאי פיזי (admin) |

---

### WeaponsCheckoutPage — פרטים
- **SerialPicker** — dropdown מסונן מרשימת `weapons_item_serials` (available = `assigned_to_pn IS NULL`). מונע הזנת צ׳ שלא ברשימה.
- **SignaturePad** — canvas 600×140px עם forwardRef + useImperativeHandle. `isEmpty()` / `toDataUrl()` / `clear()`.
- **פריטים מוטענים מראש** — חייל עם פריטים חתומים → מופיעים disabled ב-"בהחזקה".
- **שליחה:** DB ← assign serials → success מיד → PDF fire-and-forget.

---

### WeaponsTransferPage — פרטים
| טאב | פעולה | DB |
|-----|-------|-----|
| זיכוי חייל | בחר פריטים → זכה | clear assigned_to_pn + PDF אסינכרוני |
| זיכוי פריט | בחר צ׳ ספציפי | clear assigned_to_pn + PDF אסינכרוני |
| העברה | src → dst (אותה מסגרת) | update assigned_to_pn |
| ראש בראש | החלפת פריטים בין 2 חיילים | 2× update |
| איפסון | סמן is_zeroed=true | update is_zeroed + zeroed_at |

**זיכוי + PDF אסינכרוני:**
```typescript
// 1. DB update מיד
await supabase.from('weapons_item_serials').update({ assigned_to_pn: null, ... }).in('id', ids);
setSuccess('...');
await loadAll(); resetForms();

// 2. PDFs בלי await
callPdfFn({ title: 'זיכוי נשק', ... }).then(async () => {
  const remaining = await supabase.from('weapons_item_serials')...;
  if (remaining?.length > 0) callPdfFn({ title: 'סיכום נשק בהחזקה', ... }); // partial
}).catch(() => {});
```

---

### callPdfFn — helper ב-WeaponsTransferPage
```typescript
async function callPdfFn(args: PdfCallArgs): Promise<string> {
  // POST ל-generate-weapon-checkout-pdf עם Bearer token
  // מחזיר result.url (Drive link)
}
interface PdfCallArgs {
  title: string; note?: string;
  soldier: { full_name, personal_number, unit_name, phone? };
  items: Array<{ name, quantity, serial? }>;
  performed_by: string; drive_path: string[]; filename: string;
}
```

---

### Migrations — weapons
| קובץ | תוכן |
|------|------|
| `0016_weapons_zeroed_flag.sql` | הוסיף `is_zeroed boolean`, `zeroed_at timestamptz` לטבלת weapons_item_serials |

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

*עודכן: 2026-06-10 (weapons module — Supabase + Drive PDF)*
