# New Features Implementation

## ✅ Implemented Features

### 1. Export Functionality (PDF/Excel/CSV)
**Status**: ✅ Complete
**Location**: `/api/export/*`

#### Features:
- **Excel Export** (`GET /api/export/excel`): Full-featured Excel files with formatting, borders, totals
- **CSV Export** (`GET /api/export/csv`): UTF-8 with BOM for Excel compatibility
- **PDF Export** (`GET /api/export/pdf`): Professional HTML template (ready for PDF conversion)

#### Usage:
```typescript
// From Reports page
GET /api/export/excel?startDate=2024-01-01&endDate=2024-01-31&userId=default&includeNotes=true
GET /api/export/csv?startDate=2024-01-01&endDate=2024-01-31&userId=default
GET /api/export/pdf?startDate=2024-01-01&endDate=2024-01-31&userId=default
```

#### Files:
- `server/lib/export-service.ts` - Export logic
- `server/routes/export-routes.ts` - API endpoints
- `client/src/pages/reports.tsx` - Updated UI

---

### 2. Email Notification System
**Status**: ✅ Complete
**Location**: `server/lib/email-service.ts`

#### Features:
- **SMTP Integration**: Nodemailer with full configuration
- **Time Reminders**: Weekly reminders to log hours
- **Approval Notifications**: Auto-notify when hours approved/rejected
- **Leave Requests**: Notify managers of leave requests
- **Weekly Timesheet**: Auto-send timesheets with attachments

#### Configuration:
Add to `.env`:
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Smart Timing <noreply@tidsflyt.no>"
MANAGER_EMAIL=manager@company.com
APP_URL=https://tidsflyt.no
```

#### Usage:
```typescript
import { emailService } from './lib/email-service';

// Send time reminder
await emailService.sendTimeReminder('user@example.com', 'John Doe', 42);

