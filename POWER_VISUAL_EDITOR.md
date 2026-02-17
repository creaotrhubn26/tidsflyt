# Power Visual Editor - World-Class Features 🌟

## Overview
Tidum now has a **world-class visual editor** that combines the best features from Webflow, Figma, Framer, and other industry leaders. This is accessible via the CMS at `/cms` under the "Visual Editor" tab.

---

## ✨ Implemented Features

### 1. **Drag-and-Drop Section Ordering** 🎯
- **Technology**: @dnd-kit/core with sortable functionality
- **Features**:
  - Grab any section by the grip handle (left side)
  - Drag to reorder sections vertically
  - Live reordering with smooth animations
  - Automatic order index management
  - Visual feedback during drag (opacity change)
  - Keyboard navigation support (arrow keys)
- **UX**: Inspired by Webflow's section management

### 2. **Inline Text Editing** ✏️
- **Click-to-Edit**: Click any title to edit inline
- **Auto-focus**: Input field appears instantly
- **Keyboard Shortcuts**:
  - `Enter` to save
  - `Esc` to cancel (blur)
- **Visual Feedback**: Hover background on editable elements
- **UX**: Similar to Notion/Webflow inline editing

### 3. **Visual Spacing Controls** 📏
- **Live Sliders**: Adjust padding/spacing with real-time preview
- **Preset Buttons**: Quick access to common values (0, 16, 32, 64, 80px)
- **Visual Feedback**: See exact pixel values
- **Properties Controlled**:
  - Padding Top (0-200px)
  - Padding Bottom (0-200px)
  - Padding X (horizontal, 0-200px)
  - Gap (between elements, 0-200px)
- **Live Preview**: Changes apply instantly in the canvas
- **UX**: Like Figma's padding controls with visual precision

### 4. **Component Library** 📚
- **Pre-built Templates**:
  - **Modern Hero**: Full-width hero section with gradient support
  - **Features Grid**: Card-based features layout
  - **Testimonial Cards**: Customer testimonials with avatars
  - **Centered CTA**: Call-to-action with gradient backgrounds
- **Drag-from-Library**: Click to add instantly
- **Category Organization**: Grouped by type (hero, features, testimonials, cta)
- **Visual Thumbnails**: Emoji icons for quick identification
- **One-Click Add**: Instant section creation
- **UX**: Similar to Webflow's component library

### 5. **Keyboard Shortcuts** ⌨️
Powerful shortcuts for expert users:

| Shortcut | Action | Description |
|----------|--------|-------------|
| `⌘/Ctrl + S` | Save | Save all changes |
| `⌘/Ctrl + Z` | Undo | Undo last change |
| `⌘/Ctrl + Shift + Z` | Redo | Redo undone change |
| `⌘/Ctrl + D` | Duplicate | Duplicate selected section |
| `Delete/Backspace` | Delete | Delete selected section |

**Features**:
- Cross-platform (Mac ⌘ / Windows Ctrl detection)
- Prevent default browser actions
- Toast notifications for feedback
- Always-visible keyboard shortcut bar at bottom
- **UX**: Inspired by Figma's extensive keyboard workflow

### 6. **Mobile-Optimized Editing** 📱
- **Viewport Switcher**: Desktop / Tablet / Mobile modes
- **Live Responsive Preview**:
  - Desktop: 100% width
  - Tablet: 768px width
  - Mobile: 375px width
- **Touch-Friendly Controls**:
  - Larger hit areas for mobile
  - Optimized button sizes (h-7)
  - Tooltip support for context
- **Visual Indicators**: Active viewport highlighted
- **UX**: Like Webflow's responsive editing mode

### 7. **Real-Time Collaboration Foundation** 🤝
**Infrastructure Ready**:
- History state management (undo/redo stack)
- Section versioning with timestamps
- Unique IDs for conflict resolution
- Mutation-based state updates (ready for WebSocket sync)

**Future Enhancements** (when needed):
- WebSocket connection for live updates
- Multiplayer cursors (like Figma)
- Concurrent editing indicators
- Conflict resolution UI
- User presence indicators

