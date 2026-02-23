import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import {
  Clock,
  BarChart3,
  FileText,
  Settings,
  ArrowRight,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  SlidersHorizontal,
  Palette,
  Hand,
  Target,
  PenSquare,
  CalendarDays,
  Inbox,
  RefreshCcw,
  Eye,
  CheckCircle,
  ClipboardCheck,
  ScanSearch,
  Smartphone,
  Home,
  ClipboardList,
  Users,
  Lightbulb,
  NotebookPen,
  Timer,
  TrendingUp,
  Phone,
  Monitor,
  Image as ImageIcon,
  Sunrise,
  Camera,
  Brain,
  Zap,
  AlertTriangle,
  CircleHelp,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tidumPageStyles } from '@/lib/tidum-page-styles';
import { useSEO } from '@/hooks/use-seo';
import tidumWordmark from '@assets/tidum-wordmark.png';

const COLORS = {
  primary: '#1F6B73',
  secondary: '#4E9A6F',
  accent: '#3A8B73',
  textDark: '#1E2A2C',
  textLight: '#5F6B6D',
  bgLight: '#F9FCFB',
  border: '#D5DDD9',
};

interface FAQItem {
  question: string;
  answer: string;
}

const faqItems: FAQItem[] = [
  {
    question: 'Hvordan gjenoppretter jeg en slettet oppføring?',
    answer: 'Kontakt administrator. Slettede oppføringer flyttes til gjenopprettingsbingen og kan gjenopprettes innen 30 dager.',
  },
  {
    question: 'Kan jeg redigere rapporter etter innsending?',
    answer: 'Sendt rapporter er låst for compliance. Hvis avvist, kan du revidere og sende på nytt.',
  },
  {
    question: 'Hva skjer hvis tilgangsforespørselen blir avslått?',
    answer: 'Du får beskjed med årsaking. Kontakt godkjenneren for klargjøring og innse ny forespørsel etter justering.',
  },
  {
    question: 'Hvor ofte bør jeg generere rapporter?',
    answer: 'Generelt månedlig for organisasjon. Personlig: ukentlige sammendrag for å identifisere trender og forbedringspunkter.',
  },
  {
    question: 'Kan jeg eksportere dataene mine?',
    answer: 'Ja! Eksporter som CSV, Excel eller PDF. Perfekt for egen analyse eller deling med andre.',
  },
  {
    question: 'Hvordan justerer jeg hvor mange forslag Tidum viser?',
    answer: 'Gå til Innstillinger → Forslag. Velg modus, hyppighet og sikkerhetsterskel. Høyere terskel gir færre, men tryggere forslag.',
  },
  {
    question: 'Hva betyr "Ikke foreslå igjen"?',
    answer: 'Når du velger dette på et forslag, legges verdien i blokklisten din. Du kan fjerne blokkeringen i Innstillinger når som helst.',
  },
];

