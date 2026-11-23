#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${1:-HEAD}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

NEW_MESSAGES=$(git diff "$BASE_REF" -U0 -- socket/src ':!*.test.ts' \
  | grep -E "^\+.*onMessage\(\s*'[a-z0-9_]+'" \
  | sed -E "s/.*onMessage\(\s*'([a-z0-9_]+)'.*/\1/" \
  | sort -u || true)

if [ -z "$NEW_MESSAGES" ]; then
  echo "No new onMessage registration in socket/src since $BASE_REF."
  exit 0
fi

MISSING=0
while IFS= read -r MESSAGE; do
  IN_DOCS=$(grep -rlw --include='*.md' -- "$MESSAGE" docs | head -1 || true)
  IN_FRONT_TYPES=$(grep -lw -- "$MESSAGE" front/src/types/*.ts 2>/dev/null | head -1 || true)
  IN_SOCKET_TEST=$(grep -rlw --include='*.test.ts' -- "$MESSAGE" socket/src | head -1 || true)

  echo "message: $MESSAGE"
  echo "  docs contract : ${IN_DOCS:-MISSING}"
  echo "  front types   : ${IN_FRONT_TYPES:-MISSING}"
  echo "  socket test   : ${IN_SOCKET_TEST:-MISSING}"

  if [ -z "$IN_DOCS" ] || [ -z "$IN_SOCKET_TEST" ]; then
    MISSING=1
  fi
done <<< "$NEW_MESSAGES"

if [ "$MISSING" -eq 1 ]; then
  echo "FAIL: write the contract in docs/*.md (fields, types, ranges) and add a socket test."
  exit 1
fi
echo "OK: every new message has a docs contract and a socket test."
