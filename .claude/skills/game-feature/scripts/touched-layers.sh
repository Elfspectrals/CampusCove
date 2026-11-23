#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
CHANGED=$(git status --porcelain | sed -E 's/^...//' | sed -E 's/.* -> //')

if [ -z "$CHANGED" ]; then
  echo "No change in the working tree."
  exit 0
fi

has() { echo "$CHANGED" | grep -qE "$1"; }
report() { if has "$1"; then echo "  [x] $2 -> skill: $3"; else echo "  [ ] $2"; fi; }

echo "Layers touched by the working tree:"
report '^map-src/|^front/public/assets/|^front/scripts/' 'Blender assets' 'blender-asset'
report '^backend/' 'Laravel API' 'backend-game-data'
report '^socket/' 'Colyseus socket' 'socket-message'
report '^front/src/' 'Front' 'game-feature'

STATUS=0
if has '^(backend|socket)/' && ! has '^docs/'; then
  echo "WARN: backend or socket changed and no docs/*.md changed. Update the contract if a payload or route moved."
  STATUS=1
fi
if has '^(backend|socket|front/src)/' && ! has '^\.claude/rules/roadmap\.md$'; then
  echo "WARN: roadmap.md unchanged. If this work is on the roadmap, update its status in the same change."
  STATUS=1
fi
if has '^front/src/' && ! has '\.test\.ts$'; then
  echo "WARN: no *.test.ts changed. Pure gameplay logic needs a sibling test."
  STATUS=1
fi
exit $STATUS
