import { cn } from "@/lib/utils";
import logoUrl from "@assets/Logo-ST_1766202609878.png";

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
    sm: { img: "h-6 w-6", text: "text-sm" },
    md: { img: "h-8 w-8", text: "text-lg" },
    lg: { img: "h-10 w-10", text: "text-xl" },
  };

  const s = sizes[size];

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img 
        src={logoUrl} 
        alt="Smart Timing" 
        className={cn(s.img, "object-contain")}
      />
      {showText && !collapsed && (
        <div className="flex flex-col">
          <span className={cn("font-bold text-foreground", s.text)}>Smart Timing</span>
          {size === "lg" && (
            <span className="text-xs text-muted-foreground">Timeføring for profesjonelle</span>
          )}
        </div>
      )}
    </div>
  );
}
