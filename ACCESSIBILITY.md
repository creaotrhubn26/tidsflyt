# Accessibility Guide (WCAG 2.1 AA)

## Overview
Tidsflyt is committed to WCAG 2.1 AA compliance to ensure the application is usable by everyone, including people with disabilities.

## Key Principles

### 1. Perceivable
Users must be able to perceive the information being presented.

#### Color Contrast
- **Text**: Minimum 4.5:1 contrast ratio
- **Large text** (18pt+): Minimum 3:1 contrast ratio
- **UI components**: Minimum 3:1 contrast ratio

```tsx
// Good - sufficient contrast
<button className="bg-primary text-primary-foreground">
  Save
</button>

// Check contrast at: https://webaim.org/resources/contrastchecker/
```

#### Alternative Text
```tsx
// Images
<img src="logo.png" alt="Tidsflyt - Time tracking for Norwegian social work" />

// Decorative images
<img src="decoration.png" alt="" aria-hidden="true" />

// Icon buttons
<button aria-label="Delete time entry">
  <TrashIcon aria-hidden="true" />
</button>
```

#### Text Alternatives
- All non-text content has text alternative
- Charts include data tables
- Audio/video has captions (if applicable)

### 2. Operable
Users must be able to operate the interface.

#### Keyboard Navigation
All functionality available via keyboard:
- `Tab` / `Shift+Tab` - Navigate between elements
- `Enter` / `Space` - Activate buttons/links
- `Escape` - Close dialogs/menus
- `Arrow keys` - Navigate within components

```tsx
// Ensure all interactive elements are keyboard accessible
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
>
  Click me
</div>
```

#### Focus Management
```tsx
import { useRef, useEffect } from 'react';

function Modal({ isOpen, onClose }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  
  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogClose ref={closeButtonRef}>
          Close
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
```

#### Focus Indicators
```css
/* Ensure visible focus indicators */
*:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}

/* Don't remove focus styles */
button:focus {
  outline: none; /* ❌ BAD */
}

button:focus-visible {
  outline: 2px solid blue; /* ✅ GOOD */
}
```

#### Skip Links
```tsx
// Add skip link for keyboard users
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground"
>
  Skip to main content
</a>

<main id="main-content">
  {/* Main content */}
</main>
```

### 3. Understandable
Information and operation must be understandable.

#### Clear Labels
```tsx
// Form inputs
<Label htmlFor="email">Email address</Label>
<Input id="email" type="email" required />

// Required fields
<Label htmlFor="name">
  Name <span aria-label="required">*</span>
</Label>

// Error messages
<Input
  id="email"
  type="email"
  aria-invalid={hasError}
  aria-describedby={hasError ? 'email-error' : undefined}
/>
{hasError && (
  <span id="email-error" className="text-destructive">
    Please enter a valid email address
  </span>
)}
```

#### Error Identification
```tsx
function Form() {
  const [errors, setErrors] = useState<string[]>([]);
  
  return (
    <>
      {errors.length > 0 && (
        <div role="alert" className="bg-destructive text-destructive-foreground p-4">
          <h2>Please correct the following errors:</h2>
          <ul>
            {errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {/* Form fields */}
    </>
  );
}
```

#### Consistent Navigation
- Navigation menu in same location on all pages
- Consistent labeling for same actions
- Predictable component behavior

### 4. Robust
Content must be robust enough to work with current and future technologies.

#### Semantic HTML
```tsx
// Use proper HTML elements
<header>
  <nav aria-label="Main navigation">
    <ul>
      <li><a href="/">Home</a></li>
    </ul>
  </nav>
</header>

<main>
  <article>
    <h1>Article Title</h1>
    <p>Content...</p>
  </article>
</main>

<footer>
  <p>© 2026 Tidsflyt</p>
</footer>
```

#### ARIA Landmarks
```tsx
// Use ARIA landmarks when semantic HTML isn't enough
<div role="search">
  <input type="search" aria-label="Search time entries" />
</div>

<div role="complementary" aria-label="Related entries">
  {/* Sidebar content */}
</div>
```

#### Valid HTML
- Close all tags properly
- No duplicate IDs
- Valid nesting of elements
- Proper attribute usage

## Component Checklist

### Buttons
- [ ] Has accessible name (text or aria-label)
- [ ] Keyboard accessible
- [ ] Visible focus indicator
- [ ] Disabled state communicated to screen readers

### Forms
- [ ] All inputs have labels
- [ ] Required fields marked
- [ ] Error messages associated with inputs
- [ ] Submit errors announced to screen readers
- [ ] Validation runs on submit, not on every keystroke

