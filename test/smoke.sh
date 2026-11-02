#!/usr/bin/env bash
# End-to-end: scaffold real projects, run `atc --yes`, then check that lint passes,
# bad commit messages are rejected and good ones go through.
# Needs network access. Run with `npm run smoke` (builds first).
set -uo pipefail

CLI="$(cd "$(dirname "$0")/.." && pwd)/dist/cli.js"
WORK=$(mktemp -d)
cd "$WORK" || exit 1
failed=0

quiet() { "$@" >/dev/null 2>&1; }

quiet npx -y create-next-app@latest next-app --yes
quiet npm create -y astro@latest astro-app -- --template minimal --install --no-git --yes
quiet npm create -y hono@latest hono-app -- --template nodejs --pm npm --install
mkdir express-app && (
  cd express-app && quiet npm init -y && quiet npm i express &&
    printf 'const express = require("express");\nexpress().listen(3000);\n' >index.js
)

check() {
  local dir=$1
  shift
  (
    cd "$dir" &&
      node "$CLI" --yes "$@" >atc.log 2>&1 &&
      npm run lint --if-present >>atc.log 2>&1 &&
      git add -A &&
      ! git commit -qm "bad message" >>atc.log 2>&1 &&
      git commit -qm "chore: setup" >>atc.log 2>&1
  ) && echo "PASS $dir $*" || {
    echo "FAIL $dir $* (log: $WORK/$dir/atc.log)"
    failed=1
  }
}

check next-app
check astro-app
check hono-app # TypeScript 7: falls back to Biome
check express-app --linter biome --casing camel

if [ $failed = 0 ]; then rm -rf "$WORK"; fi
exit $failed
