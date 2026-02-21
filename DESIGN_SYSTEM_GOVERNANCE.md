# Design System Governance

This repository enforces design consistency with documented rules and automated checks.

## Scope

Phase 1 enforcement currently targets:

- all files in `client/src/components/dashboard/*.tsx`

This scope can be expanded to additional files as components are tokenized.

## Rules

1. Use theme tokens, not hard-coded hex colors.
   - Preferred: `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-primary`, `border-border`
   - Avoid: `#xxxxxx` inline values in class names or style declarations
2. Ensure icon-only controls have accessible labels.
   - Add `aria-label` and `title` where no visible text exists.
3. Respect reduced-motion user preferences.
   - Avoid mandatory animation; disable or reduce transitions when `prefers-reduced-motion: reduce` is set.

## Automated Check

Run:

```bash
npm run check:design
```

This command fails if hard-coded hex colors are found in enforced files.

## Review Checklist

Before merging UI changes:

- [ ] No hard-coded hex colors in enforced files
- [ ] Icon-only interactive controls have accessible names
- [ ] Motion respects reduced-motion settings
- [ ] Dashboard remains readable in compact mode
