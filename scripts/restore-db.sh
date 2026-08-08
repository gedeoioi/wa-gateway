#!/bin/bash
set -e

if [ -z "$1" ]; then
    echo "Usage: ./scripts/restore-db.sh <backup-file.sql.gz>"
    exit 1
fi

DB_NAME="${DB_NAME:-wa_gateway}"
DB_USER="${DB_USER:-root}"
DB_HOST="${DB_HOST:-localhost}"

echo "Restoring database from: $1"
gunzip -c "$1" | mysql -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME"

echo "Database restored successfully"
