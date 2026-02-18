#!/bin/bash
# backup.sh - Automated backup script for Tidsflyt

set -e

BACKUP_DIR="${BACKUP_DIR:-/backups/tidsflyt}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/tidsflyt_backup_$DATE.sql"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "Starting backup at $(date)"

# Perform database backup
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable not set"
    exit 1
fi

pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

# Compress backup
gzip "$BACKUP_FILE"
echo "Backup created: $BACKUP_FILE.gz"

# Calculate backup size
SIZE=$(du -h "$BACKUP_FILE.gz" | cut -f1)
echo "Backup size: $SIZE"

# Remove old backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "Removed backups older than $RETENTION_DAYS days"

# Upload to cloud storage (optional)
if [ -n "$AWS_S3_BUCKET" ]; then
    echo "Uploading to S3..."
    aws s3 cp "$BACKUP_FILE.gz" "s3://$AWS_S3_BUCKET/backups/"
    echo "Upload completed"
fi

echo "Backup completed successfully at $(date)"
