#!/bin/bash
set -e

if [ -z "$DATABASE_URL" ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "Running migrations against: $DATABASE_URL"
psql "$DATABASE_URL" -f db/schema.sql
echo "Migration complete."
