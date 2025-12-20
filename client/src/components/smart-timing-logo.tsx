import { cn } from "@/lib/utils";

interface SmartTimingLogoProps {
  collapsed?: boolean;
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
}

function MiniPocketWatch({ size }: { size: number }) {
  return (
    <div 
      className="relative rounded-full"
      style={{ width: size, height: size }}
    >
      <div 
        className="absolute inset-0 rounded-full overflow-hidden border-2 border-zinc-300 dark:border-zinc-500"
        style={{
          background: "linear-gradient(135deg, #1e3a5f 0%, #0f2744 50%, #1a3350 100%)",
          boxShadow: "inset 0 1px 4px rgba(0,0,0,0.3)",
        }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {[0, 90, 180, 270].map((angle) => {
            const x1 = 50 + 38 * Math.cos((angle - 90) * Math.PI / 180);
            const y1 = 50 + 38 * Math.sin((angle - 90) * Math.PI / 180);
            const x2 = 50 + 30 * Math.cos((angle - 90) * Math.PI / 180);
            const y2 = 50 + 30 * Math.sin((angle - 90) * Math.PI / 180);
            return (
              <line
                key={angle}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(255,255,255,0.8)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            );
          })}
          <line x1="50" y1="50" x2="50" y2="28" stroke="white" strokeWidth="3" strokeLinecap="round" />
          <line x1="50" y1="50" x2="68" y2="42" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <circle cx="50" cy="50" r="4" fill="white" />
        </svg>
      </div>
      <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-2 rounded-t-full border border-zinc-300 dark:border-zinc-500 bg-gradient-to-b from-zinc-200 to-zinc-400 dark:from-zinc-500 dark:to-zinc-600" />
    </div>
  );
}

export function SmartTimingLogo({ 
  collapsed = false, 
  className, 
  showText = true,
  size = "md" 
}: SmartTimingLogoProps) {
  const sizes = {
    sm: { icon: 24, text: "text-sm" },
    md: { icon: 32, text: "text-lg" },
    lg: { icon: 40, text: "text-xl" },
  };

  const s = sizes[size];

  return (
    <div className={cn("flex items-center gap-3", size === "lg" ? "flex-col gap-2" : "", className)}>
      <MiniPocketWatch size={s.icon} />
      {showText && !collapsed && (
        <div className={cn("flex flex-col", size === "lg" ? "items-center" : "")}>
          <span className={cn("font-bold text-foreground", s.text)}>Tidsflyt</span>
          {size === "lg" && (
            <span className="text-xs text-muted-foreground mt-1">Timeføring for profesjonelle</span>
          )}
        </div>
      )}
    </div>
  );
}
