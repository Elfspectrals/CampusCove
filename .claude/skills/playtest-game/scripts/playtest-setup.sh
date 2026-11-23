#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
REQUIRED_CONTAINERS="campuscove-front campuscove-backend campuscove-socket campuscove-db"
RUNNING=$(docker ps --format '{{.Names}}')

for CONTAINER in $REQUIRED_CONTAINERS; do
  if ! echo "$RUNNING" | grep -qx "$CONTAINER"; then
    echo "FAIL: $CONTAINER is not running. Run: make up"
    exit 1
  fi
done

make playtest-accounts
echo "OK: stack up and playtest accounts reset. Credentials: backend/database/seeders/PlaytestAccountSeeder.php"
