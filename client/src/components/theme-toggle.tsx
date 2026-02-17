import { Moon, Sun, Palette, Contrast } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const themes = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "sepia", label: "Sepia", icon: Palette },
    { value: "high-contrast", label: "High Contrast", icon: Contrast },
    { value: "system", label: "System", icon: Sun },
  ];

  const currentTheme = themes.find(t => t.value === theme);
  const CurrentIcon = currentTheme?.icon || Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid="button-theme-toggle"
        >
          <CurrentIcon className="h-5 w-5" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {themes.map((t) => {
          const ThemeIcon = t.icon;
          return (
            <DropdownMenuCheckboxItem
              key={t.value}
              checked={theme === t.value}
              onCheckedChange={() => setTheme(t.value as any)}
              className="flex items-center gap-2 cursor-pointer"
              data-testid={`theme-option-${t.value}`}
            >
              <ThemeIcon className="h-4 w-4" />
              <span>{t.label}</span>
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
