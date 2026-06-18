# LEARNING.md — ידע מלא של gadhan-all

> CRM מאוחד לניהול: ציוד קשר (radio) · נשקים (weapons) · דלק (delek) · בונקר תחמושת (bunker) · שלישות/נוכחות (personnel) · רכב (vehicles)

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
  password_changed_at: string | null; // מיגרציה 0029 — לחישוב תפוגת סיסמה (60 יום)
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

`ProtectedRoute` אוכף בנוסף (לפי הסדר): מאומת → `active` → **תפוגת סיסמה** (אם פגה, מציג `<ChangePasswordPage forced />` במקום הדף) → `requireAdmin`.

---

## 3. מודול קשר (radio) — מלא

### מצב: מלא ומחובר ל-Supabase

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
| `lib/heldItems.ts` | פריטים בחזקת חייל — **שני המודולים**: קשר (signings/signing_items לפי soldier_id) + נשק (weapons_item_serials לפי assigned_to_pn; שורות `__qty__` מקובצות לספירה, `zeroed` מסומן). `loadSoldierHeldItems(soldierId, personalNumber?)` מחזיר `HeldItem[]` עם `source: 'radio'|'weapons'`. מוצג ב-SoldiersPage מודאל מקובץ לפי מודול (נשק/קשר). |
| `lib/itemHolders.ts` | מחזיקי פריט |
| `lib/itemSerials.ts` | סריאלים של פריטים |
| `lib/serialInspections.ts` | בדיקות סריאלים |
| `lib/soldiersImport.ts` | ייבוא חיילים מ-CSV |
| `lib/unitStock.ts` | מלאי מסגרות |

---

## 4. מודול נשקים (weapons) — מחובר 

### מצב: מחובר ל-Supabase + Drive PDF

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

> **PDF נוצר ב-GAS מ-HTML, לא ב-pdf-lib.** ה-edge function בונה מחרוזת HTML (RTL)
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

**קשר עבר ל-Drive (2026-06-17)** — אותו edge function `generate-weapon-checkout-pdf` (גנרי) משמש גם את הקשר; אין redeploy. `src/lib/drivePdf.ts` (`fireDrivePdf`) הוא העטיפה המשותפת (ממפה `entity`→`soldier`). מבנה: `ROOT/קשר/{unit_name}/החתמות|זיכויים/...`.
- **החתמה (חייל)** — `SignFormPage` יורה PDF "החתמת ציוד קשר" עם **המצאי הנוכחי** של החייל (`loadSoldierHeldItems`) + חתימה → `קשר/{מסגרת}/החתמות/{שם החייל}.pdf` (מוחלף בכל החתמה). **אם המצאי 0 → מחיקת ה-PDF** (`fireDeleteDrivePdf`, action `delete`) במקום טופס ריק — כמו זיכוי מלא בנשק. **הוסר** השימוש ב-`generate-signing-pdf` (Supabase bucket `signing-pdfs`) — ה-edge function נשאר deployed אך לא נקרא; `soldiers.pdf_url`/`signings.pdf_url` כבר לא מתעדכנים.
- **מסגרת — החתמה + זיכוי** — `UnitSignFormPage` יורה PDF לשני הסוגים (לא רק זיכוי): **החתמה** (type=`signing`) → `קשר/{מסגרת}/החתמת מסגרת/{מסגרת} {dd-mm-yyyy_HH-MM}.pdf`; **זיכוי** (type=`return`) → `קשר/{מסגרת}/זיכויים/{מסגרת} {dd-mm-yyyy_HH-MM}.pdf`. שם קובץ מתוארך — אין חייל בודד; כל אירוע נשמר (לא מוחלף). הפריטים = ה-`inserts` של אותה פעולה.
- כפתור "הצג PDF עדכני"/עמודת PDF הוסרו מ-`SoldiersPage` (מודאל) ומ-`SigningsPage` — ה-PDF של הקשר נשמר עכשיו ב-Drive, לא נצפה in-app (כמו נשק).

**GAS web-app (proxy לDrive):**
```
URL: משתנה בכל deploy חדש — נשמר ב-secret GAS_PDF_URL.
נכון ל-2026-06-11: https://script.google.com/macros/s/AKfycbwDFe21D1PxUVRdoLqumMxi_KUxWGIqA8kMxQvg0ziDOygLPdIAujfvqbIYmvtWSlfP/exec
```
actions: `savePdf` (pdfBase64) | `savePdfFromHtml` (html → PDF) | `sendErrorEmail`
ה-GAS רץ תחת חשבון המשתמש ← אין בעיית Drive quota (SA quota = 0)

> **GAS deploy gotcha:** עריכה בעורך ≠ deployed. ה-URL `/exec` נעול לגרסה.
> action חדש בקוד בלי New version → ה-URL מחזיר `Unknown action: X`.
> Deploy → Manage deployments → Edit (עיפרון) → New version → Deploy (שומר URL).
> אם עושים New deployment (URL חדש) → לעדכן `supabase secrets set GAS_PDF_URL=...`.

