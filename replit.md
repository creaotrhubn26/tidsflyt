# Tidsflyt

## Overview

Tidsflyt is a professional time tracking and workforce management application designed for Norwegian businesses. Domain: tidsflyt.no It provides dashboards for monitoring work hours, managing users, generating reports, and tracking activities. The application features a modern React frontend with a dark/light theme system and an Express.js backend with PostgreSQL database storage.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with hot module replacement
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack Query (React Query) for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **Design System**: Fluent Design principles with Inter and JetBrains Mono fonts
- **Theme Support**: System, light, and dark mode with localStorage persistence

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Pattern**: RESTful JSON APIs under `/api/*` prefix
- **Build Strategy**: esbuild for production bundling with allowlisted dependencies

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Connection**: Connection pooling with pg Pool (max 20 connections)
- **Schema Location**: `shared/schema.ts` with Drizzle table definitions
- **Migrations**: Drizzle Kit with push command (`db:push`)
- **Validation**: Zod schemas generated from Drizzle schemas via drizzle-zod

### Key Data Models
- **Users**: id, username, password, name, email, role, department, status, hoursThisWeek, pendingApprovals, vendorId
  - role: 'user' (default), 'vendor_admin', 'super_admin'
  - vendorId: Links user to specific vendor (null for super_admin)
- **TimeEntries**: id, userId, caseNumber, description, hours, date, status, createdAt
- **Activities**: id, userId, action, description, timestamp

### OAuth 2.0 Authentication
- **Provider**: Replit Auth (Google, GitHub, Apple, X, email/password)
- **Routes**: /api/login (start), /api/logout, /api/auth/user (current user)
- **Role-based Access**:
  - super_admin: Can access all vendors (must specify vendorId in query/body)
  - vendor_admin: Locked to assigned vendor
  - user: Default role for end users
- **Auto-assignment**: New users auto-assigned to vendor if email domain matches vendor.settings.allowedEmailDomains

### Project Structure
```
client/           # React frontend application
  src/
    components/   # UI components (portal/, ui/)
    pages/        # Route page components
    hooks/        # Custom React hooks
    lib/          # Utility functions and query client
server/           # Express backend
  index.ts        # Server entry point
  routes.ts       # API route definitions
  storage.ts      # Database operations (IStorage interface)
  db.ts           # Database connection
shared/           # Shared code between client/server
  schema.ts       # Drizzle schema definitions
```

## External Dependencies

### Database
- **PostgreSQL**: Primary data store connected via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management
- **connect-pg-simple**: Session storage in PostgreSQL

### Third-Party Integrations
- **GitHub API**: OAuth integration via `@octokit/rest` for repository access (uses Replit connectors)
- **Recharts**: Data visualization for charts and graphs

### UI Component Libraries
- **Radix UI**: Accessible component primitives (dialog, dropdown, tabs, etc.)
- **shadcn/ui**: Pre-styled component system (configured in `components.json`)
- **Lucide React**: Icon library

### Key NPM Packages
- **bcrypt**: Password hashing
- **date-fns**: Date manipulation with Norwegian locale support
- **zod**: Runtime schema validation
- **class-variance-authority**: Component variant styling

## CMS Portal Editor

### Tab Structure (Redesigned)
The CMS editor uses 6 categorical tabs for better organization:
1. **Layout**: Preview panel with responsive device modes (desktop/tablet/mobile) and region-based properties panel
2. **Colors**: Main colors, background colors, text colors, status colors, border colors
3. **Typography**: Font families, font sizes, heading weights, line heights
4. **Navigation**: Menu structure management with up/down keyboard navigation (WCAG 2.5.7 compliant)
5. **Components**: Spacing, border radius, shadows
6. **Export**: CSS variables output and W3C DTCG format token export

### WCAG Accessibility
- Keyboard navigation via @dnd-kit KeyboardSensor
- Up/down button alternatives for drag-drop reordering
- ARIA labels and roles for screen readers
- Focus management for interactive elements