const FAQAccordion: React.FC<{ item: FAQItem }> = ({ item }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={`p-6 rounded-lg bg-gradient-to-r from-[#F9FCFB] to-[#F2FAF8] border transition-all hover:border-[#1F6B73] ${isOpen ? 'border-[var(--ig-primary)]' : 'border-[#D8E6DF]'}`}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between font-bold cursor-pointer"
      >
        <span className="text-[var(--ig-text-dark)]">{item.question}</span>
        <span
          className={`text-[var(--ig-text-light)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          ▼
        </span>
      </button>
      {isOpen && (
        <p className="text-sm mt-4 text-[var(--ig-text-light)]">
          {item.answer}
        </p>
      )}
    </div>
  );
};

const ScreenshotPlaceholder: React.FC<{
  title: string;
  icon?: React.ReactNode;
  size: string;
  src?: string;
}> = ({ title, icon, size, src }) => {
  if (src) {
    return (
      <div className="rounded-lg overflow-hidden border border-[#D8E6DF] flex items-center justify-center bg-white">
        <img src={src} alt={title} className="w-full h-auto object-cover" />
      </div>
    );
  }

  return (
    <div
      className="rounded-lg p-8 border-2 border-dashed border-[#D8E6DF] h-[280px] flex items-center justify-center bg-gradient-to-br from-[#E6F2EE] to-[#DDE9E5]"
    >
      <div className="text-center">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[var(--ig-primary)]">
          {icon || <ImageIcon className="h-6 w-6" />}
        </div>
        <p className="font-semibold mb-2 text-[var(--ig-primary)]">
          {title}
        </p>
        <p className="text-sm text-[var(--ig-text-light)]">
          Skjermbilde vil vises her etter konfigurering
        </p>
        <p className="text-xs mt-3 text-[#95A3A6]">
          Min. {size} anbefalt
        </p>
      </div>
    </div>
  );
};

const WhiskerIllustrationPlaceholder: React.FC<{
  title: string;
  description: string;
  src?: string;
}> = ({ title, description, src }) => (
  <div className="rounded-lg overflow-hidden border border-[#D8E6DF] bg-white">
    {src ? (
      <img src={src} alt={title} className="w-full h-auto object-cover" />
    ) : (
      <div
        className="p-8 border-2 border-dashed border-[#C084FC] min-h-[300px] bg-[rgba(196,132,252,0.08)] flex items-center justify-center"
      >
        <div className="text-center">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/90 text-[#9333EA]">
            <Palette className="h-7 w-7" />
          </div>
          <p className="font-semibold mb-2 text-[#9333EA]">
            {title}
          </p>
          <p className="text-sm max-w-xs text-[#7E22CE]">
            {description}
          </p>
          <p className="text-xs mt-4 px-3 py-1 bg-white rounded-full inline-block text-[#C084FC]">
            Whisker illustration - upload here
          </p>
        </div>
      </div>
    )}
    <div className="px-4 py-3 border-t border-[#E6EFEA] bg-[#F9FCFB]">
      <p className="text-sm font-medium text-[#36545B]">{title}</p>
      <p className="text-xs text-[var(--ig-text-light)] mt-1">{description}</p>
    </div>
  </div>
);

const StepBadge: React.FC<{ number: number }> = ({ number }) => (
  <div
    className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-lg text-white flex-shrink-0 bg-[linear-gradient(135deg,var(--ig-primary),var(--ig-secondary))]"
  >
    {number}
  </div>
);

const InfoBox: React.FC<{ children: React.ReactNode; type?: 'success' | 'info' | 'warning' }> = ({
  children,
  type = 'info',
}) => {
  const classMap = {
    success: 'bg-[#E7F3EE] border-[#4E9A6F] text-[#2A6452]',
    info: 'bg-[#F0F5F7] border-[var(--ig-primary,#1F6B73)] text-[var(--ig-text-dark,#1E2A2C)]',
    warning: 'bg-[#FEF3E6] border-[#D97706] text-[#92400E]',
  };

  return (
    <div className={`border-l-4 p-4 rounded ${classMap[type]}`}>
      {children}
    </div>
  );
};

const WorkflowSVG: React.FC = () => {
  const steps = [
    { title: 'Klikk Start', desc: 'Begynn arbeid', icon: Hand, bg: 'bg-[#E7F3EE]' },
    { title: 'Velg prosjekt', desc: 'Tildel oppgave', icon: Target, bg: 'bg-[#F0F5F7]' },
    { title: 'Legg til detaljer', desc: 'Beskriv arbeid', icon: PenSquare, bg: 'bg-[#F5EFE1]' },
    { title: 'Lagre', desc: 'Fullstendig', icon: CheckCircle, bg: 'bg-[#E8F5EE]' },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      {steps.map((step) => {
        const Icon = step.icon;
        return (
          <div key={step.title} className={`rounded-xl border border-[#D8E6DF] p-4 ${step.bg}`}>
            <Icon className="mb-3 h-6 w-6 text-[var(--ig-primary)]" />
            <p className="text-sm font-semibold text-[var(--ig-text-dark)]">{step.title}</p>
            <p className="mt-1 text-xs text-[var(--ig-text-light)]">{step.desc}</p>
          </div>
        );
      })}
    </div>
  );
};

const ReportGenerationSVG: React.FC = () => {
  const steps = [
    { title: 'Åpne Rapporter', icon: BarChart3 },
    { title: 'Velg periode', icon: CalendarDays },
    { title: 'Rapporttype', icon: ClipboardList },
    { title: 'Generer', icon: Sparkles },
    { title: 'Eksporter', icon: Inbox },
  ] as const;

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-5">
      {steps.map((step) => {
        const Icon = step.icon;
        return (
          <div key={step.title} className="rounded-xl border border-[#D8E6DF] bg-white p-4 text-center">
            <Icon className="mx-auto mb-2 h-6 w-6 text-[var(--ig-secondary)]" />
            <p className="text-xs font-semibold text-[var(--ig-text-dark)]">{step.title}</p>
          </div>
        );
      })}
    </div>
  );
};

