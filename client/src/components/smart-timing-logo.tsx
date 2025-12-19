import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

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
    sm: { icon: "h-4 w-4", container: "w-6 h-6", text: "text-sm" },
    md: { icon: "h-5 w-5", container: "w-8 h-8", text: "text-lg" },
    lg: { icon: "h-6 w-6", container: "w-10 h-10", text: "text-xl" },
  };

  const s = sizes[size];

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn(
        "flex items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700",
        s.container
      )}>
        <Clock className={cn(s.icon, "text-white")} />
      </div>
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