**שגיאות — אימייל אוטומטי:**
אם edge function נכשל → קוראת `sendErrorEmail` ל-GAS → `MailApp.sendEmail('gadhan8219@gmail.com', ...)`.
ה-GAS עצמו גם שולח מייל ב-catch של `savePdf`.

---

### PDF — זרימה אסינכרונית (Fire-and-Forget)
**עיקרון:** DB update קודם, PDF בלי await.
```typescript
// נכון — הצלחה מוצגת מיד אחרי DB
await dbUpdate();
setSuccess(true);             // UI מיד
fetch(fnUrl, { ... })         // בלי await
  .then(r => r.json())
  .then(r => { if (r.ok) setPdfUrl(r.url); })
  .catch(() => {});            // שגיאה → מייל מה-backend

// שגוי — לחכות לPDF לפני הצלחה
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
| העברה | src → dst (אותה מסגרת) | update assigned_to_pn + **רענון טופס החתמות לשני החיילים** |
| ראש בראש | החלפת פריטים בין 2 חיילים | 2× update + **רענון טופס החתמות לשני החיילים** |
| איפסון | סמן is_zeroed=true | update is_zeroed + zeroed_at (ללא טופס) |

**רענון טופס החתמות (2026-06-17):** helper `fireHoldingsPdf(soldier)` ב-`WeaponsTransferPage` — שולף את ההחזקות הנוכחיות של חייל ומחדש את `נשקיה/{מסגרת}/החתמות/{שם}.pdf` (או **מוחק** אם 0 פריטים; פריטי כמות מקובצים לספירה). נקרא אחרי כל פעולה ששינתה החזקות — `doZikhui` (4b, החליף את הקוד המוטבע), `doTransfer` (src+dst), `doRosh` (src+dst). חיוני: נקרא **אחרי** ה-DB write כדי שהשאילתה תשקף מצב חדש.

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
| `0033_weapons_raspar_signing.sql` | רס״פ רשאי להחתים/לזכות/להעביר/לאפסן נשק לחיילי **המסגרת שלו** (RLS). מחליף את `weapons_serials_raspar_check` ב-`weapons_serials_raspar_update` (UPDATE — מחזיק ישן/חדש מהמסגרת או צ׳ פנוי) + `weapons_serials_raspar_insert` (שורות כמות). admin עם `weapons_serials_write`. |
| `0034_weapons_zeroed_note.sql` | הוסיף `zeroed_note text` ל-weapons_item_serials — הערה אופציונלית באיפסון (placeholder "בטחונית צוות") **לכל פריט** (כולל פריטי כמות). מתאפס בזיכוי. |
| `0035_weapons_returns_raspar.sql` | `weapons_returns_raspar_insert` — רס״פ רשאי לרשום זיכוי לחיילי המסגרת שלו. קודם ה-write היה admin-only (0018) → זיכוי רס״פ נכשל בשקט (היסטוריית PDF נשברה). |
| `0036_radio_green_check.sql` | הוסיף `green_check_at` ל-`item_serials` (קשר) + שיחזר את ה-view `item_serial_status` עם העמודה. "ירוק בעיניים" למודול קשר, במקביל ל-`weapons_item_serials.green_check_at` בנשקייה. |

### ירוק בעיניים — עדכון אוטומטי בכל פעולה (2026-06-16)
דרישה: **כל** פעולת החתמה/איפסון/זיכוי תעדכן את `green_check_at` של אותו פריט — בשני המודולים.
- **נשקייה** (`weapons_item_serials.green_check_at`): מתעדכן ל-`now` ב-`WeaponsCheckoutPage` (החתמה + שורות כמות) וב-`WeaponsTransferPage` ב-**כל** הפעולות: זיכוי (`doZikhui`), העברה (`doTransfer`), ראש-בראש (`doRosh`, שני הצדדים), ואיפסון (`doIpasoon`). אין מיגרציה (העמודה קיימת מ-0020).
- **קשר** (`item_serials.green_check_at`, חדש ב-`0036`): `SignFormPage` מעדכן `green_check_at=now` לכל שורת צ׳ אחרי שמירת ההחתמה — **best-effort** (לא חוסם את ההחתמה אם נכשל). מוצג בעמודה חדשה "ירוק בעיניים" בדוח הצ׳ים (`UnitStockReportPage`) + ייצוא CSV; נקרא דרך ה-view `item_serial_status` (`greenCheckAt` ב-`InspectionRow`).
- **הערה:** זיכוי בנשקייה לא מאפס את תאריכי הבדיקה (`weapon_check_at`/`green_check_at`) — אדרבה, מעכשיו הזיכוי **מעדכן** את הירוק בעיניים. `is_zeroed` עדיין מתאפס בזיכוי.

### איפסון — הוצאה מאיפסון + חסימת העברה/ראש-בראש (2026-06-16, ללא מיגרציה)
- **הוצאה מאיפסון**: פריט עם `is_zeroed=true` מציג בטאב איפסון (`WeaponsTransferPage`) כפתור "הוצא מאיפסון" → `doUnipasoon(id)` מאפס `is_zeroed=false, zeroed_at=null, zeroed_note=null` ומעדכן `green_check_at=now`. כולל זיהוי RLS no-op (`.select('id')` + 0 שורות → שגיאה). הפריט נשאר חתום על החייל.
- **פריט מאופסן ניתן לזיכוי בלבד**: בטאב **העברה** שורה מאופסנת מושבתת (checkbox disabled + רמז "מאופסן — רק זיכוי"); `doTransfer` מסנן `!r.is_zeroed` ומחזיר שגיאה אם נבחר רק מאופסן. בטאב **ראש בראש** `roshOverlap` מחריג פריטים מאופסנים (כמו שמחריג צ׳ים סינתטיים). זיכוי (`doZikhui`) ממילא מוחק את ה-flag.

### דוח מלאי קשר לפי צ׳ — שני כפתורי סימון ייחודיים (2026-06-16, ללא מיגרציה)
ב-`UnitStockReportPage` (תצוגת בדיקות צ׳ים) במקום כפתור "נמצא" יחיד יש כעת **שני** כפתורים ייחודיים, אחד בכל עמודה:
- עמודת **"נבדק לאחרונה"** (שם נשמר — מציין בדיקה טכנית לפי החוקים הקיימים): כפתור "סמן בדיקה" → `handleMarkInspected` → `markSerialInspected` מעדכן `last_inspected_at` (+`last_inspected_by`).
- עמודת **"ירוק בעיניים"** (הפריט נמצא וידוע מיקומו): כפתור "סמן ירוק" → `handleMarkGreen` → `markSerialGreenCheck` (חדש ב-`serialInspections.ts`) מעדכן `green_check_at`.
- העמודה הריקה הישנה (`w-24`) הוסרה; `colSpan` של שורות הקבוצה עודכן 8→7. `busySerialId` הוחלף ב-`busyKey` (`${id}:inspect` / `${id}:green`). audit חדש: `serial.green_check`. שתי הפעולות על אותה טבלה/שורה (`item_serials`) — אותו policy שכבר התיר לרס״פ לעדכן `last_inspected_at` מכסה גם את `green_check_at`, אין מיגרציה.

**עדכון תצוגה — כמו סיכום נשקייה (2026-06-16):** עמודת "סטטוס" הנפרדת הוסרה; התצוגה הותאמה ל-`WeaponsInventoryPage` ("סיכום לפי צ׳"). רכיב `CheckBadge` חדש מציג **תג לחיץ** בכל עמודת תאריך — ירוק עם התאריך כשעדכני (≤ `INSPECTION_STALE_DAYS`=7 ימים), אדום "דרוש בדיקה" כשישן/חסר; לחיצה מסמנת כנבדק היום (אם `canMark`). הסטטוס מקודד כעת בצבע התגים עצמם. עמודות: מסגרת · פריט · צ׳ · חייל · נבדק לאחרונה · ירוק בעיניים (6, `colSpan` קבוצה 7→6). הייצוא ל-CSV עדיין כולל עמודת סטטוס נגזרת.

### באגים שתוקנו (נשק) — 2026-06-16
- **החתמת רס״פ נכשלה בשקט**: `/weapons/checkout` פתוח לרס״פ, אך ה-RLS איפשר לו רק UPDATE על צ׳ שכבר משויך למסגרתו. שיוך צ׳ **פנוי** (`NULL → חייל`) לא תאם אף policy → 0 שורות, **בלי שגיאה**. תוקן ב-`0033` (RLS) + `WeaponsCheckoutPage` כעת בודק שגיאה ומריץ `.select('id')` אחרי ה-UPDATE; 0 שורות → שגיאה ברורה. INSERT של שורות כמות גם היה admin-only.
- **פריט מעקב-כמות הציג צ׳ סינתטי**: צ׳ פנימי `__qty__…` דלף לעמודת "צ׳" (טבלת "סיכום לפי צ׳" + מודאל הפירוט ב"סיכום כמותי"). כעת `WeaponsInventoryPage` מקבץ שורות כמות לפי (פריט·חייל·מסגרת) ומציג **מספר** בעמודת צ׳ (helper `isQtySerial`).
- **פריט מעקב-כמות שנדרש לבדיקה לא הציג אפשרות בדיקה בסיכום לפי צ׳**: בתחילה שורות כמות הציגו `—` בעמודות הבדיקה. כעת `DisplayRow` שומר `ids[]` של כל ה-serials הסינתטיים בקבוצה + תאריך בדיקה מצרפי (`oldestOrNull` — null אם לאיזה פריט בקבוצה חסרה בדיקה ⇒ "דרוש בדיקה", אחרת התאריך הישן ביותר). `CheckCell` מקבל `DisplayRow` ו-`markCheck(ids[])` מסמן את **כל** הקבוצה ב-`.in('id', ids)`. פריטים פטורים (`no_check_required`) עדיין מציגים "לא נדרש". תיבת "פטור בדיקה" (admin) זמינה גם לפריטי כמות.

### תצוגת מאופסן + הערה (2026-06-17)
איפסון מוצג כעת עם ההערה בכל מקום (`zeroed_note`). השאילתה ב-`WeaponsInventoryPage.load` כוללת `is_zeroed, zeroed_note`; `SerialRow` הורחב בהתאם.
- **מודאל פירוט (לחיצה על כמות פריט למסגרת ב"סיכום כמותי")**: כותרת מציגה "· N מאופסן"; checkbox **"מאופסן בלבד"** (`detailZeroedOnly`) מציג רשימה שטוחה של המאופסנים בלבד, ממוינת לפי חייל, עם עמודת **הערה**. בתצוגה הרגילה: פריט סריאלי מציג תג "מאופסן: <הערה>" ליד הצ׳; פריט כמות מציג "N מאופסן" ליד הספירה ל-pn. (העמודה הנפרדת "סה״כ מאופסן" + `zeroedModal` שנוספו קודם — **בוטלו** לבקשת המשתמש.)
- **סיכום לפי צ׳**: `DisplayRow` צובר `zeroedCount` + `zeroedNotes[]`; שורה מאופסנת מציגה תג "מאופסן" (×N לכמות) + ההערות ליד שם הפריט.
- **עמוד חיילים (מודאל פריטים חתומים)**: `heldItems.ts` מקבץ פריטי כמות של נשק לפי `(שם, is_zeroed)` כך שפריט כמות מאופסן מוצג בנפרד עם תג "מאופסן: <הערה>" (`HeldItem.zeroedNote`). באג קודם: פריט כמות מאופסן לא הוצג כמאופסן.
- **עמוד חיילים — דוח 1 בחייל**: מודאל החייל מציג סקשן **"דוח 1"** עם **בורר טווח תאריכים** (מתאריך/עד תאריך + "נקה"). `getSoldierAttendance(soldierId, { from?, to?, limit? })` (ב-`attendance.ts`) — ללא טווח מחזיר את 14 האחרונים, עם טווח מריץ `gte/lte` על `date`. נטען ב-`useEffect` על `[selected, attFrom, attTo]` (לא ב-`openSoldier`). embed `attendance_statuses(status)`.
- **עמוד חיילים — הוסר כפתור ה-PDF במודאל**: כפתור "הצג PDF עדכני" (קשר, `signing-pdfs/<id>.pdf`) הוסר מהמודאל לבקשת המשתמש (יחד עם `openSigningPdf`/`signedUrl` שם). ה-PDF של הקשר עדיין נגיש מ-`SigningsPage`. PDF נשק לא נחשף במודאל (נשמר ב-Drive, הקישור לא נשמר per-חייל).

### אותו דפוס שקט נסרק בשאר זרימות הנשק (2026-06-16)
`/weapons/transfer` פתוח גם הוא לרס״פ. כל הפעולות שם נכתבו ב-`await supabase…update/insert(...)` **בלי בדיקת `error`** ובלי `.select('id')` — אותו class של כשל שקט. תוקן ב-`WeaponsTransferPage`:
- **זיכוי (`doZikhui`)**: ה-INSERT ל-`weapons_returns` היה admin-only (תוקן ב-`0035`) + עכשיו בודק שגיאה; ה-UPDATE שמנקה שיוך מריץ `.select('id')` ובודק שכל ה-ids עודכנו.
- **העברה (`doTransfer`)** ו-**ראש בראש (`doRosh`)**: כל UPDATE כעת `.select('id')` + בדיקת 0 שורות → שגיאה ברורה.
- **נסרקו ונמצאו תקינים**: `markCheck` / `toggleExempt` (Inventory) — `toggleExempt` (כתיבה ל-`weapons_items`, admin-only) חסום ב-UI ל-`{isAdmin && …}`; `markCheck` בודק שגיאה ומוגבל ב-UI ל-`canMark` (מסגרת הרס״פ). `saveEditSoldier` (Checkout) — `soldiers` יש `soldiers_raspar_update` למסגרת הרס״פ, ובודק שגיאה.

---

## 5. מודול דלק (delek) — UI בלבד

### מצב: UI בלבד — Supabase עתידי

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

> **כלל עיצוב (מעודכן 2026-06-14):** אין אימוג'ים בממשק בכלל — לא בכפתורים, לא בכותרות (`PageTitle.icon` אופציונלי ולא בשימוש), לא בהתראות. החריג היחיד הוא גלגל השיניים בכותרת סקשן "ניהול מערכת" בתפריט (`Layout.tsx`). הסגנון עסקי ורציני.

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

### מודולים ב-Sidebar (accordion — `SECTIONS` ב-Layout.tsx)
```
קשר (radio)        — /sign, /soldiers, /signings, /unit-stock, ...
נשק (weapons)      — /weapons/checkout, /weapons/transfer, /weapons/inventory, /weapons/armory
דלק (delek)        — /delek, /delek/admin
בונקר (bunker)     — /bunker/inventory, /receive, /dispense, /credit, /transfer, /regulate, /shatsal, /summary
שלישות (personnel) — /personnel/attendance, /personnel/records
רכב (vehicles)     — /vehicles/manage, /vehicles/summary
ניהול מערכת (admin) — /soldiers-import, /soldiers, /users   (גלגל שיניים — האימוג'י היחיד שנשאר)
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

### Edge Functions
```bash
supabase functions deploy <name>   # CLI עובד (בעיית SSL הישנה נפתרה)
```
**Secret key לשירות (service role):** הפרויקט עבר ל-API keys החדשים (`sb_secret_…`).
- אסור להסתמך על `SUPABASE_SERVICE_ROLE_KEY` (legacy JWT, עבר downgrade ל-anon).
- להשתמש ב-helper `supabase/functions/_shared/serviceKey.ts` → `resolveServiceKey()`
  (קורא את `SUPABASE_SECRET_KEYS`, שמוזרק כ-JSON object `{"default":"sb_secret_…"}`).
- supabase-js חייב להיות `2.108.1`+ (הישן שולח `sb_secret_` כ-JWT bearer ← נדחה).

---

## 9. מלכודות נפוצות

### Edge function: "permission denied for table" / "Invalid API key"
שתי סיבות אפשריות (שתיהן קרו ביוני 2026):
1. **key פורמט חדש** — ראה "Edge Functions" למעלה (resolveServiceKey + supabase-js 2.108.1).
2. **GRANT חסר** — טבלה שנוצרה כ-raw superuser לא קיבלה grants ל-service_role.
   תיקון: מיגרציה `0017_restore_api_role_grants.sql` (grant all in schema public to anon/authenticated/service_role).
   service_role עם BYPASSRLS עדיין צריך GRANT ברמת טבלה — RLS ≠ GRANT.

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

## 11. מודול בונקר (bunker) — תחמושת

### מצב: מחובר ל-Supabase

ניהול תחמושת לפי מחסנים ומסגרות. מיגרציות `0021`–`0025`.

### Tables עיקריות
| טבלה | תוכן |
|------|------|
| `bunker_warehouses` | מחסנים |
| `bunker_items` | פריטי תחמושת |
| `bunker_stock` | מלאי לכל פריט/מחסן |
| `bunker_movements` | תנועות (קבלה/ניפוק/זיכוי/העברה/וויסות) |
| `bunker_shatsal` | דיווחי שצ״ל (שימוש לצורכי לחימה) |

### Pages (תחת /bunker)
inventory (מלאי) · receive (קבלות) · dispense (ניפוק) · credit (זיכוי) · transfer (העברה) · regulate (וויסותים) · shatsal (שצ״ל) · summary (סיכום).

### הרשאות בונקר (UI)
- **רס״פ**: רשאי רק **shatsal** (דיווח שצ״ל) ו-**summary** (סיכום). ששת המסכים האחרים — `requireAdmin` ב-`App.tsx` ומסומנים `admin: true` ב-`Layout.tsx` (מוסתרים בניווט).
- **דיווח שצ״ל — רק למסגרת שלו**: רס״פ אינו בוחר מסגרת; שדה "מסגרת" נעול לשם המסגרת שלו (`units.name` לפי `profile.unit_id`, נטען ב-`BunkerShatsalPage`). admin בוחר חופשי מתוך `BUNKER_UNITS`.
- **מנהל**: כל מסכי הבונקר.
- **אכיפת שרת**: ה-RPCs `bunker_apply_receipt/dispense/credit/transfer/regulation` קוראים `perform require_admin()` כשורה ראשונה (מיגרציה `0031`) — רס״פ שינסה לקרוא ל-API ישירות יקבל שגיאת `42501`. `bunker_apply_shatsal` נשאר פתוח אך **מוגן** (מיגרציה `0032`): admin מדווח לכל מסגרת, רס״פ רק למסגרת ששמה = `units.name` שלו, אחרת `42501` ("רס״פ רשאי לדווח שצ״ל רק למסגרת שלו"). `inventory`/`items` מוגנים ב-RLS (`*_admin_write` עם `is_admin()`, מיגרציה 0028). ראה "סטנדרט אכיפת הרשאות" בסעיף 16.

### סיכום שצ״ל (summary)
- **סה״כ תחמושת** = נופק פחות זוכה לפי פריט מתחילת הסבב.
- **סה״כ שצ״ל** = סכום דיווחי השימוש לצורכי לחימה לפי פריט.
- **סטטוס נוכחי** (העמודה, לשעבר "נשאר") = סה״כ תחמושת פחות סה״כ שצ״ל (יכול להיות שלילי).

Lib: `lib/bunker.ts`.

---

## 12. מודול שלישות (personnel) — נוכחות דוח 1

### מצב: מחובר ל-Supabase. מיגרציה `0026_attendance.sql`.

### Tables
| טבלה | תוכן |
|------|------|
| `attendance_statuses` | סטטוסי נוכחות (טקסט חופשי, ≤20 תווים, מנוהל ע"י admin) |
| `attendance` | שורה אחת לכל חייל/תאריך → סטטוס. `unique(soldier_id, date)` |

### RPC
`attendance_confirm_report(p_date date, p_records jsonb)` — security definer. Upsert לכל חייל; חוסם תאריך עתידי; תומך עריכה רטרואקטיבית.

### Pages
| דף | נתיב | תיאור |
|----|------|--------|
| AttendanceReportPage | /personnel/attendance | דיווח דוח 1 בזרימת status-first: מסגרת → תאריך → בחירת סטטוס → סימון חיילים רלוונטיים → סיכום חי → אישור (פעיל רק כשכולם סומנו). תמיכה ב"סמן צוות". עריכת תאריך קיים. |
| AttendanceRecordsPage | /personnel/records | צפייה לפי יום + ייצוא אקסל אמיתי (xlsx / SheetJS). |

### הרשאות
admin בוחר/מסנן מסגרת; raspar נעול למסגרת שלו (`effectiveUnitId = isAdmin ? unitFilter : raspUnitId`).

Lib: `lib/attendance.ts` (כולל `todayISO()`, `listStatuses`, `getAttendanceForDate`, `confirmAttendance`).

---

## 13. מודול רכב (vehicles)

### מצב: מחובר ל-Supabase + Storage. מיגרציות `0027_vehicles.sql` + **`0037_vehicle_types_remodel.sql`** (מבנה חדש).

### מבנה חדש (2026-06-17, מיגרציה 0037) — vehicle_types = קטלוג דגמים
שינוי תפיסתי: `vehicle_types` אינו עוד 3 הקטגוריות הקבועות, אלא **קטלוג של דגמי רכב**. כל שורה = דגם:
- `name` — שם הכלי (משאית קירור, האמר, רמ-סע…)
- `type` — הקטגוריה (`יר״מ`/`לבן`/`צבאי`, `check` constraint + index)
- `license` (bool) — האם רכבים מהדגם דורשים העלאת מסמכים
- ייחודיות: `unique(name, type)` (אותו שם יכול לחזור בין קטגוריות).

`vehicles` קיבל `mileage integer` (קילומטרג׳ נוכחי). `vehicles.type_id` מצביע כעת על שורת **דגם** בקטלוג (שנושאת name+type+license). המיגרציה **רוקנה** את `vehicles` + `vehicle_types` (החלטת מוצר — התחלה נקייה; מסמכים ישנים ב-bucket נשארים כ-orphans לא מזיקים).

### Tables
| טבלה | תוכן |
|------|------|
| `vehicle_types` | קטלוג דגמים: `name, type (יר״מ/לבן/צבאי), license bool` |
| `vehicles` | `car_plate, unit_id, type_id→vehicle_types, documents jsonb, next_test_date, next_test_range, mileage` |

- `documents` = מערך `{ name, path, uploaded_at, url? }`. קבצים ב-bucket `vehicle-docs` — **פרטי** מאז מיגרציה 0028. קריאה דרך signed URL (`lib/storage.ts`). תצוגה inline דרך `DocViewerModal` (סעיף 17). תוויות מסמכים: `טופס`, `רשיון` (`VEHICLE_DOC_LABELS`).
- `next_test_range` = קילומטרז' לבדיקה הבאה (חלופה ל-`next_test_date`).
- **מספר רכב ייחודי**: `createVehicle` בודק כפילות לפני insert + מתרגם `23505`. אינדקס ייחודי `vehicles_car_plate_unique` (מיגרציה `0030`). רס״פ רשאי להוסיף רכבים (לא admin-only).

### Pages (תחת /vehicles) — 2 מסכים (החליפו את יר״מ/לבן/צבאי)
| דף | נתיב | תיאור |
|----|------|--------|
| VehicleManagePage | /vehicles/manage | **ניהול כלי רכב**. (א) קטלוג דגמים — admin בלבד: שם+סוג+נדרשים-מסמכים, רשימה+מחיקה. (ב) הוספת רכב: מספר רכב, מסגרת, סוג (dropdown), שם (dropdown מסונן לפי הסוג→`type_id`), בדיקה הבאה תאריך/ק"מ, קילומטרג׳ נוכחי, ואם הדגם `license` — העלאת `טופס`+`רשיון` בתוך הטופס (נאסף ל-state, מועלה אחרי `createVehicle`). **אין רשימת רכבים בעמוד** — צפייה/עריכה עברו לסיכום. |
| VehicleSummaryPage | /vehicles/summary | **סיכום רכבים**. סינון לפי סוג (+מסגרת ל-admin). טבלה עם כל פרטי הרכב; **תא חסר מסומן באדום** (`bg-red-50`): מסגרת חסרה, בדיקה הבאה (אין תאריך ולא ק"מ), קילומטרג׳ חסר, מסמך נדרש חסר. דגם ללא `license` → "לא נדרש". **לחיצה על שורה** פותחת `EditVehicleModal` — עריכת מספר רכב/מסגרת/סוג+שם/בדיקה תאריך+ק"מ/קילומטרג׳, ניהול מסמכים (העלאה/החלפה/צפייה), ומחיקה. שמירה מתרגמת `23505` ל"מספר רכב כבר קיים". |

מחיקת דגם מהקטלוג חסומה אם קיימים רכבים מסוג זה (`23503` → הודעה עברית).

Lib: `lib/vehicles.ts` — `listVehicleTypes`, `createVehicleType`, `deleteVehicleType`, `listVehiclesFull` (join ל-vehicle_types, מחזיר `VehicleFull` עם `type_name/category/license`, סינון לפי category), `listVehiclesDueForTest`, `createVehicle`, `updateVehicle`, `deleteVehicle`, `uploadVehicleDoc`, `daysUntil`, קבועים `VEHICLE_CATEGORIES`, `VEHICLE_DOC_LABELS`, `TEST_ALERT_DAYS`. (`typeIdByName` הוסר — אין עוד שורות קטגוריה בשם קבוע.)

---

## 14. דשבורד מרכזי (DashboardPage)

נבנה מחדש (`lib/dashboard.ts` כשכבת אגרגציה). מציג, עם scoping של admin (כל המסגרות) מול raspar (מסגרת שלו):

1. **פעולות מהירות** (בראש, ללא אימוג'ים): דיווח דוח 1, ייצוא דוח 1, החתמת נשק, זיכוי/העברה/אפסון, דיווח שצ״ל.
2. **נשק** — שני סטטוסים זה לצד זה: ירוק בעיניים % + בדיקות נשק/אופטיקה % לפי מסגרת.
3. **קשר** — ירוק בעיניים % לפי מסגרת.
4. **שלישות** — סיכום נוכחות יומי: קודם מסגרות שביצעו (כמותי לפי סטטוס), ואז בלוק "לא הושלם" עם רשימת מסגרות מצומצמת.
5. **רכב** — שני סקשנים (מ-`listVehiclesFull`): (א) **רכבים חסרי פרטים** (`isIncomplete`: מסגרת/בדיקה הבאה/קילומטרג׳/מסמכים נדרשים חסרים — אותה לוגיקה כמו האדום בסיכום); (ב) **רכבים נדרשים לבדיקה** — לפי תאריך (`< TEST_ALERT_DAYS`=4 ימים או באיחור) **או** לפי קילומטרג׳ (`next_test_range - mileage <= MILEAGE_ALERT_KM`=5000). שני הקישורים → `/vehicles/summary`.

כל סקשן הוא `Link` ללחיצה → הדוח הרלוונטי. סף טריות בדיקות = 7 ימים (`fresh()` / `INSPECTION_STALE_DAYS`).

`lib/dashboard.ts`: `radioGreenByUnit`, `weaponsChecksByUnit`, `attendanceDailyByUnit` (כל אחד מקבל `unitId | null`).

---

## 15. PWA — אפליקציית מובייל

- `vite-plugin-pwa` (manifest + workbox service worker, `registerType: 'autoUpdate'`).
- אייקונים ב-`public/`: `pwa-192x192.png`, `pwa-512x512.png`, `maskable-512x512.png`, `apple-touch-icon.png` (נוצרו מ-`logo.png` עם `sips`).
- meta tags ל-iOS/Android ב-`index.html`. כותרת הטאב: `CRM גדחה״ן`.
- ניתן להתקנה מ"הוסף למסך הבית" בדפדפן.

---

## 16. אבטחה (Security Hardening)

מיגרציות `0028` (privatize buckets + RLS) ו-`0029_password_policy.sql`.

### שכבות אבטחה במערכת
| שכבה | מימוש | קובץ |
|------|--------|------|
| **ניתוק אוטומטי בחוסר פעילות** | אחרי 30 דק' ללא פעילות → `signOut()` + ניווט ל-`/login`. עוקב אחרי mouse/keyboard/touch/scroll, מסונכרן בין טאבים דרך localStorage, נבדק מחדש ב-`visibilitychange`. **תיקון PWA (2026-06-17):** ב-mount בודקים קודם את חותמת `gadhan-last-activity` השמורה ומנתקים אם עברו 30 דק' — קודם ה-mount תמיד עשה `reset()` עיוור, כך ש-PWA שנהרג והופעל מחדש (אחרי יום) פתח חלון 30 דק' חדש ולעולם לא ניתק. | `lib/useIdleLogout.ts` (מורכב פעם אחת ב-`Layout.tsx`) |
| **תפוגת סיסמה כל 60 יום** | `password_changed_at` בפרופיל. `isPasswordExpired()` בודק > 60 יום. `ProtectedRoute` כופה החלפה (`forced`). בטוח גם לפני המיגרציה — `null` ⇒ לא פג. | `lib/password.ts`, `ProtectedRoute.tsx`, `ChangePasswordPage.tsx` |
| **חוזק סיסמה** | מינ' 8 תווים + אות + ספרה. נאכף ב-3 שכבות: טופס React, edge function `manage-users` (שרת), ואופציונלית Supabase Password policy. | `lib/password.ts` (`validatePassword`, `PASSWORD_RULE_TEXT`), `UsersPage.tsx`, `manage-users/index.ts` |
| **באקטים פרטיים** | `signing-pdfs`, `vehicle-docs`, `fuel-receipts` פרטיים (0028). קריאה רק דרך signed URL מאומת (TTL שעה). | `lib/storage.ts` (`signedUrl`, `objectPath`) |
| **Security Headers** | CSP, HSTS, X-Content-Type-Options, X-Frame-Options=DENY, Referrer-Policy, Permissions-Policy. | `vercel.json` → `headers` |
| **Rate Limiting** | Supabase Auth: "sign-ups and sign-ins" הונמך ל-~10 לכל 5 דק' לכל IP (הגנת brute-force). מוגדר ב-Dashboard, לא בקוד. | Supabase Dashboard → Auth → Rate Limits |
| **אכיפת הרשאות בשרת** | חסימת UI לבדה לא מספיקה — כל פעולה מוגנת נאכפת גם בשרת. | מיגרציה `0031` (ראה למטה) |

### סטנדרט אכיפת הרשאות (חובה לכל פעולה — גם עתידית)
חסימת מסך ב-`ProtectedRoute requireAdmin` מסתירה UI אבל לא עוצרת קריאת API ישירה. **לכן כל פעולה מוגנת חייבת אכיפת שרת בנוסף:**

1. **כתיבה לטבלה** → RLS policy עם `with check (is_admin() …)` / `current_unit_id()`. זו כבר הנורמה (0001, 0028).
2. **RPC מסוג SECURITY DEFINER** → קריאה ל-`perform require_admin();` (או `require_raspar_or_admin()`) כ**שורה ראשונה** בגוף הפונקציה.

עוזרים (מיגרציה `0031_authz_standard.sql`):
| פונקציה | מתי לזרוק |
|----------|-----------|
| `require_admin()` | אם הקורא אינו admin פעיל (`42501`, הודעה "הרשאת מנהל נדרשת") |
| `require_raspar_or_admin()` | אם הקורא אינו admin או raspar פעיל |

`auth.uid()` בתוך SECURITY DEFINER משקף את ה**קורא** (claims של ה-JWT עוברים), לכן `is_admin()` נכון גם שם.
**הוחל על:** `bunker_apply_receipt/dispense/credit/transfer/regulation` (`require_admin`). `bunker_apply_shatsal` פתוח לרס״פ אך אוכף scope עצמי (מיגרציה `0032`): admin לכל מסגרת, רס״פ רק למסגרת ששמה = `units.name` שלו (אחרת `42501`). **כלל לעתיד:** RPC חדש שמבצע פעולה מוגנת — להוסיף את ה-guard המתאים בשורה הראשונה.

### `mark_password_changed()` (RPC)
`SECURITY DEFINER`, מעדכן `password_changed_at = now()` ל-`auth.uid()`. נקראת אחרי `updateUser({ password })` ב-`ChangePasswordPage` (לא-פאטאלי — עטוף ב-try/catch).

### CSP (Content-Security-Policy) — ב-`vercel.json`
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob: https://*.supabase.co;
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
frame-src 'self' blob: https://*.supabase.co;   ← נדרש להצגת PDF ב-iframe
worker-src 'self' blob:; manifest-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self';
frame-ancestors 'none'; upgrade-insecure-requests
```
**מלכודת:** הוספת אינטגרציה חיצונית חדשה (CDN, API) דורשת עדכון ה-CSP, אחרת הדפדפן יחסום (`Refused to connect/load/frame`). אין `unsafe-eval` ואין inline scripts — ה-build מייצר רק `/assets/*.js` חיצוני.

---

## 17. תצוגת מסמכים inline (DocViewerModal)

`src/components/DocViewerModal.tsx` — קומפוננטה משותפת להצגת קבצים מבאקט פרטי **בתוך העמוד** במקום להוריד אותם.

- מקבלת `bucket`, `pathOrUrl`, `title?`, `downloadName?`, `onClose`.
- חותמת signed URL **בלי** download disposition (כדי שהדפדפן יציג, לא יוריד).
- מזהה PDF (`.pdf`) → `<iframe>`; אחרת תמונה → `<img>`.
- כפתור "הורד" (signed URL נפרד עם download) + סגירה ב-Esc / לחיצה ברקע.

**צרכנים:**
| דף | באקט | תוכן |
|----|------|------|
| `DelekAdminPage` (יומן תדלוק) | `fuel-receipts` | קבלות (JPEG) — "צפה" פותח modal |
| `VehicleManagePage` (ניהול כלי רכב) | `vehicle-docs` | טופס / רשיון (תמונה או PDF), לדגמים עם `license` |

**מלכודת:** הצגת PDF ב-iframe מצריכה `frame-src https://*.supabase.co blob:` ב-CSP (ראה סעיף 16). תמונות עובדות ממילא דרך `img-src`.

---

*עודכן: 2026-06-16 (Security hardening: idle logout, password expiry 60d, password strength, private buckets, CSP/headers, rate limiting; DocViewerModal — תצוגת מסמכים inline; הסרת כותרת login + הגדלת לוגו)*

*עודכן: 2026-06-16 (הרשאות בונקר לרס״פ — רק shatsal+summary; דיווח שצ״ל נעול למסגרת של הרס״פ בלבד — UI + מיגרציה 0032; מספר רכב ייחודי — מיגרציה 0030 + בדיקת client)*
