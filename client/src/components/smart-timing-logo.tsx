import { cn } from "@/lib/utils";
import tidumLogo from "@assets/tidum-logo.png";

interface SmartTimingLogoProps {
  collapsed?: boolean;
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
}

export function SmartTimingLogo({ 
  collapsed = false, 
  className, 
  showText = true,
  size = "md" 
}: SmartTimingLogoProps) {
  const sizes = {
    sm: { icon: "h-6 w-6", wordmark: "h-6" },
    md: { icon: "h-8 w-8", wordmark: "h-8" },
    lg: { icon: "h-14 w-14", wordmark: "h-14" },
  };

  const s = sizes[size];
  const showWordmark = showText && !collapsed;

  return (
    <div className={cn("flex items-center gap-3", size === "lg" && "flex-col gap-2", className)}>
      {showWordmark ? (
        <img
          src={tidumLogo}
          alt="Tidum logo"
          className={cn("w-auto object-contain", s.wordmark, size === "lg" && "h-16")}
        />
      ) : (
        <img
          src={tidumLogo}
          alt="Tidum logo"
          className={cn("object-contain", s.icon)}
        />
      )}
      {size === "lg" && showWordmark && (
        <span className="text-xs text-muted-foreground mt-1">Arbeidstid gjort enkelt</span>
      )}
    </div>
  );
}
