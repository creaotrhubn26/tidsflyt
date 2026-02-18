#!/bin/bash
# restore.sh - Database restoration script

set -e

if [ -z "$1" ]; then
    echo "Usage: ./restore.sh <backup-file>"
    echo "Example: ./restore.sh /backups/tidsflyt/tidsflyt_backup_20260124_020000.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable not set"
    exit 1
fi

echo "WARNING: This will replace all data in the database!"
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restoration cancelled"
    exit 0
fi

echo "Starting restoration from $BACKUP_FILE at $(date)"

# Decompress if needed
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo "Decompressing backup..."
    gunzip -c "$BACKUP_FILE" > /tmp/restore_temp.sql
    RESTORE_FILE="/tmp/restore_temp.sql"
else
    RESTORE_FILE="$BACKUP_FILE"
fi

# Restore database
echo "Restoring database..."
psql "$DATABASE_URL" < "$RESTORE_FILE"

# Cleanup temp file
if [ -f "/tmp/restore_temp.sql" ]; then
    rm /tmp/restore_temp.sql
fi

echo "Restoration completed successfully at $(date)"
echo "Please verify data integrity"
