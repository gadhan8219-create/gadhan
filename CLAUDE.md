# CLAUDE.md — הנחיות לכל תהליך/מפתח

## חובה לפני כל פעולה — ללא יוצא מן הכלל

> **לפני כל שינוי בקוד, הוספת פיצ'ר, תיקון באג, או מענה לשאלה טכנית:**

### 1. קרא `LEARNING.md`
```
/Users/talinbar/Documents/gadhan-all/LEARNING.md
```
מכסה: ארכיטקטורה, כל הטבלאות, edge functions, זרימות PDF, design system, deploy.

### 2. קרא `MEMORY.md`
```
/Users/talinbar/.claude/projects/-Users-talinbar-Desktop-gadhan/memory/MEMORY.md
```
מכסה: החלטות ידועות, gotchas, כתובות GAS, שיטות deploy, החלטות ארכיטקטורה.

### למה זה חובה?
- הפרויקט מכיל 3 מודולים עם patterns שונים
- יש gotchas ספציפיים (Drive quota, fire-and-forget PDF, PDF נוצר ב-GAS)
- ללא הקריאה — סיכון לשכפול קוד, שגיאות deploy, ושבירת patterns קיימים

---

## טכנולוגיה

| שכבה | כלי |
|------|-----|
| Frontend | React 18 + Vite + TypeScript |
| עיצוב | Tailwind CSS (קלאסות מ-index.css) |
| Auth | Supabase Auth + טבלת `profiles` |
| DB | Supabase (PostgreSQL) |
| Deploy | Vercel (auto-deploy מ-main) |

---

## מודולים

| מודול | תיקייה | מצב |
|-------|---------|------|
| קשר (radio) | `src/pages/` + `src/lib/` | ✅ מלא + Supabase + PDF בסטורג' |
| נשקים (weapons) | `src/pages/weapons/` | ✅ מחובר Supabase + Drive PDF |
| דלק (delek) | `src/pages/delek/` | 🔲 UI בלבד — Supabase עתידי |

---

## כללי עבודה

### ענף — main בלבד
```bash
# לא לפתוח branches — עובדים ישירות על main
git add ...
git commit -m "..."
git push
```

### פריסה — Frontend
Vercel מחובר ל-GitHub — כל push ל-main מפעיל deploy אוטומטי.
לא צריך פקודת deploy ידנית.

### פריסה — Edge Functions
פריסה דרך CLI עובדת:
```bash
cd ~/Documents/gadhan-all
supabase functions deploy <name>
```
`supabase secrets set` גם עובד תקין דרך CLI.
(בעבר הייתה בעיית SSL `UnknownIssuer` שחסמה את ה-CLI — נפתרה.)

### Supabase
```typescript
// תמיד מ-src/lib/supabase.ts
import { supabase } from '../lib/supabase';

// Auth מ-Context
import { useAuth } from '../lib/auth';
const { profile, session } = useAuth();
```

### הרשאות — סטנדרט חובה (UI + שרת)
חסימת מסך לבדה **אינה אבטחה** — היא רק מסתירה UI. כל פעולה מוגנת חייבת אכיפה **גם בשרת**:

1. **UI**: `<ProtectedRoute requireAdmin>` ב-`App.tsx` + `admin: true` בפריט הניווט ב-`Layout.tsx`.
2. **שרת** (חובה, אחד מהשניים):
   - כתיבה לטבלה → RLS `with check (is_admin() …)`.
   - RPC (`security definer`) → `perform require_admin();` (או `require_raspar_or_admin()`) כשורה **ראשונה** בגוף.

העוזרים `require_admin()` / `require_raspar_or_admin()` מוגדרים במיגרציה `0031_authz_standard.sql`. ראה LEARNING.md סעיף 16 ("סטנדרט אכיפת הרשאות"). **כל RPC/פעולה מוגנת חדשה — חייב/ת לעמוד בסטנדרט הזה.**

### קלאסות עיצוב (index.css)
```
.btn-primary   — כפתור ראשי (emerald-600)
.btn-secondary — כפתור משני (slate-200)
.btn-danger    — כפתור מחיקה (red-600)
.input         — שדה קלט
.label         — תווית שדה
.card          — כרטיס לבן עם shadow
.badge         — תג/תגית קטנה
.table-wrap    — עטיפת טבלה (overflow)
.table-base    — טבלה בסיסית
```

### צבעים עיקריים
- **Primary**: `emerald-600` (#059669)
- **Sidebar**: `slate-900`
- **Background**: `bg-slate-50` / `bg-white`
- **Text**: `slate-900` / `slate-600`
- **Font**: Heebo (מוגדר ב-index.css)

### RTL + עברית
- `html` תמיד עם `dir="rtl"` (מוגדר ב-index.html)
- טקסטים בעברית

---

## הוספת דף חדש

1. צור `src/pages/<module>/<PageName>.tsx`
2. הוסף route ב-`src/App.tsx`
3. הוסף פריט ניווט ב-`src/components/Layout.tsx`
4. אם צריך Supabase — הוסף types ב-`src/lib/database.types.ts`

---

## env

```bash
# .env.local (לא ב-git)
VITE_SUPABASE_URL=https://...supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

אסור לשים מפתחות ב-קוד. תמיד `import.meta.env.VITE_*`.

---

## מבנה הפרויקט

```
src/
├── App.tsx              — ניתוב כל הדפים
├── main.tsx             — entry point
├── index.css            — design tokens + Tailwind
├── components/
│   ├── Layout.tsx       — sidebar + mobile header
│   ├── ProtectedRoute.tsx
│   └── SignaturePad.tsx  — shared canvas signature (forwardRef)
├── lib/
│   ├── supabase.ts      — Supabase client
│   ├── auth.tsx         — AuthContext + useAuth
│   └── database.types.ts
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── SignFormPage.tsx  — החתמת קשר לחייל
│   ├── weapons/         — דפי נשקים
│   └── delek/           — דפי דלק
supabase/
└── functions/
    ├── generate-signing-pdf/        — PDF קשר → Supabase Storage
    └── generate-weapon-checkout-pdf/ — PDF נשק → Google Drive (via GAS)
```
