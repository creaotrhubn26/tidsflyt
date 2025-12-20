# Smart Timing Workflow

## Setup Gate → Main App Workflow

### First-Time User Flow

1. **Landing** → User arrives at `/` (main app)
2. **Setup Gate Check** → App checks database for `project_info`
   - If **no project info** found → Redirect to `/setup`
   - If **project info exists** → Show main app
3. **Setup Page** (`/setup`)
   - User fills in required fields:
     - ✅ **Konsulent** (required)
     - ✅ **Bedrift** (required, autocomplete with BRREG + Kinoa Tiltak AS)
     - ✅ **Oppdragsgiver** (required)
     - ⚪ Tiltak (optional)
     - ⚪ Periode (optional)
     - ⚪ Klient ID / Saks nr (optional)
   - Click "Opprett prosjekt"
4. **Redirect** → Automatically redirected to `/` (main app)
5. **Main App** → Project info banner displayed at top

### Returning User Flow

1. **Landing** → User arrives at `/`
2. **Setup Gate Check** → Project info exists in database
3. **Main App** → Immediately shows app with project banner
4. **Edit Project** → Click "Prosjekt" button in header → `/setup` (edit mode)

## Project Info Banner

After completing setup, users see a prominent banner at the top of the main app showing:

- **Konsulent** - Who is logging time
- **Bedrift** - Which company they work for (e.g., Kinoa Tiltak AS)
- **Oppdragsgiver** - Client/customer name
- **Tiltak** - Project/initiative (if specified)
- **Periode** - Time period (if specified)

### Design:
- Light blue background with primary color left border
- Responsive grid layout (stacks on mobile)
- Always visible while using the app
- Provides context for all time logging

## Navigation Between Setup and Main App

### From Main App → Setup:
- Click **"Prosjekt"** button in top-right header
- Opens `/setup` in edit mode
- Form pre-filled with existing data
- Button text changes to "Oppdater"

### From Setup → Main App:
- Click "Opprett prosjekt" (first time) or "Oppdater" (edit mode)
- Saves to database
- Automatic redirect to `/`
- Project banner updates immediately

## Database Integration

All project info is stored in the `project_info` table:
- ✅ Persists across devices
- ✅ Syncs automatically
- ✅ No localStorage dependency
- ✅ BRREG validation for company data
- ✅ Supports multiple users (via `user_id`)

## Setup Gate Benefits

1. **First-time setup is mandatory** - Ensures all users configure project info
2. **No friction for returning users** - Setup only shown once
3. **Easy editing** - One-click access to edit project details
4. **Visual confirmation** - Banner shows current project context
5. **Data integrity** - Required fields enforced at setup

## Workflow Gap Analysis - RESOLVED ✅

### Previous Issues (Fixed):
- ❌ No visual display of project info after setup
- ❌ Users couldn't see which project they're logging time for
- ❌ No confirmation that setup was successful

### Current State:
- ✅ Project info banner always visible
- ✅ Clear context while logging time
- ✅ Easy access to edit project details
- ✅ Smooth workflow from setup to main app
- ✅ Database-backed persistence
- ✅ BRREG integration with verified company data

## Accessibility

- Setup gate respects loading states (CircularProgress)
- No flash of main app before redirect
- Screen reader announces navigation
- All buttons have proper aria-labels
- Keyboard navigation supported throughout
