# Deployment Guide

## Prerequisites

- Node.js 20.x or higher
- PostgreSQL 14+ database (Neon recommended)
- Domain name with SSL certificate
- Sentry account (optional, for error monitoring)

## Environment Variables

### Required
```bash
DATABASE_URL=postgresql://user:password@host:5432/database
SESSION_SECRET=your-random-secret-min-32-chars
REPL_ID=your-replit-oauth-client-id
ISSUER_URL=https://replit.com/oidc
```

### Optional
```bash
SENTRY_DSN=https://your-sentry-dsn
VITE_SENTRY_DSN=https://your-frontend-sentry-dsn
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
NODE_ENV=production
PORT=5000
```

## Deployment Steps

### 1. Database Setup

```bash
# Run migrations
npm run db:push

# Or manually run migrations
psql $DATABASE_URL < migrations/001_persistence_schema.sql
```

### 2. Build Application

```bash
# Install dependencies
npm ci --production=false

# Build frontend and backend
npm run build

# Verify build
ls -lh dist/
```

### 3. Production Server

#### Option A: Node.js (Recommended)
```bash
# Start production server
NODE_ENV=production npm start
```

#### Option B: Docker
```bash
# Build image
docker build -t tidsflyt .

# Run container
docker run -p 5000:5000 --env-file .env tidsflyt
```

#### Option C: PM2 (Process Manager)
```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start dist/index.cjs --name tidsflyt

# Enable startup script
pm2 startup
pm2 save
```

### 4. Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name tidsflyt.no www.tidsflyt.no;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tidsflyt.no www.tidsflyt.no;

    ssl_certificate /etc/letsencrypt/live/tidsflyt.no/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tidsflyt.no/privkey.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 5. Health Checks

The application exposes health endpoints:

- `GET /health` - Basic health check
- `GET /api/health` - Detailed health status

Configure monitoring to check these endpoints every 30-60 seconds.

## Monitoring & Logging

### Application Logs
```bash
# View logs with PM2
pm2 logs tidsflyt

# View logs with Docker
docker logs -f container-id

# View logs directly
tail -f /var/log/tidsflyt/app.log
```

### Error Monitoring
Sentry is configured to capture:
- Unhandled exceptions
- API errors (500+)
- Client-side errors
- Performance issues

### Performance Monitoring
- Monitor response times via Sentry Performance
- Database query performance via Neon dashboard
- Server metrics via PM2 or cloud provider dashboard

## Backup & Recovery

### Database Backups

#### Automated (Neon)
Neon provides automatic daily backups with 7-day retention.

#### Manual Backup
```bash
# Backup database
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore database
psql $DATABASE_URL < backup-20260124.sql
```

### Application State
User data is stored in PostgreSQL - no local state to back up.

## Rollback Procedure

### Quick Rollback
```bash
# With PM2
pm2 stop tidsflyt
pm2 delete tidsflyt
# Deploy previous version
npm start

# With Docker
docker stop tidsflyt
docker run -p 5000:5000 --env-file .env tidsflyt:previous-tag
```

### Database Rollback
```bash
# Restore from backup
psql $DATABASE_URL < backup-previous.sql
```

## Security Checklist

- [ ] HTTPS enabled with valid SSL certificate
- [ ] Environment variables secured (not in code)
- [ ] Database credentials rotated
- [ ] CORS configured for production domains only
- [ ] Rate limiting enabled on API endpoints
- [ ] Session secret is cryptographically random (32+ chars)
- [ ] SQL injection protection (parameterized queries)
- [ ] XSS protection (DOMPurify on user input)
- [ ] CSRF protection enabled
- [ ] Security headers configured (helmet.js)

## Performance Optimization

### Frontend
- Vite build with code splitting
- Lazy loading for routes
- Image optimization
- CDN for static assets (optional)

### Backend
- Database connection pooling
- Query optimization with indexes
- Response caching for static data
- Compression middleware enabled

### Database
- Indexes on frequently queried columns
- Connection pooling (pg pool)
- Query performance monitoring

## Troubleshooting

### Port Already in Use
```bash
# Find process
lsof -i :5000

# Kill process
kill -9 <PID>
```

### Database Connection Failed
```bash
# Test connection
psql $DATABASE_URL

# Check connection pool
# View active connections in PostgreSQL
SELECT * FROM pg_stat_activity;
```

### Build Failures
```bash
# Clear cache
rm -rf node_modules dist
npm install
npm run build
```

## Support

- Documentation: `/docs`
- API Docs: `/api-docs`
- Support Email: support@tidsflyt.no
- GitHub Issues: https://github.com/creaotrhubn26/tidsflyt/issues
