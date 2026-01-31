#!/bin/sh
set -e
if [ ! -f .env ]; then
  cp .env.example .env
fi
# In Docker, override .env DB_* with container env so backend connects to postgres service
for var in DB_CONNECTION DB_HOST DB_PORT DB_DATABASE DB_USERNAME DB_PASSWORD; do
  eval "val=\$$var"
  if [ -n "$val" ]; then
    if grep -q "^${var}=" .env; then
      sed "s|^${var}=.*|${var}=${val}|" .env > .env.tmp && mv .env.tmp .env
    else
      echo "${var}=${val}" >> .env
    fi
  fi
done
exec "$@"
