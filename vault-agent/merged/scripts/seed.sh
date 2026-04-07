#!/bin/bash
set -e

if [ -z "$DATABASE_URL" ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "Seeding database..."
psql "$DATABASE_URL" -f db/seed.sql
echo "Seed complete."