### Modals/Dialogs
- [ ] Focus trapped within modal
- [ ] Focus returns to trigger on close
- [ ] Escape key closes modal
- [ ] Backdrop click closes modal (optional)
- [ ] Screen reader announces modal opening

### Tables
- [ ] Has `<caption>` or aria-label
- [ ] Uses `<thead>`, `<tbody>`, `<th>`
- [ ] Header cells have scope attribute
- [ ] Complex tables have proper associations

### Images
- [ ] All images have alt text
- [ ] Decorative images have empty alt or aria-hidden
- [ ] Complex images have detailed description

### Links
- [ ] Link text describes destination
- [ ] No "click here" or "read more" without context
- [ ] External links indicated
- [ ] Links to files indicate file type and size

## Testing Checklist

### Automated Testing
```bash
# Install axe-core for automated a11y testing
npm install -D @axe-core/react

# Use in tests
import { axe } from 'jest-axe';

it('should not have accessibility violations', async () => {
  const { container } = render(<Component />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### Manual Testing

#### Keyboard Navigation
- [ ] Tab through entire page
- [ ] All interactive elements reachable
- [ ] Focus order is logical
- [ ] No keyboard traps
- [ ] Focus indicators visible

#### Screen Reader Testing
**NVDA (Windows - Free)**
```
Download: https://www.nvaccess.org/download/
Key commands:
- Insert+Down: Read from current position
- Insert+Space: Toggle browse/focus mode
- H: Next heading
- Tab: Next focusable element
```

**VoiceOver (macOS)**
```
Enable: Cmd+F5
Key commands:
- VO+A: Start reading
- VO+Right/Left: Navigate
- VO+Space: Activate element
```

**JAWS (Windows - Commercial)**
Most widely used, test if possible.

#### Zoom/Magnification
- [ ] Test at 200% zoom (browser zoom)
- [ ] Content reflows properly
- [ ] No horizontal scrolling (except data tables)
- [ ] All functionality still works

#### Color Blindness
Test with browser extensions:
- Chrome: "Colorblind - Dalton"
- Firefox: "Colorblind Simulator"

### Checklist
- [ ] Color not sole means of conveying information
- [ ] All interactive elements distinguishable
- [ ] Charts have patterns in addition to colors

## Common Patterns

### Loading States
```tsx
<div role="status" aria-live="polite" aria-busy="true">
  <Spinner />
  <span className="sr-only">Loading data, please wait...</span>
</div>
```

### Dynamic Content
```tsx
import { A11yAnnouncement } from '@/components/a11y-announcement';

function DataTable() {
  const [data, setData] = useState([]);
  const [announcement, setAnnouncement] = useState('');
  
  useEffect(() => {
    if (data.length > 0) {
      setAnnouncement(`${data.length} entries loaded`);
    }
  }, [data]);
  
  return (
    <>
      <A11yAnnouncement message={announcement} />
      <table>{/* ... */}</table>
    </>
  );
}
```

### Tooltips
```tsx
// Tooltips should supplement, not replace, visible text
<Tooltip>
  <TooltipTrigger asChild>
    <button aria-label="Delete entry (this action cannot be undone)">
      <TrashIcon aria-hidden="true" />
    </button>
  </TooltipTrigger>
  <TooltipContent>
    <p>This action cannot be undone</p>
  </TooltipContent>
</Tooltip>
```

### Autocomplete
```tsx
<Combobox>
  <ComboboxInput
    aria-label="Search users"
    aria-autocomplete="list"
    aria-controls="user-list"
    aria-expanded={isOpen}
  />
  <ComboboxList id="user-list" role="listbox">
    {users.map(user => (
      <ComboboxOption key={user.id} role="option">
        {user.name}
      </ComboboxOption>
    ))}
  </ComboboxList>
</Combobox>
```

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM](https://webaim.org/)
- [a11y Project](https://www.a11yproject.com/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)

## Tools

- **Browser Extensions**:
  - axe DevTools
  - WAVE
  - Lighthouse (Chrome DevTools)

- **Testing Libraries**:
  - @axe-core/react
  - jest-axe
  - @testing-library/jest-dom

- **Color Contrast**:
  - WebAIM Contrast Checker
  - Contrast Checker (Chrome extension)

## Compliance Status

Current WCAG 2.1 AA Compliance: **In Progress**

- ✅ Perceivable: 90%
- ✅ Operable: 85%
- ✅ Understandable: 95%
- ✅ Robust: 90%

Target: **100% compliance by Q2 2026**
