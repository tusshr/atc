#!/usr/bin/env bash
# End-to-end: scaffold real projects, run `atc --yes`, then check the result actually works:
# lint passes (including framework route files), files really got formatted, existing scripts
# survive, production installs work, and commit messages are checked.
#
# Needs network access. Run with `npm run smoke` (builds first).
# Projects are created under $ATC_SMOKE_DIR (default ~/.cache/atc-smoke, not /tmp, which is often
# a small RAM disk) and always deleted afterwards. Logs of failed checks are kept.
set -uo pipefail

CLI="$(cd "$(dirname "$0")/.." && pwd)/dist/cli.js"
BASE="${ATC_SMOKE_DIR:-$HOME/.cache/atc-smoke}"
mkdir -p "$BASE"
WORK=$(mktemp -d "$BASE/run-XXXXXX")
LOGS="$BASE/logs"
failed=0

cleanup() {
  rm -rf "$LOGS" && mkdir -p "$LOGS"
  for log in "$WORK"/*/atc.log; do [ -f "$log" ] && cp "$log" "$LOGS/$(basename "$(dirname "$log")").log"; done
  rm -rf "$WORK"
  [ $failed = 0 ] && rm -rf "$LOGS"
}
trap cleanup EXIT
cd "$WORK" || exit 1

quiet() { "$@" >/dev/null 2>&1; }
UGLY='export   const   answer =   42'

echo "Scaffolding projects in $WORK"
quiet npx -y create-next-app@latest next-app --yes
quiet npm create -y astro@latest astro-app -- --template minimal --install --no-git --yes
quiet npm create -y hono@latest hono-app -- --template nodejs --pm npm --install
mkdir express-app && (
  cd express-app && quiet npm init -y && quiet npm i express &&
    quiet npm pkg set scripts.prepare="echo prepared" &&
    printf 'const express = require("express");\nexpress().listen(3000);\n' >index.js
)

# Valid dynamic routes must not trip the file naming rules.
mkdir -p "next-app/app/blog/[slug]"
printf 'export default function Post() {\n  return null;\n}\n' >"next-app/app/blog/[slug]/page.tsx"
printf -- '---\n---\n\n<p>post</p>\n' >"astro-app/src/pages/[slug].astro"

# Unformatted files: atc must actually format them.
for d in next-app astro-app hono-app; do mkdir -p "$d/src" && printf '%s\n' "$UGLY" >"$d/src/ugly.ts"; done
printf '%s\n' "$UGLY" >express-app/ugly.js

# expect <what> <command...>: run in the current project, log failures.
expect() {
  local what=$1
  shift
  "$@" >>atc.log 2>&1 || {
    echo ">>> expected: $what" >>atc.log
    return 1
  }
}

report() { # report <ok> <name>
  if [ "$1" = 0 ]; then echo "PASS $2"; else
    echo "FAIL $2 (log: $LOGS/${2%% *}.log)"
    failed=1
  fi
}

check() { # check <dir> <unformatted file> [atc flags...]
  local dir=$1 ugly=$2
  shift 2
  (
    cd "$dir" &&
      expect "atc succeeds" node "$CLI" --yes "$@" &&
      expect "lint passes" npm run lint --if-present &&
      expect "$ugly was formatted" sh -c "! grep -qF '$UGLY' '$ugly'" &&
      git add -A &&
      expect "bad commit message rejected" sh -c '! git commit -qm "bad message"' &&
      expect "good commit message accepted" git commit -qm "chore: setup"
  )
  report $? "$dir $*"
}

check next-app src/ugly.ts
check astro-app src/ugly.ts
check hono-app src/ugly.ts # TypeScript 7: falls back to Biome
check express-app ugly.js --linter biome --casing camel

# Existing scripts survive, and production installs work without dev dependencies.
(
  cd express-app &&
    expect "prepare script kept and extended" \
      sh -c 'npm pkg get scripts.prepare | grep -qF "echo prepared && (husky || true)"' &&
    expect "npm ci --omit=dev works" npm ci --omit=dev --no-audit --no-fund
)
report $? "express-app scripts + production install"

exit $failed