const CaseLifecycleSVG: React.FC = () => {
  const stages = [
    { title: 'Opprettet', sub: 'Innledende info', icon: Inbox },
    { title: 'Dokumentasjon', sub: 'Samle bevis', icon: NotebookPen },
    { title: 'Gjennomgang', sub: 'Venter godkjenning', icon: Eye },
    { title: 'Godkjent', sub: 'Bekreftet', icon: CheckCircle2 },
  ] as const;

  return (
    <div className="mb-8 grid grid-cols-1 gap-3 md:grid-cols-4">
      {stages.map((stage) => {
        const Icon = stage.icon;
        return (
          <div key={stage.title} className="rounded-xl border border-[#D8E6DF] bg-white p-4 text-center">
            <Icon className="mx-auto mb-2 h-6 w-6 text-[var(--ig-primary)]" />
            <p className="text-sm font-semibold text-[var(--ig-text-dark)]">{stage.title}</p>
            <p className="mt-1 text-xs text-[var(--ig-text-light)]">{stage.sub}</p>
          </div>
        );
      })}
    </div>
  );
};

const AccessRequestSVG: React.FC = () => (
  <div className="mb-6 grid gap-3 md:grid-cols-5">
    <div className="rounded-xl border border-[#D8E6DF] bg-[#E7F3EE] p-4 text-center">
      <NotebookPen className="mx-auto mb-2 h-6 w-6 text-[var(--ig-primary)]" />
      <p className="text-sm font-semibold text-[var(--ig-text-dark)]">Forespørsel</p>
      <p className="mt-1 text-xs text-[var(--ig-text-light)]">Innsendt av bruker</p>
    </div>
    <div className="rounded-xl border border-[#D8E6DF] bg-[#F0F5F7] p-4 text-center">
      <Eye className="mx-auto mb-2 h-6 w-6 text-[var(--ig-primary)]" />
      <p className="text-sm font-semibold text-[var(--ig-text-dark)]">Gjennomgang</p>
      <p className="mt-1 text-xs text-[var(--ig-text-light)]">Leder vurderer</p>
    </div>
    <div className="rounded-xl border border-[#D8E6DF] bg-[#F5EFE1] p-4 text-center">
      <ClipboardCheck className="mx-auto mb-2 h-6 w-6 text-[var(--ig-primary)]" />
      <p className="text-sm font-semibold text-[var(--ig-text-dark)]">Avgjøring</p>
      <p className="mt-1 text-xs text-[var(--ig-text-light)]">Godkjent eller avvist</p>
    </div>
    <div className="rounded-xl border border-[#D8E6DF] bg-[#E8F5EE] p-4 text-center">
      <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-[var(--ig-secondary)]" />
      <p className="text-sm font-semibold text-[#2A6452]">Godkjent</p>
    </div>
    <div className="rounded-xl border border-[#D8E6DF] bg-[#FEF3E6] p-4 text-center">
      <RefreshCcw className="mx-auto mb-2 h-6 w-6 text-[#D97706]" />
      <p className="text-sm font-semibold text-[#92400E]">Avvist / revidering</p>
    </div>
  </div>
);

