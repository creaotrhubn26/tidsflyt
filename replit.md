# Smart Timing

## Overview

Smart Timing is a professional time tracking and workforce management application designed for Norwegian businesses. It provides dashboards for monitoring work hours, managing users, generating reports, and tracking activities. The application features a modern React frontend with a dark/light theme system and an Express.js backend with PostgreSQL database storage.

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
- **Users**: id, username, password, name, email, role, department, status, hoursThisWeek, pendingApprovals
- **TimeEntries**: id, userId, caseNumber, description, hours, date, status, createdAt
- **Activities**: id, userId, action, description, timestamp

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