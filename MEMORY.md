# MEMORY.md — זיכרון סשנים

## מצב נוכחי (2026-06-10)

### הושלם ✅
- [x] Clone ריפו ריק מ-GitHub (gadhan8219-create/gadhan)
- [x] יצירת CLAUDE.md, LEARNING.md, MEMORY.md
- [x] Copy radio project as-is
- [x] הרחבת App.tsx + Layout.tsx למודולים נוספים
- [x] מיגרציית דפי weapons (4 דפים)
- [x] מיגרציית דפי delek (2 דפים)

### ממתין 🔲
- [ ] חיבור weapons ל-Supabase (schema + queries)
- [ ] חיבור delek ל-Supabase (schema + queries)
- [ ] חתימה דיגיטלית — Supabase Storage לשמירת PDF
- [ ] תדלוק — Supabase Storage לשמירת קבלות (תמונות)
- [ ] פריסה על Vercel + הגדרת env vars

---

## החלטות ארכיטקטוניות

| נושא | החלטה | סיבה |
|------|--------|------|
| בסיס | gadhan-radio as-is | הכי מתקדם, React + Supabase מלא |
| נשקים/דלק | UI בלבד בשלב ראשון | Supabase schema טעון תכנון |
| Branch | main בלבד | פשטות — פרויקט חד-מפתח |
| ניווט | מודולים ב-sidebar | UX אחיד לכל החלקים |

---

## שאלות פתוחות

- [ ] האם weapons ו-delek ישתמשו באותו Supabase project כמו radio, או נפרד?
- [ ] Schema לנשקים — להעתיק מגאס (58 פריטים) או לשנות?
- [ ] דלק — יתרה בזמן אמת (API חיצוני) או מנוהלת ידנית ב-Supabase?

---

## לוג סשנים

| תאריך | מה נעשה |
|-------|---------|
| 2026-06-10 | יצירת פרויקט gadhan-all — מיגרציה מ-3 פרויקטים |