export const InteractiveGuide: React.FC = () => {
  const observerRef = useRef<IntersectionObserver | null>(null);

  useSEO({
    title: "Interaktiv guide – Lær Tidum",
    description: "Steg-for-steg guide til Tidum. Lær timeføring, rapportering og prosjektstyring på en enkel måte.",
    canonical: "https://tidum.no/guide",
  });

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-fadeIn');
            observerRef.current?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('[data-observe]').forEach((el) => {
      observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <main className="tidum-page">
      <style>{tidumPageStyles}
      {`
        .ig-page { --ig-primary: ${COLORS.primary}; --ig-secondary: ${COLORS.secondary}; --ig-accent: ${COLORS.accent}; --ig-text-dark: ${COLORS.textDark}; --ig-text-light: ${COLORS.textLight}; --ig-bg-light: ${COLORS.bgLight}; --ig-border: ${COLORS.border}; }
      `}
      </style>

      <div className="rt-container pb-20 pt-8 ig-page">
        {/* ── Hero / Header Panel ── */}
        <section className="tidum-panel tidum-fade-up relative overflow-hidden rounded-[28px]">
          <div className="pointer-events-none absolute -left-16 top-[34%] h-36 w-96 rotate-[-14deg] rounded-[999px] bg-[rgba(131,171,145,0.2)]" />
          <div className="pointer-events-none absolute right-[-140px] top-14 h-80 w-[520px] rounded-[999px] bg-[rgba(194,205,195,0.24)]" />

          <header className="relative z-10 flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <Link href="/">
                <img src={tidumWordmark} alt="Tidum" className="h-10 w-auto sm:h-11 cursor-pointer" />
              </Link>
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <Link href="/hvorfor" className="hidden items-center gap-2 text-base text-[#26373C] transition-colors hover:text-[var(--color-primary)] sm:inline-flex">
                Hvorfor Tidum?
              </Link>
              <Link href="/kontakt">
                <Button className="tidum-btn-primary inline-flex h-auto items-center px-6 py-3 text-base font-semibold">
                  Be om demo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </header>

          <div className="relative z-10 px-6 py-12 sm:px-8 sm:py-16 text-center max-w-4xl mx-auto">
            <h1 className="tidum-title">
              Velkommen til <span className="text-[var(--color-primary)]">Tidum</span>
            </h1>
            <p className="tidum-text mt-6 max-w-2xl mx-auto">
              Behersk kunsten med <span className="font-semibold text-[var(--color-primary)]">intelligent arbeidstidsregistrering</span>.
              Registrer, analyser og optimaliser hver time av din profesjonelle reise.
            </p>
            <div className="mt-6 max-w-2xl mx-auto">
              <InfoBox type="info">
                <span className="inline-flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Denne interaktive veiledningen tar deg gjennom alle funksjoner med historier, eksempler og reelle arbeitsflyter.
                </span>
              </InfoBox>
            </div>
          </div>
        </section>

        {/* Content */}
        <div className="max-w-7xl mx-auto mt-12">
        {/* TIME REGISTRATION */}
        <section className="tidum-fade-up mb-12 rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-section)] p-6 sm:p-8" data-observe>
          <div className="flex items-center gap-4 mb-10">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#E7F3EE]">
              <Clock size={24} className="text-[#3A8B73]" />
            </div>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-[#15343D]">
                Registrer din tid
              </h2>
              <p className="text-sm mt-1 text-[var(--color-text-muted)]">
                Din profesjonelle dagbok starter her
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white/95 p-6 sm:p-8 shadow-[0_8px_28px_rgba(22,43,49,0.06)] mb-6">
            <div className="flex gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#E7F3EE] text-[var(--ig-primary)]">
                <Sunrise className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-[#1D2C31] mb-2">Din første dag med Tidum</h3>
                <p className="leading-relaxed text-[var(--color-text-muted)]">
                  Hver profesjonell dag forteller en historie. Når du registrerer tid, bygger du ikke bare et tidsarkiv—du dokumenterer dine
                  arbeidsresultater. Hver oppføring blir en byggesten i din profesjonelle fortelling, og skaper mønstre som avslører dine
                  arbeidsvanер, produktivitetspakker og områder for forbedring.
                </p>
              </div>
            </div>
            <div className="mt-6">
              <WhiskerIllustrationPlaceholder
                title="Morning Routine Illustration"
                description="A person starting their day with Tidum, coffee in hand, ready to track their work..."
                src="/illustrations/morning-routine.png"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-6 sm:p-8 mb-6">
            <h3 className="font-semibold mb-6 text-[var(--color-primary)] flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Arbeidsflyt for tidsregistrering
            </h3>
            <WorkflowSVG />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-6 sm:p-8">
              <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 text-[#1D2C31]">
                <Plus className="h-4 w-4 text-[var(--ig-primary)]" /> Opprett tidsføring i 4 steg
              </h3>
              <div className="space-y-6">
                {[1, 2, 3, 4].map((num) => {
                  const steps = [
                    { title: 'Start stoppeklokken', desc: 'Trykk "Start" når du begynner å arbeide' },
                    { title: 'Velg prosjekt', desc: 'Tildel oppgaven til riktig prosjekt' },
                    { title: 'Legg til detaljer', desc: 'Beskriv det du arbeidet med' },
                    { title: 'Lagre oppføringen', desc: 'Fullfør registreringen' },
                  ];
                  const step = steps[num - 1];
                  return (
                    <div key={num} className="flex gap-4">
                      <StepBadge number={num} />
                      <div>
                        <p className="font-semibold text-[var(--color-primary)]">
                          {step.title}
                        </p>
                        <p className="text-sm mt-1 text-[var(--color-text-muted)]">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <ScreenshotPlaceholder title="Tidsregistrering Skjermbilde" icon={<Smartphone className="h-6 w-6" />} size="480x360px" src="/screenshots/time-tracking.webp" />
          </div>
        </section>

        {/* SMART SUGGESTIONS */}
        <section className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-white p-6 sm:p-8" data-observe>
          <div className="flex items-center gap-4 mb-10">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#F0F5F7]">
              <Sparkles size={24} className="text-[var(--color-primary)]" />
            </div>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-[#15343D]">
                Smarte forslag i Tidum
              </h2>
              <p className="text-sm mt-1 text-[var(--color-text-muted)]">
                Få hjelp fra historikken din, med full kontroll
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white/95 p-6 sm:p-8 shadow-[0_8px_28px_rgba(22,43,49,0.06)] mb-6">
            <div className="flex gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#F0F5F7] text-[var(--ig-primary)]">
                <Brain className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-[#1D2C31] mb-2">Personlige forslag med forklaring</h3>
                <p className="leading-relaxed text-[var(--color-text-muted)]">
                  Tidum foreslår prosjekt, tekst, timer og kopiering fra forrige måned basert på tidligere føringer.
                  Hvert forslag viser <span className="font-semibold text-[var(--color-primary)]">hvorfor</span> og
                  <span className="font-semibold text-[var(--color-primary)]"> sikkerhet</span> slik at du kan vurdere
                  raskt før du bruker det.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            {[
              {
                icon: Home,
                title: "Dashboard",
                desc: "Bruk forslag direkte i Quick Log. Du kan også velge «Hele uka» eller «Kopier måned».",
              },
              {
                icon: Clock,
                title: "Timeføring",
                desc: "Forslagskort viser prosjekt, beskrivelse og timer med forklaring. Velg «Bruk», «Ikke nå» eller «Aldri».",
              },
              {
                icon: ClipboardList,
                title: "Saksrapporter",
                desc: "Foreslått sak, felt og kopiering fra forrige måned. Du kan blokkere en sak fra videre forslag.",
              },
              {
                icon: CalendarDays,
                title: "Rapporter",
                desc: "Planleggingsforslag gjenbruker sist brukte rapportplan med tydelig hvorfor/sikkerhet.",
              },
            ].map((item, idx) => (
              <div key={idx} className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <item.icon className="h-6 w-6 text-[var(--ig-primary)]" />
                  <h4 className="font-semibold text-[#1D2C31]">{item.title}</h4>
                </div>
                <p className="text-sm text-[var(--color-text-muted)]">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-6 sm:p-8 mb-6">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 text-[#1D2C31]">
              <SlidersHorizontal size={18} className="text-[var(--color-primary)]" />
              Slik setter du opp forslag riktig
            </h3>
            <div className="space-y-6">
              {[1, 2, 3, 4, 5].map((num) => {
                const steps = [
                  { title: "Åpne Innstillinger → Forslag", desc: "Her styrer du hele forslagssystemet." },
                  { title: "Velg modus", desc: "Av, Kun dashboard, Balansert eller Proaktiv." },
                  { title: "Juster hyppighet og terskel", desc: "Bruk høyere terskel om du vil ha færre forslag med høyere sikkerhet." },
                  { title: "Lær opp systemet", desc: "Bruk «Bruk», «Ikke nå» eller «Ikke foreslå igjen» for å tilpasse forslagene." },
                  { title: "Tilbakestill ved behov", desc: "Du kan alltid gå tilbake til team-standard fra Innstillinger." },
                ];
                const step = steps[num - 1];
                return (
                  <div key={num} className="flex gap-4">
                    <StepBadge number={num} />
                    <div>
                      <p className="font-semibold text-[var(--color-primary)]">{step.title}</p>
                      <p className="text-sm mt-1 text-[var(--color-text-muted)]">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <InfoBox type="success">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span><span className="font-bold">Tips for ansatte:</span> Start med Balansert modus og terskel på 45–60% for en rolig og presis flyt.</span>
            </span>
          </InfoBox>
          <div className="mt-4">
            <InfoBox type="info">
              <span className="inline-flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span><span className="font-bold">Tips for ledere:</span> Sett team-standard per rolle og bruk KPI-kortet i Innstillinger for å følge treffsikkerhet og spart tid.</span>
              </span>
            </InfoBox>
          </div>
        </section>

        {/* REPORTS */}
        <section className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-white p-6 sm:p-8" data-observe>
          <div className="flex items-center gap-4 mb-10">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8F5EE]">
              <BarChart3 size={24} className="text-[#4E9A6F]" />
            </div>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-[#15343D]">
                Rapporter og analyse
              </h2>
              <p className="text-sm mt-1 text-[var(--color-text-muted)]">
                Gjør tidsdata om til innsikter
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white/95 p-6 sm:p-8 shadow-[0_8px_28px_rgba(22,43,49,0.06)] mb-6">
            <div className="flex gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8F5EE] text-[var(--ig-secondary)]">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-[#1D2C31] mb-2">Fra tall til historier</h3>
                <p className="leading-relaxed text-[var(--color-text-muted)]">
                  Rapporter gjør dataene dine meningsfulle. Du oppdager hvilke prosjekter som forbruker mest tid, hvordan produktiviteten
                  varierer, og hvor muligheter for optimalisering ligger. Rapporter gjør rutinearbeid om til forretnetsforstand.
                </p>
              </div>
            </div>
            <div className="mt-6">
              <WhiskerIllustrationPlaceholder
                title="Data Analytics Journey"
                description="Charts and graphs coming to life, showing productivity insights and trends..."
                src="/illustrations/data-analytics.png"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              {
                icon: CheckCircle2,
                title: 'Sammendrag',
                desc: 'Rask oversikt over totale timer, prosjektfordeling og metrics',
                examples: ['Total timer: 160h', 'Gjennomsnitt/dag: 8h', 'Top prosjekt: Platform'],
              },
              {
                icon: Zap,
                title: 'Detaljert',
                desc: 'Dyp analyse med dag-for-dag sammenbrudd og trender',
                examples: ['Daglig søylegrafikk', 'Prosjektfordeling', 'Trendanalyse'],
              },
              {
                icon: Timer,
                title: 'Analyse',
                desc: 'Visuell presentasjon av mønstre og prediktive innsikter',
                examples: ['Interaktive grafer', 'Mønstertellinger', 'Prediksjoner'],
              },
            ].map((report, idx) => (
              <div key={idx} className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <report.icon className="h-5 w-5 text-[var(--color-primary)]" />
                  <h4 className="font-semibold text-[#1D2C31]">{report.title}</h4>
                </div>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {report.desc}
                </p>
                <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                  <p className="text-xs font-semibold text-[var(--color-primary)] flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Eksempel:
                  </p>
                  <ul className="text-xs mt-2 text-[var(--color-text-muted)]">
                    {report.examples.map((ex, i) => (
                      <li key={i}>✓ {ex}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-6 sm:p-8 mb-6">
            <h3 className="text-lg font-semibold mb-4 text-[#1D2C31] flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Eksempel: Rapport Dashboard
            </h3>
            <ScreenshotPlaceholder title="Rapport Dashboard Skjermbilde" icon={<ClipboardList className="h-6 w-6" />} size="900x320px" src="/screenshots/reports-dashboard.webp" />
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-6 sm:p-8">
            <h3 className="text-lg font-semibold mb-8 text-[#1D2C31]">Slik genererer du din første rapport</h3>
            <ReportGenerationSVG />
            <div className="space-y-6">
              {[1, 2, 3, 4].map((num) => {
                const steps = [
                  { title: 'Gå til Rapporter', desc: 'Åpne Rapporter fra menyen', color: COLORS.secondary },
                  { title: 'Velg periode', desc: 'Denne måneden, forrige måned, eller egendefinert', color: COLORS.secondary },
                  { title: 'Velg rapporttype', desc: 'Sammendrag, Detaljert eller Analyse', color: COLORS.secondary },
                  { title: 'Generer og del', desc: 'Eksporter som PDF, Excel eller CSV', color: COLORS.secondary },
                ];
                const step = steps[num - 1];
                return (
                  <div key={num} className="flex gap-4">
                    <StepBadge number={num} />
                    <div>
                      <p className="font-semibold text-[var(--ig-secondary)]">
                        {step.title}
                      </p>
                      <p className="text-sm mt-1 text-[var(--ig-text-light)]">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <InfoBox type="success">
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
                <span><span className="font-bold text-[var(--color-primary)]">Godkjenningsflyt:</span> Rapporter må ofte godkjennes av
                leder. Du får notifikasjoner når de er behandlet.</span>
              </span>
            </InfoBox>
          </div>
        </section>

        {/* CASE MANAGEMENT */}
        <section className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-section)] p-6 sm:p-8" data-observe>
          <div className="flex items-center gap-4 mb-10">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#F5EFE1]">
              <FileText size={24} className="text-[#8F7E52]" />
            </div>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-[#15343D]">
                Sakshåndtering
              </h2>
              <p className="text-sm mt-1 text-[var(--color-text-muted)]">
                Spor, dokumenter og løs saker systematisk
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white/95 p-6 sm:p-8 shadow-[0_8px_28px_rgba(22,43,49,0.06)] mb-6">
            <div className="flex gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#F5EFE1] text-[#8F7E52]">
                <ScanSearch className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-[#1D2C31] mb-2">Dokumentasjon som gir kraft</h3>
                <p className="leading-relaxed text-[var(--color-text-muted)]">
                  Hver sak forteller en historie fra påbegynnelse til løsning. Detaljert dokumentasjon skaper en kunnskapsbase som hjelper
                  teamet ditt lære, forbedres og ta bedre avgjørelser. Saker er ikke bare poster—de er leksjoner som blir verdifulle for hele
                  organisasjonen.
                </p>
              </div>
            </div>
            <div className="mt-6">
              <WhiskerIllustrationPlaceholder
                title="Documentation & Collaboration"
                description="Team members collaborating, sharing knowledge, and building a robust knowledge base..."
                src="/illustrations/collaboration.png"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-6 sm:p-8">
            <h3 className="text-lg font-semibold mb-8 text-[#1D2C31]">Sakens livssyklus</h3>
            <CaseLifecycleSVG />
            <div className="space-y-6">
              {[
                { icon: Inbox, title: 'Sak opprettet', desc: 'Ny sak med innledende informasjon', colorClass: 'text-[var(--ig-primary)]' },
                { icon: RefreshCcw, title: 'Dokumentasjon', desc: 'Samle bevis og dokumenter funn', colorClass: 'text-[var(--ig-secondary)]' },
                { icon: Eye, title: 'Gjennomgang', desc: 'Venter på ledelse/admin-godkjenning', colorClass: 'text-[#D97706]' },
                { icon: CheckCircle2, title: 'Løsning & lukking', desc: 'Godkjent og lagt til kunnskapsbase', colorClass: 'text-[var(--ig-secondary)]' },
              ].map((stage, idx) => (
                <div key={idx} className="flex gap-6">
                  <div className={`inline-flex h-7 w-7 items-center justify-center ${stage.colorClass}`}>
                    <stage.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className={`font-bold ${stage.colorClass}`}>
                      {idx + 1}. {stage.title}
                    </p>
                    <p className="text-sm mt-1 text-[var(--color-text-muted)]">
                      {stage.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <InfoBox type="warning">
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span><span className="font-bold">Best practice:</span> Dokumenter alltid grundig. Fremtidsteammedlemmer vil takke deg for klare,
                detaljerte saker.</span>
              </span>
            </InfoBox>
          </div>
        </section>

        {/* ADMINISTRATION */}
        <section className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-white p-6 sm:p-8" data-observe>
          <div className="flex items-center gap-4 mb-10">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#F0F5F7]">
              <Settings size={24} className="text-[var(--color-primary)]" />
            </div>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-[#15343D]">
                Administrasjon
              </h2>
              <p className="text-sm mt-1 text-[var(--color-text-muted)]">
                Styr brukere, tilgang og ressurser
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-6 sm:p-8">
              <h3 className="text-lg font-semibold mb-6 text-[#1D2C31]">Saksgodkjenning</h3>
              <div className="space-y-4">
                <InfoBox type="success">
                  <p className="text-sm">
                    <span className="font-semibold">Admin deling</span>
                  </p>
                  <p className="text-xs mt-1 text-[var(--ig-text-light)]">
                    Oversikt over alle innsendte saker som venter gjennomgang
                  </p>
                </InfoBox>

                <InfoBox type="info">
                  <p className="text-sm">
                    <span className="font-semibold">Godkjenn/Avvis</span>
                  </p>
                  <p className="text-xs mt-1 text-[var(--ig-text-light)]">
                    Sett status eller be om revisjon med kommentarer
                  </p>
                </InfoBox>

                <InfoBox type="warning">
                  <p className="text-sm">
                    <span className="font-semibold">Kvalitetssjekk</span>
                  </p>
                  <p className="text-xs mt-1 text-[var(--ig-text-light)]">
                    Sikre konsistens og fullständighet i dokumentasjonen
                  </p>
                </InfoBox>
              </div>
            </div>

            <ScreenshotPlaceholder title="Admin Panel Skjermbilde" icon={<Monitor className="h-6 w-6" />} size="600x240px" src="/screenshots/admin-panel.webp" />
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-6 sm:p-8 mt-5">
            <h3 className="text-lg font-semibold mb-6 text-[#1D2C31]">Tilgangsforespørsel arbeidsflyt</h3>
            <AccessRequestSVG />

            <div className="grid grid-cols-3 gap-4">
              {['Innsendt', 'Vurdert', 'Fullstendig'].map((title, idx) => (
                <div key={idx} className="rounded-xl border border-[var(--color-border)] bg-white/90 p-4 text-center">
                  <p className="font-semibold text-sm mb-2 text-[var(--color-primary)]">
                    {title}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {idx === 0 && 'Bruker sender forespørsel om tilgang'}
                    {idx === 1 && 'Leder gjennomgår og avgjør'}
                    {idx === 2 && 'Bruker får beskjed om resultat'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* BEST PRACTICES */}
        <section className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-section)] p-6 sm:p-8" data-observe>
          <h2 className="text-3xl font-semibold tracking-tight text-[#15343D] mb-8 flex items-center gap-3">
            <Lightbulb className="h-8 w-8 text-[var(--ig-primary)]" />
            Best practices
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { icon: Target, title: 'Vær konsistent', desc: 'Registrer tid daglig. Konsistens skaper ærlige data og bedre innsikter.' },
              { icon: NotebookPen, title: 'Detaljer betyr noe', desc: 'Legg til meningsfulle beskrivelser. Framtidig deg vil takke deg.' },
              { icon: Timer, title: 'Tidsblokker', desc: 'Del dagen inn i fokuserte blokker. Det avslører mønstre bedre.' },
              { icon: ScanSearch, title: 'Gjennomgang', desc: 'Generer ukerapporter. Spot trender tidlig og juster strategi.' },
              { icon: Users, title: 'Samarbeid', desc: 'Del kunnskap gjennom saksmeldinger. Hele teamet vinner.' },
              { icon: BarChart3, title: 'Data først', desc: 'Bruk analyser til å begrunne avgjørelser. Data taler sterkere.' },
            ].map((practice, idx) => (
              <div key={idx} className="rounded-2xl border border-[var(--color-border)] bg-white/95 p-5 shadow-[0_8px_28px_rgba(22,43,49,0.06)]">
                <div className="flex items-start gap-4">
                  <practice.icon className="h-7 w-7 text-[var(--ig-primary)]" />
                  <div>
                    <h4 className="font-semibold text-[#1D2C31]">{practice.title}</h4>
                    <p className="text-sm mt-2 text-[var(--color-text-muted)]">
                      {practice.desc}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-white p-6 sm:p-8" data-observe>
          <h2 className="text-3xl font-semibold tracking-tight text-[#15343D] mb-8 flex items-center gap-3">
            <CircleHelp className="h-8 w-8 text-[var(--ig-primary)]" />
            Ofte stilte spørsmål
          </h2>
          <div className="space-y-4">
            {faqItems.map((item, idx) => (
              <FAQAccordion key={idx} item={item} />
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="tidum-fade-up mt-12 rounded-3xl border border-[#1a5d65] bg-[var(--color-primary)] px-6 py-10 text-white sm:px-8 text-center">
          <h2 className="text-[clamp(28px,4vw,42px)] font-semibold tracking-tight">
            Klar til å mestre din tid?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/85">
            Du har nå alt du trenger for å bruke Tidum effektivt. Start rolig, vær konsistent, og se dine produktivitetsinnsikter vokse.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/kontakt">
              <Button className="h-auto rounded-xl bg-white px-6 py-3 text-[var(--color-primary)] hover:bg-white/90 font-semibold">
                <Sparkles className="mr-2 h-4 w-4" />
                Kom i gang
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/kontakt">
              <Button
                variant="outline"
                className="h-auto rounded-xl border-white/70 px-6 py-3 text-white hover:bg-white/10 font-semibold"
              >
                <Phone className="mr-2 h-4 w-4" />
                Kontakt support
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
        </div>

        {/* ── Footer ── */}
        <footer className="tidum-fade-up mt-10 rounded-3xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,246,0.92))] px-6 py-8 sm:px-8">
          <div className="grid gap-8 md:grid-cols-[1.2fr,0.9fr,1fr]">
            <div>
              <img src={tidumWordmark} alt="Tidum" className="h-10 w-auto" />
              <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--color-text-muted)]">
                Arbeidstidssystem for felt, turnus og norsk dokumentasjonskrav.
              </p>
              <Link href="/kontakt" className="mt-3 inline-block text-sm font-medium text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-hover)]">
                kontakt@tidum.no
              </Link>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#35545B]">Snarveier</p>
              <div className="mt-3 grid gap-2 text-sm">
                <Link href="/" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Forside
                </Link>
                <Link href="/hvorfor" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Hvorfor Tidum?
                </Link>
                <Link href="/personvern" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Personvern
                </Link>
                <Link href="/vilkar" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Vilkår
                </Link>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#35545B]">Trygghet</p>
              <div className="mt-3 grid gap-2">
                {[
                  "Bygget for norsk arbeidsliv",
                  "Personvern først",
                  "Klar for dokumentasjonskrav",
                ].map((item) => (
                  <div key={item} className="inline-flex items-start gap-2 rounded-lg bg-white/75 px-3 py-2 text-sm text-[#2B3C41]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-secondary)]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-text-muted)]">
            <p>© {new Date().getFullYear()} Tidum. Alle rettigheter reservert.</p>
            <p>Enkel registrering. Trygg dokumentasjon. Full oversikt.</p>
          </div>
        </footer>
      </div>
    </main>
  );
};

export default InteractiveGuide;