// Send approval notification
await emailService.sendApprovalNotification(
  'user@example.com',
  'John Doe',
  40,
  'Uke 42',
  'Manager Name',
  'approved',
  'Looks good!'
);
```

---

### 3. Leave/Vacation Management
**Status**: ✅ Complete
**Location**: `/api/leave/*`

#### Features:
- **Leave Types**: Vacation, sick leave, care leave, unpaid leave, parental leave
- **Balance Tracking**: Track total, used, pending, remaining days per type
- **Leave Requests**: Submit requests with approval workflow
- **Approval System**: Managers can approve/reject with comments
- **Automatic Calculations**: Updates balances when approved/rejected

#### API Endpoints:
```typescript
GET  /api/leave/types - Get all leave types
GET  /api/leave/balance?userId=default&year=2024 - Get user's balance
POST /api/leave/balance/initialize - Initialize balances
GET  /api/leave/requests?userId=default&status=pending - Get requests
POST /api/leave/requests - Create new request
PATCH /api/leave/requests/:id - Approve/reject request
```

#### UI:
- **Page**: `client/src/pages/leave.tsx`
- **Features**: Balance cards, request form, status tracking

---

### 4. Recurring Time Entries
**Status**: ✅ Complete  
**Location**: `/api/recurring/*`

#### Features:
- **Recurrence Types**: Daily, Weekly (select days), Monthly (select day)
- **Auto-Generation**: Cron job runs daily at 00:05
- **Smart Scheduling**: Won't create duplicates
- **Active/Inactive**: Toggle recurring entries on/off

#### API Endpoints:
```typescript
GET  /api/recurring?userId=default - Get recurring entries
POST /api/recurring - Create recurring entry
PATCH /api/recurring/:id - Update entry
DELETE /api/recurring/:id - Delete entry
POST /api/recurring/generate - Manual trigger (for testing)
```

#### Example Request:
```json
{
  "userId": "default",
  "title": "Daily standup",
  "description": "Morning team meeting",
  "activity": "Meeting",
  "project": "Management",
  "hours": 0.5,
  "recurrenceType": "weekly",
  "recurrenceDays": ["monday", "wednesday", "friday"],
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}
```

---

### 5. Invoice Generation
**Status**: ✅ Complete
**Location**: `/api/invoices/*`

#### Features:
- **Auto-Generate**: Create invoices from time entries
- **Professional PDF**: Norwegian invoice format with MVA
- **Line Items**: Groups by project/activity
- **Status Tracking**: draft, sent, paid, overdue, cancelled
- **Payment Tracking**: Record payment date and method

#### API Endpoints:
```typescript
GET  /api/invoices?userId=default&status=draft - List invoices
GET  /api/invoices/:id - Get invoice with line items
POST /api/invoices/generate - Generate from time entries
PATCH /api/invoices/:id - Update invoice
DELETE /api/invoices/:id - Delete invoice
GET  /api/invoices/:id/pdf - Export as PDF
```

#### Generate Invoice:
```json
{
  "userId": "default",
  "clientName": "Acme AS",
  "clientEmail": "invoice@acme.no",
  "clientAddress": "Storgata 1\n0123 Oslo",
  "periodStart": "2024-01-01",
  "periodEnd": "2024-01-31",
  "dueDate": "2024-02-14",
  "taxRate": 25,
  "notes": "Betaling innen 14 dager"
}
```

---

### 6. Overtime Tracking
**Status**: ✅ Complete
**Location**: `/api/overtime/*`

#### Features:
- **Configurable Thresholds**: Set standard hours per day/week
- **Rate Multipliers**: 1.5x for overtime, 2x for double-time
- **Auto-Calculate**: Batch calculate overtime for any period
- **Approval Workflow**: Optional approval for overtime hours
- **Monthly Summary**: Aggregated overtime reports

#### API Endpoints:
```typescript
GET  /api/overtime/settings?userId=default - Get user settings
PUT  /api/overtime/settings - Update settings
POST /api/overtime/calculate - Calculate overtime for period
GET  /api/overtime/entries?userId=default&startDate=...&endDate=... - Get entries
PATCH /api/overtime/entries/:id - Approve/reject
GET  /api/overtime/summary?userId=default&year=2024 - Monthly summary
```

#### Settings:
```json
{
  "userId": "default",
  "standardHoursPerDay": 7.5,
  "standardHoursPerWeek": 37.5,
  "overtimeRateMultiplier": 1.5,
  "doubleTimeThreshold": 12,
  "trackOvertime": true,
  "requireApproval": false
}
```

---

## 📦 Dependencies Added

```json
{
  "dependencies": {
    "nodemailer": "^6.9.x",
    "@types/nodemailer": "^6.4.x",
    "node-cron": "^3.0.x",
    "@types/node-cron": "^3.0.x",
    "date-fns-tz": "^2.0.x"
  },
  "devDependencies": {
    "jspdf": "^2.5.x",
    "jspdf-autotable": "^3.8.x",
    "xlsx": "^0.18.x",
    "exceljs": "^4.4.x"
  }
}
```

---

## 🗄️ Database Schema

New tables added in `server/migrations/004_add_new_features.sql`:

- `leave_types` - Types of leave (vacation, sick, etc.)
- `leave_balances` - User leave balances per year
- `leave_requests` - Leave request submissions
- `recurring_entries` - Recurring time entry templates
- `overtime_settings` - User overtime configuration
- `overtime_entries` - Calculated overtime records
- `invoices` - Invoice headers
- `invoice_line_items` - Invoice line items
- `notification_queue` - Notification delivery queue

**Run migration:**
```bash
psql $DATABASE_URL < server/migrations/004_add_new_features.sql
```

---

## 🚀 Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Database Migration
```bash
psql $DATABASE_URL < server/migrations/004_add_new_features.sql
```

### 3. Configure Environment Variables
```bash
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Smart Timing <noreply@tidsflyt.no>"
MANAGER_EMAIL=manager@company.com

# App URL
APP_URL=https://tidsflyt.no
```

### 4. Initialize Leave Balances (for existing users)
```bash
curl -X POST http://localhost:5000/api/leave/balance/initialize \
  -H "Content-Type: application/json" \
  -d '{"userId": "default", "year": 2024}'
```

### 5. Test Features

**Export:**
```bash
curl "http://localhost:5000/api/export/excel?startDate=2024-01-01&endDate=2024-01-31&userId=default" -o report.xlsx
```

**Leave Request:**
```bash
curl -X POST http://localhost:5000/api/leave/requests \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "default",
    "leaveTypeId": 1,
    "startDate": "2024-06-01",
    "endDate": "2024-06-14",
    "days": 10,
    "reason": "Summer vacation"
  }'
```

**Generate Invoice:**
```bash
curl -X POST http://localhost:5000/api/invoices/generate \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "default",
    "clientName": "Test Client AS",
    "periodStart": "2024-01-01",
    "periodEnd": "2024-01-31"
  }'
```

---

## 📝 Usage Examples

### Recurring Entries - Create Weekly Standup
```typescript
await apiRequest("POST", "/api/recurring", {
  userId: "default",
  title: "Daily Standup",
  activity: "Meeting",
  hours: 0.25,
  recurrenceType: "weekly",
  recurrenceDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  startDate: "2024-01-01",
  endDate: "2024-12-31"
});
```

### Calculate Overtime for Month
```typescript
await apiRequest("POST", "/api/overtime/calculate", {
  userId: "default",
  startDate: "2024-01-01",
  endDate: "2024-01-31"
});
```

### Export Report as Excel
```typescript
window.location.href = `/api/export/excel?startDate=${startDate}&endDate=${endDate}&userId=default`;
```

---

## 🎨 UI Components Created

1. **Leave Management** (`client/src/pages/leave.tsx`)
   - Balance cards with remaining days
   - Request form with calendar picker
   - Request history table

2. **Reports Export** (Updated `client/src/pages/reports.tsx`)
   - Export dropdown with PDF/Excel/CSV
   - Real API integration

---

## ⚠️ Important Notes

1. **Email Service**: Requires SMTP configuration. Will gracefully fail if not configured.

2. **Recurring Cron Job**: Runs daily at 00:05. Set `NODE_ENV=production` to enable.

3. **Leave Balances**: Must be initialized for each user before use.

4. **Overtime Calculation**: Must be triggered manually or via scheduled job.

5. **Invoice Numbers**: Auto-generated as `INV-YYYYMMDD-XXX`.

6. **Timezones**: All dates stored in UTC, formatted to Norwegian (nb) locale.

---

## 🔧 Troubleshooting

**Email not sending:**
- Check SMTP credentials in `.env`
- Verify app password (not regular password) for Gmail
- Check firewall/port 587 access

**Recurring entries not generating:**
- Verify cron job is running: check server logs for "⏰ Running recurring entries cron job..."
- Manually trigger: `POST /api/recurring/generate`

**Leave balance showing 0:**
- Run balance initialization: `POST /api/leave/balance/initialize`

**Export downloads empty file:**
- Check date range has data
- Verify user has entries in period

---

## 🎯 Next Steps

1. **Mobile App**: Use Expo React Native for iOS/Android
2. **Real-time Updates**: Add WebSocket for live notifications
3. **Advanced Analytics**: Predictive forecasting and burn-down charts
4. **Integrations**: Slack, Microsoft Teams, QuickBooks
5. **Calendar Sync**: iCal/Google Calendar export

---

## 📄 License

MIT
