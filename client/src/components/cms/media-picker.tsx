/**
 * MediaPicker — reusable dialog for picking an image from the existing
 * CMS media library, with inline upload. On select, fires onSelect with
 * the public URL of the chosen file.
 */
import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Image as ImageIcon, Loader2, Search, Upload, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaItem {
  id: number;
  url: string;
  filename: string;
  original_name?: string;
  alt_text?: string | null;
  mime_type?: string;
  width?: number | null;
  height?: number | null;
}

export function MediaPicker({
  open,
  onOpenChange,
  onSelect,
  trigger,
  title = "Velg bilde",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string, item: MediaItem) => void;
  trigger?: React.ReactNode;
  title?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: media = [], isLoading } = useQuery<MediaItem[]>({
    queryKey: ["/api/cms/media"],
    queryFn: () => fetch("/api/cms/media").then((r) => r.json()),
    enabled: open,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("image", file);
      const token = sessionStorage.getItem("cms_admin_token");
      const res = await fetch("/api/cms/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error("Opplasting feilet");
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/cms/media"] });
      toast({ title: "Lastet opp", description: data.url });
      // If the uploaded file is in the media table now, the next render picks it.
      // We also auto-select it for convenience.
      if (data?.url) {
        onSelect(data.url, {
          id: data.id ?? 0,
          url: data.url,
          filename: data.filename ?? "",
        });
        onOpenChange(false);
      }
    },
    onError: (e: any) => toast({ title: "Opplasting feilet", description: e.message, variant: "destructive" }),
  });

  const filtered = media.filter((m) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      m.filename?.toLowerCase().includes(q) ||
      m.original_name?.toLowerCase().includes(q) ||
      m.alt_text?.toLowerCase().includes(q)
    );
  });

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              {title}
            </DialogTitle>
            <DialogDescription>
              Velg fra eksisterende media, eller last opp et nytt bilde.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Søk etter filnavn eller alt-tekst…"
                className="h-9 pl-8"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={upload.isPending}
              onClick={() => fileInput.current?.click()}
            >
              {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              Last opp nytt
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
                e.target.value = "";
              }}
            />
          </div>

          <div className="max-h-[420px] overflow-y-auto -mx-6 px-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />Laster bilder…
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-12 text-center">
                {query ? "Ingen treff." : "Ingen bilder ennå — klikk «Last opp nytt» for å starte."}
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelect(m.url, m);
                      onOpenChange(false);
                    }}
                    className={cn(
                      "group relative aspect-square rounded-lg border bg-muted overflow-hidden hover:border-primary hover:shadow-md transition-all",
                    )}
                    title={m.original_name || m.filename}
                  >
                    <img
                      src={m.url}
                      alt={m.alt_text || m.filename || ""}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[10px] text-white truncate">{m.original_name || m.filename}</p>
                    </div>
                    <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary text-primary-foreground items-center justify-center hidden group-hover:flex shadow">
                      <Check className="h-3 w-3" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
