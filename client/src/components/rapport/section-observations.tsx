import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export interface ObservationEntry {
  id: string;
  date: string;
  area: string;
  text: string;
}

const AREAS = [
  "Trygghet",
  "Utvikling",
  "Relasjoner",
  "Skole / aktivitet",
  "Helse",
  "Annet",
];

export function SectionObservations({
  value,
  onChange,
  helpText,
}: {
  value: ObservationEntry[];
  onChange: (v: ObservationEntry[]) => void;
  helpText?: string;
}) {
  const add = () => {
    const today = new Date().toISOString().split("T")[0];
    onChange([
      ...value,
      { id: `obs-${Date.now()}`, date: today, area: AREAS[0], text: "" },
    ]);
  };

  const update = (id: string, patch: Partial<ObservationEntry>) => {
    onChange(value.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const remove = (id: string) => {
    onChange(value.filter((o) => o.id !== id));
  };

  return (
    <div className="space-y-3">
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}

      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Ingen observasjoner ennå
        </div>
      ) : (
        <div className="space-y-2">
          {value.map((obs, i) => (
            <div key={obs.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div className="grid grid-cols-2 gap-2 flex-1">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Dato</Label>
                    <Input
                      type="date"
                      value={obs.date}
                      onChange={(e) => update(obs.id, { date: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Område</Label>
                    <Select value={obs.area} onValueChange={(v) => update(obs.id, { area: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(obs.id)}
                  className="text-muted-foreground hover:text-destructive h-7 w-7 p-0 flex-shrink-0"
                  aria-label="Fjern observasjon"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Textarea
                value={obs.text}
                onChange={(e) => update(obs.id, { text: e.target.value })}
                placeholder="Beskriv observasjonen — ingen navn eller personopplysninger."
                rows={3}
                className="text-sm"
              />
            </div>
          ))}
        </div>
      )}

      <Button size="sm" variant="outline" onClick={add} className="w-full">
        <Plus className="h-3.5 w-3.5 mr-1.5" /> Legg til observasjon
      </Button>
    </div>
  );
}