### 8. **Advanced Layout Builder** 🎨 NEW!
- **Layout Types**:
  - **Flexbox**: Full flex controls (direction, justify, align, wrap)
  - **Grid**: Visual grid builder (columns, rows, gap)
  - **Stack**: Simple vertical stacking
- **Visual Controls**:
  - Direction buttons (row, column, reverse modes)
  - Justify content (start, center, end, between, around, evenly)
  - Align items (start, center, end, stretch, baseline)
  - Grid columns slider (1-12 columns)
  - Grid rows control (auto or fixed)
  - Gap slider with presets (0, 8, 16, 24, 32, 48px)
- **Live CSS Preview**: See generated CSS in real-time
- **Smart Defaults**: Intelligent layout presets per component
- **UX**: Figma-inspired layout controls with visual precision

### 9. **Animation Timeline** ✨ NEW!
- **Animation Types**:
  - Fade In (opacity transitions)
  - Slide Up (translateY animations)
  - Scale (zoom effects)
  - Rotate (rotation animations)
- **Trigger Options**:
  - On Load (page load)
  - On Scroll (scroll into view with offset control 0-100%)
  - On Hover (mouse hover)
  - On Click (click interaction)
- **Timing Controls**:
  - Duration slider (100-2000ms) with presets
  - Delay slider (0-2000ms) with presets
  - Easing: ease-in-out by default
- **Preview Button**: Test animations instantly
- **Generated CSS**: Live CSS code preview
- **Scroll Offset**: Fine-tune scroll trigger position
- **UX**: Webflow-style animation timeline

### 10. **Code Export** 💻 NEW!
- **Export Formats**:
  - **React Component**: Clean JSX with inline styles
  - **HTML/CSS**: Standalone HTML with embedded CSS
  - **Tailwind CSS**: React with Tailwind utility classes
  - **JSON Config**: Portable JSON configuration
- **Features**:
  - Copy to clipboard (one-click)
  - Download files (.tsx, .html, .json)
  - Preserves all layouts, animations, and styles
  - Production-ready code
  - Proper indentation and formatting
- **Layout Export**: All flexbox/grid properties preserved
- **Animation Export**: CSS transitions and transforms included
- **Smart Mapping**: Tailwind class conversion for responsive design
- **UX**: Framer-style code export with multiple formats

---

## 🎨 Additional Features

### History Management
- **Undo/Redo Stack**: Full history with state snapshots
- **Unlimited History**: No arbitrary limits
- **Visual Feedback**: Button states show availability
- **Keyboard + Button**: Both methods work seamlessly

### Visual Feedback
- **Selection States**: 
  - Blue ring on selected section
  - Hover ring on non-selected sections
- **Drag States**: Opacity change during drag
- **Toast Notifications**: Confirmation for all actions
- **Live Canvas**: Instant preview of changes

### Smart UI Layout
- **Four-Panel Design**:
  - **Left Sidebar**: Layers & Component Library (switchable tabs)
  - **Main Canvas**: Live preview with viewport controls
  - **Right Sidebar**: Properties panel (Content/Design/Spacing/Layout/Animations tabs)
  - **Code Export Panel**: Appears when Export button clicked
- **Contextual Properties**: Only shows when section selected
- **Responsive**: Adapts to screen size

### Design System Integration
- **Background Controls**:
  - Solid colors (color picker)
  - Gradients support
  - Background images (ready)
