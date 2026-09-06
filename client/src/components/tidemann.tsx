/**
 * client/src/components/tidemann.tsx
 *
 * Tidemann is Tidum's in-app helper. He already speaks in three places — the
 * stuck-helper prompt, the employee-import feedback mail, and the time-tracking
 * location picker — but until now he had no shared visual identity: each surface
 * picked its own icon and colours.
 *
 * This module is that identity, in one place. When the illustrated Tidemann mark
 * is ready, `TidemannAvatar` is the only thing that changes; every surface picks
 * it up.
 *
 * Colour note: the header variant deliberately pins `sky-700` instead of using
 * `bg-primary`. The primary token lightens to `hsl(199 89% 48%)` in dark mode,
 * which drops white text to 2.86:1 — below WCAG AA. `sky-700` holds 5.93:1
 * against white in both themes. Tailwind's `sky` ramp is the brand hue anyway
 * (`sky-500` is `hsl(198.6 88.7% 48.4%)`, the brand accent), so this stays on
 * brand while passing the contrast bar K-19 is measured against.
 */

import { LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Placeholder mark. A life buoy reads as help, and nods to the coastal
 *  identity the name and the teal brand colour already share. Swap this one
 *  import when the illustrated character exists. */
const TidemannMark = LifeBuoy;

const AVATAR_SIZE = {
  sm: { box: "h-6 w-6", icon: "h-3.5 w-3.5" },
  md: { box: "h-7 w-7", icon: "h-4 w-4" },
  lg: { box: "h-9 w-9", icon: "h-5 w-5" },
} as const;

/**
 * Tidemann's avatar. Always decorative: every caller pairs it with his name in
 * text, so announcing it again would just make screen readers repeat "Tidemann".
 *
 * `onFilled` renders the mark for a saturated header (white on sky-700);
 * otherwise it renders tinted for a light surface.
 */
export function TidemannAvatar({
  size = "md",
  onFilled = false,
  className,
}: {
  size?: keyof typeof AVATAR_SIZE;
  onFilled?: boolean;
  className?: string;
}) {
  const s = AVATAR_SIZE[size];
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full ring-1",
        s.box,
        onFilled
          ? "bg-white/20 text-white ring-white/40"
          : "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/25",
        className,
      )}
    >
      <TidemannMark className={s.icon} />
    </div>
  );
}

/**
 * Tidemann's filled header bar. This markup existed in four near-identical
 * copies — the stuck-helper prompt, the tiltaksleder rates card, and both
 * import-feedback states — each repeating the same avatar, gradient and label.
 * Fixing the colours in one of them would have left three wrong, so they all
 * route through here now.
 *
 * `title` is the line the user actually reads; `icon` overrides the mark for a
 * state that is no longer Tidemann asking something (the import "thank you"
 * card uses a star).
 */
export function TidemannBanner({
  title,
  role = "hjelpe-agent",
  icon: Icon,
  action,
  className,
}: {
  title: string;
  role?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-sky-700 px-4 py-3 text-white", className)}>
      <div className="flex items-center gap-2">
        {Icon ? (
          <div
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/40"
          >
            <Icon className="h-4 w-4" />
          </div>
        ) : (
          <TidemannAvatar size="md" onFilled />
        )}
        <div className="min-w-0 flex-1 leading-tight">
          {/* white/90, not /80: at 80% opacity this label lands on 4.40:1
              against sky-700, just under the 4.5:1 AA floor. 90% gives 5.13:1. */}
          <p className="text-[10px] uppercase tracking-widest text-white/90">Tidemann · {role}</p>
          <p className="text-sm font-semibold">{title}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

/**
 * Tidemann's byline for a light surface — his avatar plus an attributed line,
 * so an explanation reads as coming from someone rather than from nowhere.
 *
 * `role` names what he is doing here ("hjelpe-agent", "forklarer turnusen").
 */
export function TidemannByline({
  role,
  children,
  className,
}: {
  role: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <TidemannAvatar size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-widest text-sky-700 dark:text-sky-300">
          Tidemann · {role}
        </p>
        {children}
      </div>
    </div>
  );
}
