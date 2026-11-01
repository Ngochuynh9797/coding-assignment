#!/bin/sh
set -e

# Migrations are wired in by T3.1 and the catalog seed by T3.2, before the app starts.

# exec replaces the shell so node is PID 1 and receives SIGTERM from `docker compose down`.
exec node dist/main.js
