# Backup and Disaster Recovery Plan

## Overview
This document outlines the backup strategy and disaster recovery procedures for Tidsflyt.

## Backup Strategy

### Database Backups

#### Automated Backups (Neon Database)
- **Frequency**: Daily at 02:00 UTC
- **Retention**: 7 days (free tier), 30 days (paid tier)
- **Type**: Full database snapshot
- **Storage**: Neon cloud storage (encrypted)

#### Manual Backup Script
```bash
#!/bin/bash
# backup.sh - Manual database backup script

BACKUP_DIR="/backups/tidsflyt"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/tidsflyt_backup_$DATE.sql"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Perform backup
pg_dump $DATABASE_URL > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE

# Upload to cloud storage (optional)
# aws s3 cp $BACKUP_FILE.gz s3://your-backup-bucket/

# Keep only last 30 days of backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE.gz"
```

#### Schedule with Cron
```bash
# Add to crontab
0 2 * * * /path/to/backup.sh >> /var/log/tidsflyt-backup.log 2>&1
```

### Application Files
- **Code**: Stored in Git repository (GitHub)
- **Environment**: `.env` file backed up securely (encrypted)
- **Uploads**: `/uploads` directory backed up daily

## Recovery Procedures

### Database Restore

#### From Neon Backup
1. Log into Neon Console
2. Navigate to your project
3. Go to "Backups" tab
4. Select backup point
5. Click "Restore"

#### From Manual Backup
```bash
# Decompress backup
gunzip tidsflyt_backup_20260124_020000.sql.gz

# Restore database
psql $DATABASE_URL < tidsflyt_backup_20260124_020000.sql

# Verify restoration
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
```

### Application Restore

```bash
# Clone repository
git clone https://github.com/creaotrhubn26/tidsflyt.git
cd tidsflyt

# Checkout specific version if needed
git checkout v1.2.3

# Install dependencies
npm ci

# Restore environment variables
cp .env.backup .env

# Build and start
npm run build
npm start
```

## Disaster Recovery Scenarios

### Scenario 1: Database Corruption
**RTO**: 1 hour | **RPO**: 24 hours

1. Identify corruption extent
2. Stop application
3. Restore from latest backup
4. Verify data integrity
5. Restart application
6. Monitor for issues

### Scenario 2: Complete Server Failure
**RTO**: 4 hours | **RPO**: 24 hours

1. Provision new server
2. Install dependencies (Node.js, PostgreSQL client)
3. Clone repository
4. Restore database from backup
5. Configure environment variables
6. Deploy application
7. Update DNS if needed
8. Verify functionality

### Scenario 3: Data Loss (User Error)
**RTO**: 30 minutes | **RPO**: Point-in-time

1. Identify affected data
2. Create snapshot of current state
3. Query backup for specific records
4. Restore specific data using SQL
5. Verify restoration with user
6. Document incident

## Data Retention Policy

### Production Data
- **Time entries**: Retained indefinitely
- **User accounts**: Retained while active, 90 days after deletion
- **Audit logs**: 1 year
- **Reports**: Retained indefinitely

### Backups
- **Daily backups**: 30 days
- **Weekly backups**: 12 weeks
- **Monthly backups**: 12 months
- **Yearly backups**: 7 years (compliance)

### Personal Data (GDPR)
- Users can request data export (JSON format)
- Users can request data deletion (30-day grace period)
- Deleted data purged from backups after 90 days

## Monitoring & Alerts

### Backup Monitoring
```bash
# Check last backup status
#!/bin/bash
LATEST_BACKUP=$(ls -t /backups/tidsflyt/*.sql.gz | head -1)
BACKUP_AGE=$(find $LATEST_BACKUP -mtime +1)

if [ -n "$BACKUP_AGE" ]; then
    echo "WARNING: Latest backup is older than 24 hours"
    # Send alert email
fi
```

### Alerts Configuration
- Backup failure → Email + SMS to admin
- Database connection issues → Email to DevOps
- Disk space low (>80%) → Email warning

## Testing Recovery

### Monthly Recovery Test
1. Restore backup to staging environment
2. Verify data integrity
3. Test application functionality
4. Document results
5. Update procedures if needed

### Quarterly Disaster Recovery Drill
1. Simulate complete failure
2. Execute full recovery procedure
3. Measure RTO/RPO compliance
4. Identify improvement areas
5. Update documentation

## Security

### Backup Encryption
```bash
# Encrypt backup before storage
gpg --encrypt --recipient admin@tidsflyt.no backup.sql
```

### Access Control
- Backups stored in secure location
- Access limited to authorized personnel
- Backup credentials rotated quarterly
- All backup access logged

## Contact Information

### Emergency Contacts
- **Primary**: DevOps Lead - +47 XXX XX XXX
- **Secondary**: CTO - +47 XXX XX XXX
- **Database Admin**: DBA - +47 XXX XX XXX

### Service Providers
- **Database**: Neon (support@neon.tech)
- **Hosting**: Provider support
- **DNS**: Cloudflare support

## Changelog

| Date | Changes | Author |
|------|---------|--------|
| 2026-01-24 | Initial backup policy created | System |
| | | |
