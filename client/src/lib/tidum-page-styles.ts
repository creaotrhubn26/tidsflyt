/**
 * Shared Tidum Page Design System
 *
 * Centralised CSS custom-property styles used by every public-facing
 * ("marketing") page.  Import `tidumPageStyles` and inject it via a
 * `<style>` tag inside the `<main className="tidum-page">` wrapper.
 *
 * The design tokens, utility classes (.tidum-panel, .tidum-btn-primary …)
 * and fade-up animation are defined once here so every page stays
 * consistent and future edits only need to be made in one place.
 */

// ── Design tokens (JS-accessible) ──────────────────────────────────────
export const TIDUM_TOKENS = {
  colorPrimary: '#1F6B73',
  colorPrimaryHover: '#18585F',
  colorSecondary: '#4E9A6F',
  colorBgMain: '#FAFAF8',
  colorBgSection: '#F1F1ED',
  colorTextMain: '#1E2A2C',
  colorTextMuted: '#5F6B6D',
  colorBorder: '#E1E4E3',
  colorHeading: '#0E4852',
  fontFamily: 'Inter, "Avenir Next", "Segoe UI", sans-serif',
} as const;

// ── Full CSS block injected on every Tidum page ────────────────────────
export const tidumPageStyles = `
  .tidum-page {
    --color-primary: ${TIDUM_TOKENS.colorPrimary};
    --color-primary-hover: ${TIDUM_TOKENS.colorPrimaryHover};
    --color-secondary: ${TIDUM_TOKENS.colorSecondary};
    --color-bg-main: ${TIDUM_TOKENS.colorBgMain};
    --color-bg-section: ${TIDUM_TOKENS.colorBgSection};
    --color-text-main: ${TIDUM_TOKENS.colorTextMain};
    --color-text-muted: ${TIDUM_TOKENS.colorTextMuted};
    --color-border: ${TIDUM_TOKENS.colorBorder};
    /* Force a light, high-contrast surface inside landing (independent of app dark mode). */
    --background: 60 20% 98%;
    --foreground: 194 19% 14%;
    --card: 0 0% 100%;
    --card-foreground: 194 19% 14%;
    --card-border: 164 10% 88%;
    --popover: 0 0% 100%;
    --popover-foreground: 194 19% 14%;
    --popover-border: 164 10% 88%;
    --muted: 165 10% 94%;
    --muted-foreground: 188 9% 44%;
    background:
      radial-gradient(circle at 8% 3%, rgba(78, 154, 111, 0.10), transparent 38%),
      radial-gradient(circle at 88% 6%, rgba(31, 107, 115, 0.12), transparent 42%),
      var(--color-bg-main);
    color: var(--color-text-main);
    font-family: ${TIDUM_TOKENS.fontFamily};
    min-height: 100vh;
  }

  /* ── Dark mode overrides ── */
  .dark .tidum-page {
    --color-bg-main: #0c1214;
    --color-bg-section: #111a1d;
    --color-text-main: #d8e4e6;
    --color-primary: #3dd4de;
    --color-primary-hover: #5ae0e8;
    --color-secondary: #6fcf97;
    --color-text-muted: #8fa3a8;
    --color-border: #1e3038;
    --background: 195 20% 7%;
    --foreground: 192 22% 88%;
    --card: 195 18% 10%;
    --card-foreground: 192 22% 88%;
    --card-border: 195 20% 16%;
    --popover: 195 18% 10%;
    --popover-foreground: 192 22% 88%;
    --popover-border: 195 20% 16%;
    --muted: 195 15% 14%;
    --muted-foreground: 192 12% 58%;
    background:
      radial-gradient(circle at 8% 3%, rgba(78, 154, 111, 0.06), transparent 38%),
      radial-gradient(circle at 88% 6%, rgba(31, 107, 115, 0.08), transparent 42%),
      var(--color-bg-main);
    color: var(--color-text-main);
  }

  .dark .tidum-panel {
    border-color: var(--color-border);
    background: linear-gradient(180deg, rgba(17, 26, 29, 0.97), rgba(12, 18, 20, 0.95));
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.3);
  }

  .dark .tidum-title {
    color: #c8e8ec;
  }

  .dark .tidum-text {
    color: var(--color-text-main);
  }

  .dark .tidum-btn-primary {
    background: #1d8f98;
    border-color: rgba(29, 143, 152, 0.5);
  }

  .dark .tidum-btn-primary:hover {
    background: #239aa4;
  }

  .dark .tidum-btn-secondary {
    background: rgba(255, 255, 255, 0.06);
    color: #c8d8dc;
    border-color: var(--color-border);
  }

  .dark .tidum-btn-secondary:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .dark .tidum-input {
    border-color: var(--color-border);
    background: rgba(255, 255, 255, 0.04);
    color: var(--color-text-main);
  }

  .dark .tidum-input::placeholder {
    color: #6b8085;
  }

  .tidum-panel {
    border: 1px solid var(--color-border);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(250, 251, 248, 0.95));
    box-shadow: 0 18px 60px rgba(24, 37, 41, 0.09);
  }

  .tidum-title {
    font-size: clamp(calc(var(--rt-h1) * 1.15), 5.4vw, calc(var(--rt-h1) * 1.65));
    line-height: 0.97;
    letter-spacing: -0.03em;
    font-weight: 600;
    color: ${TIDUM_TOKENS.colorHeading};
  }

  .tidum-text {
    font-size: clamp(var(--rt-body), 1.45vw, calc(var(--rt-body) * 1.38));
    line-height: 1.48;
    color: var(--color-text-main);
  }

  .tidum-btn-primary {
    background: var(--color-primary);
    color: #fff;
    border: 1px solid rgba(20, 77, 84, 0.6);
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
  }

  .tidum-btn-primary:hover {
    background: var(--color-primary-hover);
  }

  .tidum-btn-secondary {
    background: #fff;
    color: #223136;
    border: 1px solid var(--color-border);
    border-radius: 12px;
  }

  .tidum-btn-secondary:hover {
    background: #f6f7f4;
  }

  .tidum-input {
    border-color: var(--color-border);
    background: rgba(255, 255, 255, 0.92);
    color: var(--color-text-main);
  }

  .tidum-input::placeholder {
    color: #6f7a7d;
  }

  .tidum-fade-up {
    animation: tidum-fade-up 0.6s ease both;
  }

  .tidum-page :is(button, a, input, textarea):focus-visible {
    outline: 3px solid ${TIDUM_TOKENS.colorPrimary};
    outline-offset: 2px;
  }

  @keyframes tidum-fade-up {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Scroll-triggered animation states */
  .tidum-section[data-anim-type] {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.5s ease, transform 0.5s ease;
  }
  .tidum-section[data-anim-type].tidum-visible {
    opacity: 1;
    transform: translateY(0);
  }
  .tidum-section[data-anim-type="slide-left"] {
    transform: translateX(-30px);
  }
  .tidum-section[data-anim-type="slide-left"].tidum-visible {
    transform: translateX(0);
  }
  .tidum-section[data-anim-type="slide-right"] {
    transform: translateX(30px);
  }
  .tidum-section[data-anim-type="slide-right"].tidum-visible {
    transform: translateX(0);
  }
  .tidum-section[data-anim-type="scale"] {
    transform: scale(0.95);
  }
  .tidum-section[data-anim-type="scale"].tidum-visible {
    transform: scale(1);
  }

  /* ── Responsive: collapse grids on tablet/mobile ── */
  @media (max-width: 900px) {
    .tidum-section div[style*="grid-template-columns: 1fr 1fr"],
    .tidum-section div[style*="grid-template-columns:1fr 1fr"] {
      grid-template-columns: 1fr !important;
    }
    .tidum-section div[style*="gridCols"] {
      grid-template-columns: 1fr !important;
    }
  }

  @media (max-width: 640px) {
    .tidum-section {
      padding-left: 16px !important;
      padding-right: 16px !important;
    }
    .tidum-section div[style*="grid-template-columns:repeat"] {
      grid-template-columns: 1fr !important;
    }
    .tidum-section h1 { font-size: 1.5rem !important; }
    .tidum-section h2 { font-size: 1.25rem !important; }
  }

  @media (prefers-reduced-motion: reduce) {
    .tidum-fade-up { animation: none; }
    .tidum-section[data-anim-type] {
      opacity: 1 !important;
      transform: none !important;
      transition: none !important;
    }
  }
`;

/**
 * Scroll-based intersection observer script.
 * Inject as a <script> tag on the builder page.
 * Observes all sections with data-anim-type and adds .tidum-visible when in view.
 */
export const tidumScrollAnimScript = `
  (function() {
    var sections = document.querySelectorAll('.tidum-section[data-anim-type]');
    if (!sections.length || !('IntersectionObserver' in window)) {
      sections.forEach(function(s) { s.classList.add('tidum-visible'); });
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sections.forEach(function(s) { s.classList.add('tidum-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          var delay = parseInt(el.getAttribute('data-anim-delay') || '0', 10);
          var duration = parseInt(el.getAttribute('data-anim-duration') || '500', 10);
          el.style.transitionDuration = duration + 'ms';
          setTimeout(function() { el.classList.add('tidum-visible'); }, delay);
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.15 });
    sections.forEach(function(s) { observer.observe(s); });
  })();
`;
