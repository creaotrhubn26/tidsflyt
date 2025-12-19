# Smart Timing - Design Guidelines

## Design Approach

**System-Based Design**: Fluent Design principles adapted for enterprise productivity, emphasizing data clarity, consistent patterns, and professional polish. Reference points: Linear (clean data presentation), Asana (task organization), Monday.com (dashboard layouts).

**Core Principle**: Trust through clarity - every element should reduce cognitive load while presenting complex workforce data elegantly.

---

## Typography System

**Font Families** (Google Fonts):
- Primary: Inter (UI, body text, data)
- Mono: JetBrains Mono (time entries, numerical data)

**Type Scale**:
- Hero/Dashboard Headers: text-4xl, font-bold (36px)
- Section Headers: text-2xl, font-semibold (24px)
- Card Titles: text-lg, font-medium (18px)
- Body/Data: text-base, font-normal (16px)
- Captions/Labels: text-sm, font-medium (14px)
- Metadata: text-xs (12px)

---

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, 8, 12, 16
- Component padding: p-4 to p-6
- Section gaps: gap-6 to gap-8
- Card spacing: p-6
- Dense data tables: p-2 to p-4

**Grid Structure**:
- Dashboard: 3-column stat cards (grid-cols-1 md:grid-cols-3)
- Reports: 2-column split (sidebar + main content)
- Time entries: Single column table with responsive collapse
- Max container width: max-w-7xl

**Responsive Breakpoints**:
- Mobile: Single column, bottom navigation
- Tablet (md:): 2-column layouts
- Desktop (lg:): Full 3-column dashboards

---

## Component Library

### Navigation
**Desktop**: Fixed sidebar (w-64) with logo, primary nav items, user profile at bottom
**Mobile**: Bottom navigation bar (fixed bottom, z-50) with 4-5 key actions, icons only

### Dashboard Components

**Stat Cards**: 
- Grid layout with icon, label, large number, trend indicator (↑/↓ with percentage)
- Subtle elevation with rounded-lg borders
- Compact padding (p-6) with clear hierarchy

**Charts Section**:
- Use Chart.js or Recharts library
- Weekly/monthly time distribution bar charts
- Project allocation pie/donut charts
- Trend lines for overtime tracking
- Contained in bordered cards with headers

**Activity Feed**:
- Chronological list with avatar, action, timestamp
- Compact spacing (gap-3), grouped by date
- "Load more" pagination

### Time Tracking Interface

**Timer Component**:
- Large, centered timer display (text-5xl, JetBrains Mono)
- Play/Pause circular button beneath
- Active project/task label above
- Quick task switcher dropdown

**Time Entries Table**:
- Striped rows for readability
- Columns: Date, Project, Task, Duration, Notes, Actions
- Inline editing capability
- Sortable headers
- Mobile: Card-based layout with stacked information

### Reporting Interface

**Report Builder**:
- Left sidebar: Filter controls (date range, employees, projects)
- Main area: Report preview with export options
- Top bar: Report type selector, saved reports dropdown

**Data Tables**:
- Clean alternating row pattern
- Sticky headers on scroll
- Expandable rows for details
- Summary row at bottom (total hours, costs)
- Export buttons (PDF, Excel, CSV) in top-right

### Forms

**Input Fields**:
- Consistent height (h-10 for text inputs)
- Clear labels (text-sm, font-medium) above inputs
- Helper text below when needed
- Icon prefixes for specialized inputs (calendar, clock)

**Date/Time Pickers**:
- Custom calendar dropdown component
- Time input with increment buttons
- Quick presets (Today, This Week, Last Month)

---

## Interactive Elements

**Buttons**:
- Primary action: Large, prominent (px-6 py-3)
- Secondary: Outlined variant
- Icon buttons: Square (w-10 h-10), centered icon
- Button groups for related actions

**Modals/Dialogs**:
- Centered overlay with backdrop blur
- Max width constraints (max-w-2xl)
- Clear header with close button
- Action buttons aligned right

**Dropdowns/Selects**:
- Custom styled to match theme
- Search functionality for long lists
- Multi-select with chips for tags

---

## Data Visualization Guidelines

**Chart Containers**: 
- White/card background with subtle border
- Padding (p-6) around chart area
- Title and time period selector in header
- Legend below or to side, never overlapping data

**Visual Hierarchy**:
- Primary data: Boldest visual weight
- Comparative data: Lighter opacity
- Grid lines: Minimal, low contrast

---

## Icons

**Icon Library**: Heroicons (Outline for navigation, Solid for actions)

**Key Icons**:
- Clock/Timer, Calendar, Users, ChartBar, DocumentText, Cog, Play/Pause
- Consistent sizing: w-5 h-5 for inline, w-6 h-6 for standalone

---

## Mobile Optimization

**Bottom Navigation**:
- 4 primary items: Dashboard, Time Tracker, Reports, Profile
- Icon + label on tablets, icon-only on small mobile
- Active state with position indicator

**Touch Targets**: Minimum 44x44px for all interactive elements

**Collapsible Sections**: Use accordions for dense information on mobile

---

## Images

**No traditional hero image** - Dashboard-first approach for productivity app.

**Supporting Imagery**:
- Empty states: Simple illustrations for "No time entries yet"
- User avatars: Circular, consistent sizing (w-8 h-8 to w-12 h-12)
- Company logo in sidebar navigation
- Optional: Subtle abstract patterns in report headers (low opacity overlays)

---

## Accessibility

- Keyboard navigation for all interactive elements
- ARIA labels for icon-only buttons
- Sufficient contrast ratios (WCAG AA minimum)
- Focus indicators on all inputs and buttons
- Screen reader announcements for dynamic updates (timer changes, data loads)

---

## Animation Budget

**Use Sparingly**:
- Subtle fade-in for dashboard cards on load
- Smooth transitions for navigation (duration-200)
- Skeleton loaders for data fetching states
- NO decorative animations - focus on functional micro-interactions