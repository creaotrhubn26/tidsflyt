import { cn } from "@/lib/utils";

interface HangingPocketWatchProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  animate?: boolean;
}

export function HangingPocketWatch({ 
  className,
  size = "lg",
  animate = true
}: HangingPocketWatchProps) {
  const sizes = {
    sm: { watch: 48, chain: 30 },
    md: { watch: 64, chain: 40 },
    lg: { watch: 96, chain: 60 },
    xl: { watch: 128, chain: 80 },
  };

  const s = sizes[size];

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div 
        className="flex flex-col items-center"
        style={{
          animation: animate ? "sway 4s ease-in-out infinite" : undefined,
          transformOrigin: "top center",
        }}
      >
        <svg 
          width="4" 
          height={s.chain} 
          viewBox={`0 0 4 ${s.chain}`}
          className="text-muted-foreground/60"
        >
          {Array.from({ length: Math.floor(s.chain / 8) }).map((_, i) => (
            <ellipse
              key={i}
              cx="2"
              cy={4 + i * 8}
              rx="1.5"
              ry="3"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.8"
              className="dark:stroke-zinc-400 stroke-zinc-500"
            />
          ))}
        </svg>
        
        <div 
          className="relative rounded-full shadow-xl"
          style={{ 
            width: s.watch, 
            height: s.watch,
          }}
        >
          <div 
            className="absolute inset-0 rounded-full overflow-hidden border-4 border-zinc-300 dark:border-zinc-600"
            style={{
              background: "linear-gradient(135deg, #1e3a5f 0%, #0f2744 50%, #1a3350 100%)",
              boxShadow: "inset 0 2px 10px rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.4)",
            }}
          >
            <svg 
              viewBox="0 0 100 100" 
              className="w-full h-full"
            >
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              
              {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => {
                const isHour = i % 3 === 0;
                const length = isHour ? 8 : 4;
                const x1 = 50 + 35 * Math.cos((angle - 90) * Math.PI / 180);
                const y1 = 50 + 35 * Math.sin((angle - 90) * Math.PI / 180);
                const x2 = 50 + (35 - length) * Math.cos((angle - 90) * Math.PI / 180);
                const y2 = 50 + (35 - length) * Math.sin((angle - 90) * Math.PI / 180);
                return (
                  <line
                    key={angle}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth={isHour ? "2" : "1"}
                    strokeLinecap="round"
                  />
                );
              })}
              
              <line
                x1="50"
                y1="50"
                x2="50"
                y2="25"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <line
                x1="50"
                y1="50"
                x2="70"
                y2="40"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              
              <circle cx="50" cy="50" r="3" fill="white" />
            </svg>
          </div>
          
          <div 
            className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-4 rounded-t-full border-2 border-zinc-300 dark:border-zinc-600 bg-gradient-to-b from-zinc-200 to-zinc-400 dark:from-zinc-500 dark:to-zinc-700"
          />
        </div>
      </div>
      
      <style>{`
        @keyframes sway {
          0%, 100% { transform: rotate(-2deg); }
          50% { transform: rotate(2deg); }
        }
      `}</style>
    </div>
  );
}

export function HangingPocketWatchHero({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn("absolute top-0 left-1/2 -translate-x-1/2 z-10", className)}>
      <HangingPocketWatch size="xl" animate={true} />
    </div>
  );
}
