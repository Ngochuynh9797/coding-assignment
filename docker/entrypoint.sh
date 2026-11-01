#!/bin/sh
set -e

node dist/infrastructure/database/migrate.js run

# The catalog seed is test data for local runs; a real deployment leaves SEED_CATALOG unset.
if [ "$SEED_CATALOG" = "true" ]; then
  node dist/seeds/catalog/seed-catalog.js
fi

# exec replaces the shell so node is PID 1 and receives SIGTERM from `docker compose down`.
exec node dist/main.js
