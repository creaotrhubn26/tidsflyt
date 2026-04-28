/**
 * Wizard for å importere ansatte fra Planday/Visma/Quinyx/CSV.
 *
 * Tre-stegs flyt:
 *   1) Velg kilde (Planday, Visma, Quinyx, Excel/CSV)
 *   2) Steg-for-steg-guide for valgte kilde
 *   3) Last opp fil → POST /api/imports/employees
 *
 * Etter vellykket upload navigerer vi til /import-employees/:id/preview
 * (T7's preview-side) for rolle-tildeling og bekreftelse.
 */

import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, ArrowRight, Upload, FileSpreadsheet, ExternalLink, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import {
  IMPORT_SOURCES,
  guideForSource,
  type ImportSourceKey,
} from '@/lib/import-guides';

type WizardStep = 'source' | 'guide' | 'upload';

const SOURCE_ICONS: Record<ImportSourceKey, string> = {
  planday: '📅',
  visma:   '🧾',
  quinyx:  '🕐',
  csv:     '📄',
};

export default function ImportEmployeesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<WizardStep>('source');
  const [source, setSource] = useState<ImportSourceKey | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const guide = source ? guideForSource(source) : null;

  function selectSource(s: ImportSourceKey) {
    setSource(s);
    setStep('guide');
  }

  function backFromGuide() {
    setStep('source');
  }

  function continueToUpload() {
    setStep('upload');
  }

  function backFromUpload() {
    setStep('guide');
  }

  function handleFile(f: File | null) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast({
        title: 'Filen er for stor',
        description: 'Maks 10 MB. Splitt opp filen om dere har veldig mange ansatte.',
        variant: 'destructive',
      });
      return;
    }
    setFile(f);
  }

  async function uploadFile() {
    if (!file || !source) return;
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('source', source);

      const res = await fetch('/api/imports/employees', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Feilet (${res.status})`);
      }
      toast({
        title: 'Filen er lastet opp',
        description: `${data.summary.valid} gyldige rader, ${data.summary.errors} feil, ${data.summary.duplicates} duplikater. Gå gjennom preview-en før du bekrefter.`,
      });
      navigate(`/import-employees/${data.import_id}/preview`);
    } catch (err: any) {
      toast({
        title: 'Opplasting feilet',
        description: err?.message || 'Ukjent feil',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-[#16343d]">Importer ansatte</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Flytt ansatte fra Planday eller annet system inn i Tidum. Vi viser deg en preview før noe lagres.
        </p>
        <div className="mt-4 flex gap-1">
          {(['source', 'guide', 'upload'] as WizardStep[]).map((s, idx) => {
            const stepIdx = (['source', 'guide', 'upload'] as WizardStep[]).indexOf(step);
            return (
              <div
                key={s}
                className={
                  'h-1 flex-1 rounded-full transition-colors ' +
                  (idx <= stepIdx ? 'bg-primary' : 'bg-muted')
                }
              />
            );
          })}
        </div>
      </header>

      {step === 'source' && (
        <section data-testid="step-source">
          <Card className="mb-5 border-slate-200 bg-slate-50 p-3" data-testid="gdpr-banner">
            <div className="flex items-start gap-2 text-xs leading-relaxed text-[#37474d]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-[#16343d]">Personvern og ansvarsdeling</p>
                <p className="mt-1">
                  Når dere importerer ansatte, er <strong>din virksomhet behandlingsansvarlig</strong> og Tidum er databehandler iht. signert DPA. Importer kun ansatt-data dere har rettsgrunnlag for (typisk arbeidskontrakt), og informer de ansatte iht. GDPR art. 13. Vi ber om eksplisitt bekreftelse før importen lagres.
                </p>
              </div>
            </div>
          </Card>
          <h2 className="mb-4 text-lg font-semibold">Hvor kommer dataene fra?</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {IMPORT_SOURCES.map((s) => (
              <Card
                key={s.key}
                className="cursor-pointer p-4 transition hover:border-primary hover:shadow-md"
                onClick={() => selectSource(s.key)}
                data-testid={`source-${s.key}`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{SOURCE_ICONS[s.key]}</div>
                  <div className="flex-1">
                    <div className="font-semibold text-[#16343d]">{s.label}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{s.description}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {step === 'guide' && guide && (
        <section data-testid="step-guide">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Slik eksporterer du fra {guide.meta.label}</h2>
            <Button variant="ghost" size="sm" onClick={backFromGuide} data-testid="button-back-source">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Bytt kilde
            </Button>
          </div>

          <Card className="mb-4 border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{guide.intro}</p>
            </div>
          </Card>

          <ol className="space-y-3">
            {guide.steps.map((s, i) => (
              <li key={i} className="rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-[#16343d]">{s.title}</div>
                    <p className="mt-1 text-sm text-[#486168]">{s.body}</p>
                    {s.tip && (
                      <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
                        💡 {s.tip}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <Card className="mt-4 border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-start gap-2 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{guide.outro}</p>
            </div>
          </Card>

          {guide.helpUrl && (
            <a
              href={guide.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-sm text-primary underline"
              data-testid="link-source-help"
            >
              <ExternalLink className="h-3 w-3" />
              {guide.meta.label}'s offisielle hjelpe-artikkel
            </a>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={continueToUpload} data-testid="button-continue-upload">
              Jeg har filen, gå til opplasting
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>
      )}

      {step === 'upload' && source && (
        <section data-testid="step-upload">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Last opp fil</h2>
            <Button variant="ghost" size="sm" onClick={backFromUpload}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Tilbake til guide
            </Button>
          </div>

          <Card
            className={
              'flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed p-8 text-center transition ' +
              (file ? 'border-primary bg-primary/5' : 'border-[#d4dde0] hover:border-primary')
            }
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files?.[0] ?? null);
            }}
            data-testid="dropzone-file"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              data-testid="input-file"
            />
            {file ? (
              <>
                <FileSpreadsheet className="h-10 w-10 text-primary" />
                <div className="text-sm font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB — klikk for å bytte fil
                </div>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 text-muted-foreground" />
                <div className="text-sm font-medium">Slipp fil her, eller klikk for å bla</div>
                <div className="text-xs text-muted-foreground">
                  Excel (.xlsx) eller CSV (.csv) — maks 10 MB / 10 000 rader
                </div>
              </>
            )}
          </Card>

          <div className="mt-6 flex justify-between">
            <div className="text-xs text-muted-foreground">
              Filen lagres som "staged" og vises i preview før noe importeres til Tidum.
            </div>
            <Button
              onClick={uploadFile}
              disabled={!file || isUploading}
              data-testid="button-upload"
            >
              {isUploading ? 'Laster opp...' : 'Last opp og fortsett'}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
