#!/usr/bin/env bash
# deploy.sh — one-shot deploy for gadhan-all (CRM מאוחד).
#
# Vercel מחובר ל-GitHub: push ל-main מפעיל deploy אוטומטי.
# הסקריפט מטפל בכל השאר.
#
# שלבים:
#   1. בדיקות סביבה (כלים + תיקייה).
#   2. Build מקומי (TypeScript + Vite) — fails fast.
#   3. Supabase migrations (schema DB).
#   4. Supabase Edge Functions.
#   5. Git commit & push → מפעיל Vercel auto-deploy.
#
# שימוש:
#   bash deploy.sh                    # אינטראקטיבי
#   bash deploy.sh --yes              # ללא שאלות
#   bash deploy.sh -m "תיאור שינוי"  # הודעת commit מותאמת
#   bash deploy.sh --skip-supabase    # דלג על Supabase
#   bash deploy.sh --skip-build       # דלג על build
#
# Flags:
#   --yes / -y          ללא אישורים
#   --skip-build        דלג על build
#   --skip-supabase     דלג על migrations + functions
#   --skip-git          דלג על commit/push (Vercel לא יופעל)
#   --message / -m "…"  הודעת commit מותאמת

set -e
cd "$(dirname "$0")"

# ─────────────────────────── colors ────────────────────────────
if [[ -t 1 ]]; then
  C_RST=$'\033[0m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_CYN=$'\033[36m'
else
  C_RST=''; C_DIM=''; C_BOLD=''; C_RED=''; C_GRN=''; C_YEL=''; C_CYN=''
fi

say()  { printf "%s\n" "$*"; }
hdr()  { printf "\n${C_BOLD}${C_CYN}▸ %s${C_RST}\n" "$*"; }
ok()   { printf "  ${C_GRN}✓${C_RST} %s\n" "$*"; }
warn() { printf "  ${C_YEL}⚠${C_RST} %s\n" "$*"; }
err()  { printf "  ${C_RED}✗${C_RST} %s\n" "$*" >&2; }

# ─────────────────────────── flags ─────────────────────────────
YES=0
SKIP_BUILD=0
SKIP_SUPABASE=0
SKIP_GIT=0
COMMIT_MSG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)         YES=1 ;;
    --skip-build)     SKIP_BUILD=1 ;;
    --skip-supabase)  SKIP_SUPABASE=1 ;;
    --skip-git)       SKIP_GIT=1 ;;
    --message|-m)     shift; COMMIT_MSG="$1" ;;
    -h|--help)
      sed -n '1,28p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) err "Flag לא מוכר: $1"; exit 1 ;;
  esac
  shift
done

confirm() {
  [[ $YES -eq 1 ]] && return 0
  local prompt="$1"
  read -r -p "  ${prompt} [Y/n] " ans
  [[ -z "$ans" || "$ans" =~ ^[Yy]$ ]]
}

# ───────────────── 1. בדיקות סביבה ─────────────────────────────
hdr "בדיקות סביבה"

[[ -f package.json && -f vercel.json ]] || {
  err "הרץ מתוך תיקיית gadhan-all."; exit 1
}
ok "תיקייה: $(pwd)"

# טען .env.local אם קיים (לקריאת SUPABASE_PROJECT_REF + SUPABASE_DB_PASSWORD)
if [[ -f .env.local ]]; then
  # export רק SUPABASE_* ו-VITE_* ללא שורות הערה
  set -a
  # shellcheck disable=SC1091
  grep -E '^(SUPABASE_|VITE_)' .env.local | while IFS='=' read -r key val; do
    export "$key"="$val"
  done
  # שיטה ישירה יותר
  export SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY
  eval "$(grep -E '^(SUPABASE_|VITE_)' .env.local | sed 's/^/export /')"
  set +a
  ok ".env.local נטען"
else
  warn ".env.local לא נמצא — Supabase לא יעבוד"
  warn "צור .env.local לפי .env.example"
fi

need() {
  command -v "$1" >/dev/null 2>&1 || { err "חסר: $1"; MISSING=1; }
}
MISSING=0
need npm
need git
[[ $SKIP_SUPABASE -eq 0 ]] && need supabase
[[ $MISSING -eq 1 ]] && { err "התקן כלים חסרים ונסה שוב."; exit 1; }
ok "כלים: npm git$([ $SKIP_SUPABASE -eq 0 ] && echo ' supabase')"

# בדיקת branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  err "אתה על branch '$BRANCH' — חייב להיות על main"
  exit 1
fi
ok "Branch: main ✓"

# ───────────────── 2. build מקומי ───────────────────────────────
if [[ $SKIP_BUILD -eq 0 ]]; then
  hdr "Build מקומי (tsc + vite build)"
  if confirm "הרץ build לפני push?"; then
    if npm run build > /tmp/gadhan-all-build.log 2>&1; then
      ok "Build עבר בהצלחה"
    else
      err "Build נכשל. שגיאות:"
      tail -30 /tmp/gadhan-all-build.log
      exit 1
    fi
  else
    warn "Build דולג"
  fi
fi

