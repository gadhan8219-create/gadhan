# CLAUDE.md — הנחיות לכל תהליך/מפתח

## חובה לפני כל שינוי בקוד

**קרא את `LEARNING.md`** — מסמך הידע המלא של הפרויקט.

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
| קשר (radio) | `src/pages/radio/` + `src/lib/` | ✅ מלא + Supabase |
| נשקים (weapons) | `src/pages/weapons/` | 🔲 UI בלבד — Supabase עתידי |
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

### פריסה
Vercel מחובר ל-GitHub — כל push ל-main מפעיל deploy אוטומטי.
לא צריך פקודת deploy ידנית.

### Supabase
```typescript
// תמיד מ-src/lib/supabase.ts
import { supabase } from '../lib/supabase';

// Auth מ-Context
import { useAuth } from '../lib/auth';
const { profile, session } = useAuth();
```

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
│   └── ProtectedRoute.tsx
├── lib/
│   ├── supabase.ts      — Supabase client
│   ├── auth.tsx         — AuthContext + useAuth
│   └── database.types.ts
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── radio/           — כל דפי הקשר (מהפרויקט המקורי)
│   ├── weapons/         — דפי נשקים (ממוגרים מ-gadhan)
│   └── delek/           — דפי דלק (ממוגרים מ-gadhan-delek)
```
