#!/bin/sh
set -e

node dist/infrastructure/database/migrate.js run
node dist/modules/catalog/seed-catalog.js

# exec replaces the shell so node is PID 1 and receives SIGTERM from `docker compose down`.
exec node dist/main.js