# ────────────── 3. Supabase migrations ──────────────────────────
if [[ $SKIP_SUPABASE -eq 0 ]]; then
  if [[ ! -d supabase/migrations ]]; then
    warn "אין תיקיית supabase/migrations — מדלג"
  else
    hdr "Supabase migrations"

    # וודא שה-CLI מקושר לפרויקט עם סיסמת DB
    if [[ -n "$SUPABASE_PROJECT_REF" && -n "$SUPABASE_DB_PASSWORD" ]]; then
      supabase link \
        --project-ref "$SUPABASE_PROJECT_REF" \
        --password "$SUPABASE_DB_PASSWORD" 2>/dev/null || true
      ok "Supabase מקושר: $SUPABASE_PROJECT_REF"
    else
      warn "SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD חסרים ב-.env.local"
      warn "הוסף אותם כדי לאפשר push אוטומטי של migrations"
    fi

    # בדוק אילו migrations ממתינות
    say "  ${C_DIM}בודק migrations...${C_RST}"
    MIG_OUT=$(supabase migration list 2>&1 || true)

    # זיהוי חסימת רשת (TLS timeout / no route)
    if echo "$MIG_OUT" | grep -qi "tls error\|no route to host\|i/o timeout"; then
      warn "חיבור ישיר ל-DB חסום ברשת (TLS/firewall)"
      say ""
      say "  ${C_YEL}הרץ migrations ידנית:${C_RST}"
      say "  1. פתח: ${C_CYN}https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/sql/new${C_RST}"
      say "  2. העתק: ${C_CYN}supabase/full-schema.sql${C_RST}"
      say "  3. לחץ Run"
      say ""
      if confirm "המשך ל-git push בלי migrations?"; then
        warn "Migrations דולגות — DB לא עודכן"
      else
        exit 1
      fi
    fi

    # ספור שורות שיש להן LOCAL timestamp אבל REMOTE ריק (ממתינות)
    PENDING_COUNT=$(echo "$MIG_OUT" | grep -cE "\│\s+[0-9]{14}\s+\│\s*\│" 2>/dev/null || echo 0)
    # fallback — אם כל ה-migrations ממתינות (DB ריק)
    if echo "$MIG_OUT" | grep -qi "error\|failed\|no migrations"; then
      PENDING_COUNT=0
    fi

    # הצג טבלת סטטוס
    say ""
    echo "$MIG_OUT" | grep -v "^A new version\|^We recommend" | sed 's/^/    /' || true
    say ""

    # בדוק אם יש משהו להחיל
    LOCAL_COUNT=$(ls supabase/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
    APPLIED_COUNT=$(echo "$MIG_OUT" | grep -cE "[0-9]{14}.*[0-9]{14}" 2>/dev/null || echo 0)
    NEED_PUSH=$(( LOCAL_COUNT - APPLIED_COUNT ))

    if [[ $NEED_PUSH -gt 0 ]]; then
      say "  ${C_YEL}יש ${NEED_PUSH} migrations לא מוחלות מתוך ${LOCAL_COUNT}${C_RST}"
      say ""
      if confirm "הרץ supabase db push?"; then
        say ""
        if supabase db push 2>&1 | tee /tmp/gadhan-all-dbpush.log \
            | grep --line-buffered -E "Applying|Applied|Error|error|failed|migrations" \
            | sed 's/^/    /'; then
          ok "Migrations הוחלו בהצלחה"
        else
          err "supabase db push נכשל — לוג: /tmp/gadhan-all-dbpush.log"
          cat /tmp/gadhan-all-dbpush.log | tail -20 | sed 's/^/    /'
          exit 1
        fi
      else
        warn "Migrations דולגות"
      fi
    else
      ok "DB מעודכן — כל ${LOCAL_COUNT} migrations מוחלות"
    fi
  fi

  # ─────────── 4. Edge Functions ──────────────────────────────────
  hdr "Edge Functions"
  FUNCS_FOUND=0
  for fn in export-to-sheets manage-users generate-signing-pdf; do
    if [[ -d "supabase/functions/$fn" ]]; then
      FUNCS_FOUND=1
      if confirm "Deploy function '$fn'?"; then
        if supabase functions deploy "$fn" 2>&1 | tail -3; then
          ok "$fn — deployed"
        else
          err "Deploy נכשל: $fn"; exit 1
        fi
      else
        warn "דולג: $fn"
      fi
    fi
  done
  [[ $FUNCS_FOUND -eq 0 ]] && ok "אין Edge Functions להעלאה"
fi

# ────────────── 5. git commit & push → Vercel ───────────────────
if [[ $SKIP_GIT -eq 0 ]]; then
  hdr "Git commit & push (מפעיל Vercel auto-deploy)"

  CHANGED=$(git status --porcelain)
  if [[ -n "$CHANGED" ]]; then
    say ""
    git status --short | sed 's/^/    /'
    say ""
    if confirm "Commit ו-push?"; then
      if [[ -z "$COMMIT_MSG" ]]; then
        # הודעת default עם timestamp
        COMMIT_MSG="deploy: $(date '+%Y-%m-%d %H:%M')"
      fi
      git add -A
      git commit -m "$COMMIT_MSG"
      git push origin main
      ok "Pushed: $COMMIT_MSG"
      say ""
      say "  ${C_DIM}Vercel מבצע deploy — בדוק סטטוס:${C_RST}"
      say "  ${C_CYN}https://vercel.com/dashboard${C_RST}"
    else
      warn "Git דולג — Vercel לא יופעל"
    fi
  else
    ok "Working tree נקי — אין שינויים לפוש"
    say "  ${C_DIM}(Vercel לא יופעל — אין שינויים)${C_RST}"
  fi
fi

hdr "סיום"
ok "כל השלבים הושלמו."
