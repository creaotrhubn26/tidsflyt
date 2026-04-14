import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface ChecklistItemState {
  checked: boolean;
  note?: string;
}

export type ChecklistValue = Record<string, ChecklistItemState>;

export function SectionChecklist({
  items,
  value,
  onChange,
  helpText,
}: {
  items: string[];
  value: ChecklistValue;
  onChange: (v: ChecklistValue) => void;
  helpText?: string;
}) {
  const setItem = (item: string, patch: Partial<ChecklistItemState>) => {
    onChange({
      ...value,
      [item]: { checked: false, ...(value[item] ?? {}), ...patch },
    });
  };

  return (
    <div className="space-y-2">
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      <div className="space-y-2">
        {items.map((item, i) => {
          const state = value[item] ?? { checked: false };
          return (
            <div
              key={`${i}-${item}`}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                state.checked && "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/10",
              )}
            >
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={state.checked}
                  onCheckedChange={(v) => setItem(item, { checked: !!v })}
                  className="mt-0.5"
                />
                <span className="text-sm flex-1 leading-relaxed">{item}</span>
              </label>
              {state.checked && (
                <Textarea
                  value={state.note ?? ""}
                  onChange={(e) => setItem(item, { note: e.target.value })}
                  placeholder="Valgfri merknad…"
                  rows={2}
                  className="mt-2 text-xs"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
