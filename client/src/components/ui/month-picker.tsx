import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MONTHS_NO = [
  "Jan", "Feb", "Mar", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Des",
];

const MONTHS_FULL_NO = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

interface MonthPickerProps {
  /** Value in "yyyy-MM" format */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

export function MonthPicker({
  value,
  onChange,
  placeholder = "Velg måned",
  className,
  "data-testid": testId,
}: MonthPickerProps) {
  const parsed = value ? value.split("-") : [];
  const initYear = parsed[0] ? parseInt(parsed[0]) : new Date().getFullYear();

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initYear);

  const selectedYear = parsed[0] ? parseInt(parsed[0]) : null;
  const selectedMonth = parsed[1] ? parseInt(parsed[1]) - 1 : null; // 0-indexed

  function select(monthIndex: number) {
    const mm = String(monthIndex + 1).padStart(2, "0");
    onChange(`${viewYear}-${mm}`);
    setOpen(false);
  }

  const displayLabel =
    selectedYear && selectedMonth !== null
      ? `${MONTHS_FULL_NO[selectedMonth]} ${selectedYear}`
      : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Backward compatibility for tests/tools that fill a real input */}
      <input
        type="month"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute left-0 top-0 h-px w-px opacity-0"
      />
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId ? `${testId}-trigger` : undefined}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
            "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            {displayLabel}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-50" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-72 p-0 shadow-lg" align="start">
        {/* Year navigation */}
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <button
            type="button"
            onClick={() => setViewYear((y) => y - 1)}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent transition-colors"
            aria-label="Forrige år"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold tabular-nums">{viewYear}</span>
          <button
            type="button"
            onClick={() => setViewYear((y) => y + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent transition-colors"
            aria-label="Neste år"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-4 gap-1 p-3">
          {MONTHS_NO.map((label, i) => {
            const isSelected = selectedYear === viewYear && selectedMonth === i;
            const isCurrentMonth =
              new Date().getFullYear() === viewYear && new Date().getMonth() === i;

            return (
              <button
                key={i}
                type="button"
                onClick={() => select(i)}
                className={cn(
                  "relative flex h-9 items-center justify-center rounded-md text-sm font-medium transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-accent hover:text-accent-foreground",
                  isCurrentMonth && !isSelected &&
                    "ring-1 ring-primary/40 text-primary",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Quick: this month */}
        {!( selectedYear === new Date().getFullYear() && selectedMonth === new Date().getMonth()) && (
          <div className="border-t px-3 py-2">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setViewYear(now.getFullYear());
                select(now.getMonth());
              }}
              className="w-full rounded-md py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Gå til denne måneden
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
