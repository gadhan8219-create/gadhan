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

# בדיקת .env.local
if [[ ! -f .env.local ]]; then
  warn ".env.local לא נמצא — Supabase לא יעבוד"
  warn "צור .env.local לפי .env.example"
else
  ok ".env.local קיים"
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
  if [[ -d supabase/migrations ]]; then
    PENDING=$(supabase db diff --use-migra 2>/dev/null | wc -l || echo 0)
    hdr "Supabase migrations"
    if confirm "Push migrations לDB?"; then
      if echo "Y" | supabase db push 2>&1 | tee /tmp/gadhan-all-dbpush.log | tail -5; then
        ok "Migrations הועלו"
      else
        err "supabase db push נכשל"; exit 1
      fi
    else
      warn "Migrations דולגות"
    fi
  else
    warn "אין תיקיית supabase/migrations — מדלג"
  fi

  # ─────────── 4. Edge Functions ──────────────────────────────────
  hdr "Edge Functions"
  for fn in export-to-sheets manage-users generate-signing-pdf; do
    if [[ -d "supabase/functions/$fn" ]]; then
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
