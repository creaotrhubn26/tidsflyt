# Security Best Practices

## Authentication & Authorization

### Session Security
- Sessions stored in PostgreSQL with `connect-pg-simple`
- Session TTL: 7 days
- Secure cookies in production (httpOnly, secure, sameSite)
- Session secret must be 32+ characters (cryptographically random)

### OAuth 2.0 (Replit Auth)
- OIDC compliant authentication
- Token refresh handled automatically
- Tokens never exposed to client JavaScript

### Role-Based Access Control (RBAC)
```typescript
// Three roles supported:
// - user: Default role, access to own data
// - vendor_admin: Access to vendor data
// - super_admin: Access to all vendors

// Middleware usage:
import { requireAdmin } from './middleware/auth';
app.get('/api/admin/users', requireAdmin, handler);
```

## Input Validation

### Server-Side Validation
All API endpoints must validate input using Zod schemas:

```typescript
import { validateBody } from './middleware/validation';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});

app.post('/api/users', validateBody(createUserSchema), handler);
```

### SQL Injection Prevention
- **ALWAYS** use parameterized queries
- Never concatenate user input into SQL strings
- Use Drizzle ORM or prepared statements

```typescript
// ✅ CORRECT
await db.select().from(users).where(eq(users.id, userId));
await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

// ❌ WRONG - SQL Injection vulnerability
await pool.query(`SELECT * FROM users WHERE id = ${userId}`);
```

### XSS Prevention
- DOMPurify used for all user-generated HTML content
- React automatically escapes JSX values
- Content-Security-Policy headers recommended

```typescript
import DOMPurify from 'dompurify';

const cleanHtml = DOMPurify.sanitize(userInput, {
  ALLOWED_TAGS: ['p', 'b', 'i', 'em', 'strong'],
});
```

## API Security

### API Key Authentication
For vendor API access:
- Keys hashed with SHA-256 before storage
- Rate limiting: 100 requests/minute per key
- Permissions: read-only, read-write, admin
- Key rotation: recommended every 90 days

### CORS Configuration
```typescript
const allowedOrigins = process.env.FRONTEND_ORIGINS?.split(',') || ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
```

### Rate Limiting
```typescript
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
});

app.use('/api/', apiLimiter);
```

## Data Protection

### Encryption at Rest
- Database: Neon provides AES-256 encryption
- Backups: Encrypted with GPG before storage
- Sensitive env vars: Use secrets management (not .env in production)

### Encryption in Transit
- HTTPS enforced in production
- TLS 1.2+ required
- HSTS header enabled

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

### Personal Data (GDPR)
- User consent tracked for data processing
- Data export available on request
- Data deletion with 30-day grace period
- Audit log for all data access

## Security Headers

Recommended headers for production:

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.tidsflyt.no"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
  },
}));
```

## Password Security

For admin users with password authentication:
```typescript
import bcrypt from 'bcrypt';

// Hashing
const hash = await bcrypt.hash(password, 12);

// Verification
const isValid = await bcrypt.compare(password, hash);

// Requirements:
// - Minimum 12 characters
// - At least one uppercase
// - At least one lowercase
// - At least one number
// - At least one special character
```

## Secrets Management

### Development
```bash
# .env (never commit to git)
DATABASE_URL=postgresql://...
SESSION_SECRET=your-secret-here
```

### Production
Use environment variables from hosting platform:
- Render: Environment variables in dashboard
- AWS: Secrets Manager or Parameter Store
- Docker: Docker secrets or environment files

### Secret Rotation
- Database credentials: Every 90 days
- API keys: Every 90 days or on suspected compromise
- Session secrets: Annually (requires user re-login)

## Dependency Security

### Regular Updates
```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Update dependencies
npm update
```

### Automated Security Scanning
GitHub Actions workflow includes:
- `npm audit` on every PR
- Dependabot for automatic dependency updates
- CodeQL for security scanning (optional)

## Monitoring & Incident Response

### Security Monitoring
- Failed login attempts logged
- API rate limit violations logged
- Unusual database queries logged
- All admin actions logged

### Incident Response Plan
1. Detect: Automated alerts for suspicious activity
2. Contain: Disable compromised accounts/API keys
3. Investigate: Review logs and determine scope
4. Remediate: Patch vulnerabilities, rotate secrets
5. Document: Post-mortem and lessons learned

### Log Retention
- Application logs: 30 days
- Audit logs: 1 year
- Security events: 2 years

## Compliance

### GDPR Compliance
- Privacy policy: `/personvern`
- Terms of service: `/vilkar`
- Data processing agreement available
- Right to access: API endpoint for data export
- Right to deletion: API endpoint + 30-day grace
- Data breach notification: Within 72 hours

### Norwegian Data Protection Act
- Data stored in EU (Neon EU region)
- Norwegian language privacy notices
- User consent for non-essential cookies

## Security Checklist

### Before Deployment
- [ ] All secrets in environment variables (not code)
- [ ] HTTPS enabled with valid certificate
- [ ] CORS configured for production domains only
- [ ] Rate limiting enabled
- [ ] Security headers configured (Helmet)
- [ ] SQL injection testing completed
- [ ] XSS testing completed
- [ ] Authentication tested (OAuth + sessions)
- [ ] Authorization tested (all roles)
- [ ] Input validation on all endpoints
- [ ] Error messages don't leak sensitive info
- [ ] Logging configured (no PII in logs)
- [ ] Backup and restore tested

### Regular Maintenance
- [ ] Weekly: Review security logs
- [ ] Monthly: Update dependencies
- [ ] Quarterly: Rotate API keys and secrets
- [ ] Annually: Security audit
- [ ] As needed: Penetration testing

## Reporting Security Issues

If you discover a security vulnerability:
1. **DO NOT** open a public GitHub issue
2. Email: security@tidsflyt.no
3. Include: Description, steps to reproduce, impact
4. We will respond within 48 hours
5. Coordinated disclosure after patch is available

## Resources

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- NIST Guidelines: https://www.nist.gov/cybersecurity
- Norwegian Data Protection Authority: https://www.datatilsynet.no/
