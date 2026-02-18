import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Clock, BarChart3, FileText, Settings, ArrowRight, ChevronRight, CheckCircle2 } from 'lucide-react';
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
  emoji: string;
  size: string;
  src?: string;
}> = ({ title, emoji, size, src }) => {
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
        <div className="ig-emoji-lg mb-3">{emoji}</div>
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
}> = ({ title, description }) => (
  <div
    className="rounded-lg p-8 border-2 border-dashed border-[#C084FC] min-h-[300px] bg-[rgba(196,132,252,0.08)] flex items-center justify-center"
  >
    <div className="text-center">
      <div className="ig-emoji-xl">🎨</div>
      <p className="font-semibold mb-2 text-[#9333EA]">
        {title}
      </p>
      <p className="text-sm max-w-xs text-[#7E22CE]">
        {description}
      </p>
      <p className="text-xs mt-4 px-3 py-1 bg-white rounded-full inline-block text-[#C084FC]">
        🤖 Whisker illustration - upload here
      </p>
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

const WorkflowSVG: React.FC = () => (
  <svg viewBox="0 0 800 200" className="w-full h-auto max-h-[200px]">
    {/* Step 1 */}
    <rect x="20" y="40" width="140" height="120" rx="8" fill="#E7F3EE" stroke="#D8E6DF" strokeWidth="2" />
    <text x="90" y="85" textAnchor="middle" fontSize="24">
      👋
    </text>
    <text x="90" y="120" textAnchor="middle" fontSize="12" fontWeight="bold" fill={COLORS.textDark}>
      Klikk Start
    </text>
    <text x="90" y="145" textAnchor="middle" fontSize="10" fill={COLORS.textLight}>
      Begynn arbeid
    </text>

    {/* Arrow 1 */}
    <path d="M 170 100 L 200 100" stroke={COLORS.primary} strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />

    {/* Step 2 */}
    <rect x="210" y="40" width="140" height="120" rx="8" fill="#F0F5F7" stroke="#D8E6DF" strokeWidth="2" />
    <text x="280" y="85" textAnchor="middle" fontSize="24">
      🎯
    </text>
    <text x="280" y="120" textAnchor="middle" fontSize="12" fontWeight="bold" fill={COLORS.textDark}>
      Velg Prosjekt
    </text>
    <text x="280" y="145" textAnchor="middle" fontSize="10" fill={COLORS.textLight}>
      Tildel oppgave
    </text>

    {/* Arrow 2 */}
    <path d="M 360 100 L 390 100" stroke={COLORS.primary} strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />

    {/* Step 3 */}
    <rect x="400" y="40" width="140" height="120" rx="8" fill="#F5EFE1" stroke="#D8E6DF" strokeWidth="2" />
    <text x="470" y="85" textAnchor="middle" fontSize="24">
      📝
    </text>
    <text x="470" y="120" textAnchor="middle" fontSize="12" fontWeight="bold" fill={COLORS.textDark}>
      Legg til detaljer
    </text>
    <text x="470" y="145" textAnchor="middle" fontSize="10" fill={COLORS.textLight}>
      Beskriv arbeid
    </text>

    {/* Arrow 3 */}
    <path d="M 550 100 L 580 100" stroke={COLORS.primary} strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />

    {/* Step 4 */}
    <rect x="590" y="40" width="140" height="120" rx="8" fill="#E8F5EE" stroke="#D8E6DF" strokeWidth="2" />
    <text x="660" y="85" textAnchor="middle" fontSize="24">
      ✅
    </text>
    <text x="660" y="120" textAnchor="middle" fontSize="12" fontWeight="bold" fill={COLORS.textDark}>
      Lagre
    </text>
    <text x="660" y="145" textAnchor="middle" fontSize="10" fill={COLORS.textLight}>
      Fullstendig
    </text>

    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
        <polygon points="0 0, 10 5, 0 10" fill={COLORS.primary} />
      </marker>
    </defs>
  </svg>
);

const ReportGenerationSVG: React.FC = () => (
  <svg viewBox="0 0 900 150" className="w-full h-auto mb-6 max-h-[150px]">
    <circle cx="60" cy="75" r="35" fill="#E7F3EE" stroke={COLORS.primary} strokeWidth="2" />
    <text x="60" y="85" textAnchor="middle" fontSize="24">
      📊
    </text>
    <text x="60" y="120" textAnchor="middle" fontSize="11" fontWeight="bold" fill={COLORS.textDark}>
      Åpne Rapporter
    </text>

    <path d="M 100 75 L 140 75" stroke={COLORS.secondary} strokeWidth="3" fill="none" markerEnd="url(#arrowhead2)" />

    <circle cx="190" cy="75" r="35" fill="#F0F5F7" stroke={COLORS.primary} strokeWidth="2" />
    <text x="190" y="85" textAnchor="middle" fontSize="24">
      📅
    </text>
    <text x="190" y="120" textAnchor="middle" fontSize="11" fontWeight="bold" fill={COLORS.textDark}>
      Velg periode
    </text>

    <path d="M 230 75 L 270 75" stroke={COLORS.secondary} strokeWidth="3" fill="none" markerEnd="url(#arrowhead2)" />

    <circle cx="320" cy="75" r="35" fill="#F5EFE1" stroke={COLORS.primary} strokeWidth="2" />
    <text x="320" y="85" textAnchor="middle" fontSize="24">
      🎯
    </text>
    <text x="320" y="120" textAnchor="middle" fontSize="11" fontWeight="bold" fill={COLORS.textDark}>
      Rapporttype
    </text>

    <path d="M 360 75 L 400 75" stroke={COLORS.secondary} strokeWidth="3" fill="none" markerEnd="url(#arrowhead2)" />

    <circle cx="450" cy="75" r="35" fill="#E8F5EE" stroke={COLORS.primary} strokeWidth="2" />
    <text x="450" y="85" textAnchor="middle" fontSize="24">
      ✨
    </text>
    <text x="450" y="120" textAnchor="middle" fontSize="11" fontWeight="bold" fill={COLORS.textDark}>
      Generer
    </text>

    <path d="M 490 75 L 530 75" stroke={COLORS.secondary} strokeWidth="3" fill="none" markerEnd="url(#arrowhead2)" />

    <circle cx="580" cy="75" r="35" fill="#E7F3EE" stroke={COLORS.primary} strokeWidth="2" />
    <text x="580" y="85" textAnchor="middle" fontSize="24">
      📥
    </text>
    <text x="580" y="120" textAnchor="middle" fontSize="11" fontWeight="bold" fill={COLORS.textDark}>
      Eksporter
    </text>

    <defs>
      <marker id="arrowhead2" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
        <polygon points="0 0, 10 5, 0 10" fill={COLORS.secondary} />
      </marker>
    </defs>
  </svg>
);

const CaseLifecycleSVG: React.FC = () => (
  <svg viewBox="0 0 900 180" className="w-full h-auto mb-8 max-h-[180px]">
    {/* Timeline */}
    <line x1="50" y1="90" x2="850" y2="90" stroke="#D8E6DF" strokeWidth="3" />

    {/* Stage 1 */}
    <circle cx="100" cy="90" r="30" fill="#E7F3EE" stroke={COLORS.primary} strokeWidth="3" />
    <text x="100" y="100" textAnchor="middle" fontSize="28">
      📥
    </text>
    <text x="100" y="135" textAnchor="middle" fontSize="12" fontWeight="bold" fill={COLORS.textDark}>
      Opprettet
    </text>
    <text x="100" y="155" textAnchor="middle" fontSize="10" fill={COLORS.textLight}>
      Innledende info
    </text>

    {/* Stage 2 */}
    <circle cx="300" cy="90" r="30" fill="#F0F5F7" stroke={COLORS.primary} strokeWidth="3" />
    <text x="300" y="100" textAnchor="middle" fontSize="28">
      🔄
    </text>
    <text x="300" y="135" textAnchor="middle" fontSize="12" fontWeight="bold" fill={COLORS.textDark}>
      Dokumentasjon
    </text>
    <text x="300" y="155" textAnchor="middle" fontSize="10" fill={COLORS.textLight}>
      Samle bevis
    </text>

    {/* Stage 3 */}
    <circle cx="500" cy="90" r="30" fill="#F5EFE1" stroke={COLORS.primary} strokeWidth="3" />
    <text x="500" y="100" textAnchor="middle" fontSize="28">
      👀
    </text>
    <text x="500" y="135" textAnchor="middle" fontSize="12" fontWeight="bold" fill={COLORS.textDark}>
      Gjennomgang
    </text>
    <text x="500" y="155" textAnchor="middle" fontSize="10" fill={COLORS.textLight}>
      Venter godkjenning
    </text>

    {/* Stage 4 */}
    <circle cx="700" cy="90" r="30" fill="#E8F5EE" stroke={COLORS.primary} strokeWidth="3" />
    <text x="700" y="100" textAnchor="middle" fontSize="28">
      ✅
    </text>
    <text x="700" y="135" textAnchor="middle" fontSize="12" fontWeight="bold" fill={COLORS.textDark}>
      Godkjent
    </text>
    <text x="700" y="155" textAnchor="middle" fontSize="10" fill={COLORS.textLight}>
      Bekreftet
    </text>
  </svg>
);

const AccessRequestSVG: React.FC = () => (
  <svg viewBox="0 0 900 140" className="w-full h-auto mb-6 max-h-[140px]">
    {/* Request */}
    <rect x="20" y="30" width="120" height="80" rx="8" fill="#E7F3EE" stroke={COLORS.primary} strokeWidth="2" />
    <text x="80" y="60" textAnchor="middle" fontSize="20">
      📝
    </text>
    <text x="80" y="85" textAnchor="middle" fontSize="11" fontWeight="bold" fill={COLORS.textDark}>
      Forespørsel
    </text>
    <text x="80" y="100" textAnchor="middle" fontSize="9" fill={COLORS.textLight}>
      Innsendt av bruker
    </text>

    {/* Arrow */}
    <path d="M 150 70 L 190 70" stroke={COLORS.primary} strokeWidth="3" fill="none" markerEnd="url(#arrowhead3)" />

    {/* Review */}
    <rect x="200" y="30" width="120" height="80" rx="8" fill="#F0F5F7" stroke={COLORS.primary} strokeWidth="2" />
    <text x="260" y="60" textAnchor="middle" fontSize="20">
      👀
    </text>
    <text x="260" y="85" textAnchor="middle" fontSize="11" fontWeight="bold" fill={COLORS.textDark}>
      Gjennomgang
    </text>
    <text x="260" y="100" textAnchor="middle" fontSize="9" fill={COLORS.textLight}>
      Leder vurderer
    </text>

    {/* Arrow */}
    <path d="M 330 70 L 370 70" stroke={COLORS.primary} strokeWidth="3" fill="none" markerEnd="url(#arrowhead3)" />

    {/* Decision */}
    <rect x="380" y="30" width="120" height="80" rx="8" fill="#F5EFE1" stroke={COLORS.primary} strokeWidth="2" />
    <text x="440" y="60" textAnchor="middle" fontSize="20">
      ⚖️
    </text>
    <text x="440" y="85" textAnchor="middle" fontSize="11" fontWeight="bold" fill={COLORS.textDark}>
      Avgjøring
    </text>
    <text x="440" y="100" textAnchor="middle" fontSize="9" fill={COLORS.textLight}>
      Godkjent/Avvist
    </text>

    {/* Arrow to Approved */}
    <path d="M 500 55 L 540 55" stroke={COLORS.secondary} strokeWidth="3" fill="none" markerEnd="url(#arrowhead4)" />
    {/* Arrow to Denied */}
    <path d="M 500 85 L 540 85" stroke="#D97706" strokeWidth="3" fill="none" markerEnd="url(#arrowhead5)" />

    {/* Approved */}
    <rect x="550" y="30" width="120" height="40" rx="8" fill="#E8F5EE" stroke={COLORS.secondary} strokeWidth="2" />
    <text x="610" y="45" textAnchor="middle" fontSize="20">
      ✅
    </text>
    <text x="610" y="65" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#2A6452">
      Godkjent
    </text>

    {/* Denied */}
    <rect x="550" y="80" width="120" height="40" rx="8" fill="#FEF3E6" stroke="#D97706" strokeWidth="2" />
    <text x="610" y="95" textAnchor="middle" fontSize="20">
      ❌
    </text>
    <text x="610" y="115" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#92400E">
      Avvist
    </text>

    <defs>
      <marker id="arrowhead3" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
        <polygon points="0 0, 10 5, 0 10" fill={COLORS.primary} />
      </marker>
      <marker id="arrowhead4" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
        <polygon points="0 0, 10 5, 0 10" fill={COLORS.secondary} />
      </marker>
      <marker id="arrowhead5" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
        <polygon points="0 0, 10 5, 0 10" fill="#D97706" />
      </marker>
    </defs>
  </svg>
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
        .ig-emoji-lg { font-size: 48px; }
        .ig-emoji-xl { font-size: 56px; margin-bottom: 16px; }
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
                📖 Denne interaktive veiledningen tar deg gjennom alle funksjoner med historier, eksempler og reelle arbeitsflyter.
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
                ⏱️ Registrer Din Tid
              </h2>
              <p className="text-sm mt-1 text-[var(--color-text-muted)]">
                Din profesjonelle dagbok starter her
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white/95 p-6 sm:p-8 shadow-[0_8px_28px_rgba(22,43,49,0.06)] mb-6">
            <div className="flex gap-4">
              <div className="ig-emoji-lg">🌅</div>
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
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-6 sm:p-8 mb-6">
            <h3 className="font-semibold mb-6 text-[var(--color-primary)]">
              📸 Arbeitsflyt for tidsregistrering
            </h3>
            <WorkflowSVG />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-6 sm:p-8">
              <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 text-[#1D2C31]">
                <span>➕</span> Opprett tidsføring i 4 steg
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

            <ScreenshotPlaceholder title="Tidsregistrering Skjermbilde" emoji="📱" size="480x360px" src="/screenshots/time-tracking.webp" />
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
                📊 Rapporter & Analyse
              </h2>
              <p className="text-sm mt-1 text-[var(--color-text-muted)]">
                Gjør tidsdata om til innsikter
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white/95 p-6 sm:p-8 shadow-[0_8px_28px_rgba(22,43,49,0.06)] mb-6">
            <div className="flex gap-4">
              <div className="ig-emoji-lg">📈</div>
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
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              {
                icon: '✓',
                title: 'Sammendrag',
                desc: 'Rask oversikt over totale timer, prosjektfordeling og metrics',
                examples: ['Total timer: 160h', 'Gjennomsnitt/dag: 8h', 'Top prosjekt: Platform'],
              },
              {
                icon: '⚡',
                title: 'Detaljert',
                desc: 'Dyp analyse med dag-for-dag sammenbrudd og trender',
                examples: ['Daglig søylegrafikk', 'Prosjektfordeling', 'Trendanalyse'],
              },
              {
                icon: '🕐',
                title: 'Analyse',
                desc: 'Visuell presentasjon av mønstre og prediktive innsikter',
                examples: ['Interaktive grafer', 'Mønstertellinger', 'Prediksjoner'],
              },
            ].map((report, idx) => (
              <div key={idx} className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-[var(--color-primary)] text-xl">{report.icon}</span>
                  <h4 className="font-semibold text-[#1D2C31]">{report.title}</h4>
                </div>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {report.desc}
                </p>
                <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                  <p className="text-xs font-semibold text-[var(--color-primary)]">
                    📊 Eksempel:
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
            <h3 className="text-lg font-semibold mb-4 text-[#1D2C31]">📸 Eksempel: Rapport Dashboard</h3>
            <ScreenshotPlaceholder title="Rapport Dashboard Skjermbilde" emoji="📋" size="900x320px" src="/screenshots/reports-dashboard.webp" />
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
              ✨ <span className="font-bold text-[var(--color-primary)]">Godkjenningsflyt:</span> Rapporter må ofte godkjennes av
              leder. Du får notifikasjoner når de er behandlet.
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
                📋 Sakshåndtering
              </h2>
              <p className="text-sm mt-1 text-[var(--color-text-muted)]">
                Spor, dokumenter og løs saker systematisk
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white/95 p-6 sm:p-8 shadow-[0_8px_28px_rgba(22,43,49,0.06)] mb-6">
            <div className="flex gap-4">
              <div className="ig-emoji-lg">🔍</div>
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
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-6 sm:p-8">
            <h3 className="text-lg font-semibold mb-8 text-[#1D2C31]">Sakens livssyklus</h3>
            <CaseLifecycleSVG />
            <div className="space-y-6">
              {[
                { emoji: '📥', title: 'Sak opprettet', desc: 'Ny sak med innledende informasjon', colorClass: 'text-[var(--ig-primary)]' },
                { emoji: '🔄', title: 'Dokumentasjon', desc: 'Samle bevis og dokumenter funn', colorClass: 'text-[var(--ig-secondary)]' },
                { emoji: '👀', title: 'Gjennomgang', desc: 'Venter på ledelse/admin-godkjenning', colorClass: 'text-[#D97706]' },
                { emoji: '✅', title: 'Løsning & lukking', desc: 'Godkjent og lagt til kunnskapsbase', colorClass: 'text-[var(--ig-secondary)]' },
              ].map((stage, idx) => (
                <div key={idx} className="flex gap-6">
                  <div className="text-2xl">{stage.emoji}</div>
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
              ⚠️ <span className="font-bold">Best practice:</span> Dokumenter alltid grundig. Fremtidsteammedlemmer vil takke deg for klare,
              detaljerte saker.
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
                ⚙️ Administrasjon
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

            <ScreenshotPlaceholder title="Admin Panel Skjermbilde" emoji="🖥️" size="600x240px" src="/screenshots/admin-panel.webp" />
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
          <h2 className="text-3xl font-semibold tracking-tight text-[#15343D] mb-8">
            💡 Best Practices
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { emoji: '🎯', title: 'Vær konsistent', desc: 'Registrer tid daglig. Konsistens skaper ærlige data og bedre innsikter.' },
              { emoji: '📝', title: 'Detaljer betyr noe', desc: 'Legg til meningsfulle beskrivelser. Framtidig deg vil takke deg.' },
              { emoji: '⏰', title: 'Tidsblokker', desc: 'Del dagen inn i fokuserte blokker. Det avslører mønstre bedre.' },
              { emoji: '🔍', title: 'Gjennomgang', desc: 'Generer ukerapporter. Spot trender tidlig og juster strategi.' },
              { emoji: '🤝', title: 'Samarbeid', desc: 'Del kunnskap gjennom saksmeldinger. Hele teamet vinner.' },
              { emoji: '📊', title: 'Data først', desc: 'Bruk analyser til å begrunne avgjørelser. Data taler sterkere.' },
            ].map((practice, idx) => (
              <div key={idx} className="rounded-2xl border border-[var(--color-border)] bg-white/95 p-5 shadow-[0_8px_28px_rgba(22,43,49,0.06)]">
                <div className="flex items-start gap-4">
                  <span className="text-[28px]">{practice.emoji}</span>
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
          <h2 className="text-3xl font-semibold tracking-tight text-[#15343D] mb-8">
            ❓ Ofte Stilte Spørsmål
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
                🚀 Kom i gang
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/kontakt">
              <Button
                variant="outline"
                className="h-auto rounded-xl border-white/70 px-6 py-3 text-white hover:bg-white/10 font-semibold"
              >
                📞 Kontakt support
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