- **Typography**: Inherits from Tidum design tokens
- **Colors**: Primary (#0ea5e9), Accent (#8b5cf6)
- **Spacing**: 4px grid system (0, 4, 8, 16, 32, 64, 80, etc.)
- **Layout System**: Flexbox/Grid with visual controls
- **Animation System**: Timeline-based with scroll triggers

---

## 🚀 How to Use

### Accessing the Editor
1. Go to `/cms`
2. Log in as admin
3. Click the **"Visual Editor"** tab (with ✨ sparkle icon)

### Basic Workflow
1. **Add Section**:
   - Switch to "Bibliotek" (Library) tab in left sidebar
   - Click a component template
   - Section appears in canvas

2. **Edit Content**:
   - Click section title to edit inline
   - Or select section → use right sidebar properties

3. **Adjust Layout** (NEW):
   - Select section
   - Go to "Layout" tab in right sidebar
   - Choose Flexbox, Grid, or Stack
   - Use visual controls for direction, justify, align
   - Set grid columns/rows if using Grid layout
   - Adjust gap with slider or presets

4. **Add Animations** (NEW):
   - Select section
   - Go to "Animations" tab in right sidebar
   - Toggle "Enable Animations"
   - Choose animation type (fade, slide, scale, rotate)
   - Select trigger (load, scroll, hover, click)
   - Adjust duration and delay
   - Preview animation with button

5. **Adjust Spacing**:
   - Select section
   - Go to "Spacing" tab in right sidebar
   - Use sliders or preset buttons

6. **Reorder Sections**:
   - Grab the grip handle (≡) on left of section
   - Drag up/down to reorder

7. **Duplicate/Delete**:
   - Hover over section
   - Click copy icon (⌘D) or trash icon (⌫)

8. **Export Code** (NEW):
   - Click "Export" button in top toolbar
   - Choose format: React, HTML/CSS, Tailwind, or JSON
   - Copy to clipboard or download file

9. **Save**:
   - Click "Lagre" button (top-right)
   - Or press `⌘/Ctrl + S`

### Power User Tips
- Use keyboard shortcuts for speed
- Switch viewports to check responsive design
- Use undo/redo liberally (unlimited history)
- Inline edit for quick text changes
- Properties panel for detailed customization
- **Layout tab**: Build complex flexbox/grid layouts visually
- **Animations tab**: Add scroll-triggered micro-interactions
- **Export button**: Generate production-ready code instantly
- Combine animations with scroll triggers for wow factor
- Use grid layout for card-based sections (features, testimonials)
- Use flexbox for hero sections and CTAs

---

## 🛠️ Technical Architecture

### Dependencies
```json
{
  "@dnd-kit/core": "^6.3.1",
  "@dnd-kit/sortable": "^10.0.0",
  "@dnd-kit/utilities": "^3.2.2",
  "@tanstack/react-query": "latest",
  "lucide-react": "latest"
}
```

### Component Structure
```typescript
PowerVisualEditor
├── Top Toolbar (viewport controls, undo/redo, save, export)
├── Left Sidebar
│   ├── Layers Tab (sections list with drag-drop)
│   └── Library Tab (component templates)
├── Main Canvas
│   └── Responsive Container (desktop/tablet/mobile)
│       └── Sortable Sections (live preview)
├── Right Sidebar (shows when section selected)
│   ├── Content Tab (title, text, etc.)
│   ├── Design Tab (colors, backgrounds)
│   ├── Spacing Tab (padding controls)
│   ├── Layout Tab (flexbox/grid builder) NEW
│   └── Animations Tab (timeline controls) NEW
└── Code Export Panel (appears when Export clicked) NEW
    ├── React Component export
    ├── HTML/CSS export
    ├── Tailwind CSS export
    └── JSON Config export
```

### New Components
- **LayoutControls** (`/client/src/components/cms/layout-controls.tsx`):
  - Visual flexbox/grid builder
  - Direction, justify, align controls
  - Grid columns/rows sliders
  - Gap control with presets
  - Live CSS code preview
  
- **AnimationControls** (`/client/src/components/cms/animation-controls.tsx`):
  - Animation type selector (fade, slide, scale, rotate)
  - Trigger options (load, scroll, hover, click)
  - Duration and delay sliders
  - Scroll offset control
  - Preview button
  - Live CSS code preview

- **CodeExport** (`/client/src/components/cms/code-export.tsx`):
  - Multi-format export (React, HTML, Tailwind, JSON)
  - Copy to clipboard functionality
  - Download file functionality
  - Preserves layouts and animations
  - Production-ready code generation

### State Management
- **React Query**: For API data fetching
- **Local State**: Section array with history
- **History Stack**: Array of state snapshots
- **Optimistic Updates**: Instant UI feedback

### API Endpoints (Ready)
- `GET /api/cms/sections` - Fetch sections
- `POST /api/cms/sections` - Create section
- `PUT /api/cms/sections/:id` - Update section
- `DELETE /api/cms/sections/:id` - Delete section

---

## 📊 Comparison to Industry Leaders

| Feature | Webflow | Figma | Framer | **Tidum** | Notes |
|---------|---------|-------|--------|-----------|-------|
| Drag-Drop Sections | ✅ | ✅ | ✅ | ✅ | Implemented |
| Inline Editing | ✅ | ✅ | ✅ | ✅ | Click-to-edit |
| Visual Spacing | ✅ | ✅ | ✅ | ✅ | Sliders + presets |
| Component Library | ✅ | ✅ | ✅ | ✅ | 4 templates (expandable) |
| Keyboard Shortcuts | ✅ | ✅ | ✅ | ✅ | 5 core shortcuts |
| Responsive Preview | ✅ | ✅ | ✅ | ✅ | 3 viewports |
| Undo/Redo | ✅ | ✅ | ✅ | ✅ | Unlimited history |
| **Layout Builder** | ✅ | ✅ | ✅ | ✅ | **NEW - Flexbox/Grid** |
| **Animation Timeline** | ✅ | ⚠️ | ✅ | ✅ | **NEW - Scroll triggers** |
| **Code Export** | ⚠️ | ⚠️ | ✅ | ✅ | **NEW - 4 formats** |
| Real-time Collab | ✅ | ✅ | ⚠️ | 🚧 | Foundation ready |
| Mobile Editing | ⚠️ | ⚠️ | ⚠️ | ✅ | Optimized |
| Design Tokens | ⚠️ | ✅ | ⚠️ | ✅ | Integrated |

**Legend**: ✅ Full Support | ⚠️ Partial | 🚧 Infrastructure Ready

---

## 🎯 Future Enhancements

### Phase 2 (When Needed)
1. **Advanced Components**:
   - Image galleries
   - Video embeds
   - Form builders
   - Advanced layouts (flexbox/grid editors)

2. **Real-Time Collaboration**:
   - WebSocket server setup
   - User presence indicators
   - Live cursors (multiplayer)
   - Conflict resolution UI

3. **Advanced Styling**:
   - CSS animations timeline
   - Gradient editor
   - Shadow builder
   - Border radius controls

4. **Performance**:
   - Virtual scrolling for large page lists
   - Lazy loading for components
   - Asset optimization tools

5. **Accessibility**:
   - Built-in a11y checker
   - ARIA attribute suggestions
   - Contrast validator

---

## 📝 Code Location

- **Main Component**: `/client/src/components/cms/power-visual-editor.tsx`
- **Layout Builder**: `/client/src/components/cms/layout-controls.tsx` (NEW)
- **Animation Controls**: `/client/src/components/cms/animation-controls.tsx` (NEW)
- **Code Export**: `/client/src/components/cms/code-export.tsx` (NEW)
- **Integration**: `/client/src/pages/cms.tsx` (Visual Editor tab)
- **Design Tokens**: `/client/src/components/cms/design-token-editor.tsx`
- **Database**: `cms_tidum_tokens` table for design system

---

## 🎉 Summary

The Power Visual Editor gives Tidum **world-class content management** capabilities:

✅ **Drag-and-drop** section ordering  
✅ **Inline editing** for quick changes  
✅ **Visual spacing controls** with live preview  
✅ **Component library** with pre-built sections  
✅ **Keyboard shortcuts** for power users  
✅ **Mobile-optimized** editing experience  
✅ **Collaboration-ready** infrastructure  
✅ **Advanced layout builder** with Flexbox/Grid controls (NEW)  
✅ **Animation timeline** with scroll triggers (NEW)  
✅ **Code export** in 4 formats (React, HTML, Tailwind, JSON) (NEW)  

This puts Tidum on par with industry leaders like Webflow, Figma, and Framer for page building capabilities! 🚀
