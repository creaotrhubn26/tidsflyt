import React, { useEffect, useRef, useState } from 'react';
import { Clock, BarChart3, FileText, Settings, ChevronDown } from 'lucide-react';

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
      className="p-6 rounded-lg bg-gradient-to-r from-[#F9FCFB] to-[#F2FAF8] border border-[#D8E6DF] transition-all hover:border-[#1F6B73]"
      style={{ borderColor: isOpen ? COLORS.primary : '#D8E6DF' }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between font-bold cursor-pointer"
      >
        <span style={{ color: COLORS.textDark }}>{item.question}</span>
        <span
          style={{ color: COLORS.textLight }}
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          ▼
        </span>
      </button>
      {isOpen && (
        <p className="text-sm mt-4" style={{ color: COLORS.textLight }}>
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
      className="rounded-lg p-8 border-2 border-dashed flex items-center justify-center bg-gradient-to-br from-[#E6F2EE] to-[#DDE9E5]"
      style={{ borderColor: '#D8E6DF', height: '280px' }}
    >
      <div className="text-center">
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>{emoji}</div>
        <p className="font-semibold mb-2" style={{ color: COLORS.primary }}>
          {title}
        </p>
        <p className="text-sm" style={{ color: COLORS.textLight }}>
          Skjermbilde vil vises her etter konfigurering
        </p>
        <p className="text-xs mt-3" style={{ color: '#95A3A6' }}>
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
    className="rounded-lg p-8 border-2 border-dashed flex items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100"
    style={{
      borderColor: '#C084FC',
      minHeight: '300px',
      backgroundColor: 'rgba(196, 132, 252, 0.08)',
    }}
  >
    <div className="text-center">
      <div style={{ fontSize: '56px', marginBottom: '16px' }}>🎨</div>
      <p className="font-semibold mb-2" style={{ color: '#9333EA' }}>
        {title}
      </p>
      <p className="text-sm max-w-xs" style={{ color: '#7E22CE' }}>
        {description}
      </p>
      <p className="text-xs mt-4 px-3 py-1 bg-white rounded-full inline-block" style={{ color: '#C084FC' }}>
        🤖 Whisker illustration - upload here
      </p>
    </div>
  </div>
);
  <div
    className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-lg text-white flex-shrink-0"
    style={{
      background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
    }}
  >
    {number}
  </div>
);

const SectionDivider: React.FC = () => (
  <div
    className="h-px bg-gradient-to-r from-transparent via-[#D5DDD9] to-transparent my-10"
  />
);

const InfoBox: React.FC<{ children: React.ReactNode; type?: 'success' | 'info' | 'warning' }> = ({
  children,
  type = 'info',
}) => {
  const styles = {
    success: {
      bg: '#E7F3EE',
      border: '#4E9A6F',
      text: '#2A6452',
    },
    info: {
      bg: '#F0F5F7',
      border: COLORS.primary,
      text: COLORS.textDark,
    },
    warning: {
      bg: '#FEF3E6',
      border: '#D97706',
      text: '#92400E',
    },
  };

  const style = styles[type];

  return (
    <div
      className="border-l-4 p-4 rounded"
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
        color: style.text,
      }}
    >
      {children}
    </div>
  );
};

const WorkflowSVG: React.FC = () => (
  <svg viewBox="0 0 800 200" className="w-full h-auto" style={{ maxHeight: '200px' }}>
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
  <svg viewBox="0 0 900 150" className="w-full h-auto mb-6" style={{ maxHeight: '150px' }}>
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
  <svg viewBox="0 0 900 180" className="w-full h-auto mb-8" style={{ maxHeight: '180px' }}>
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
  <svg viewBox="0 0 900 140" className="w-full h-auto mb-6" style={{ maxHeight: '140px' }}>
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
    <div style={{ backgroundColor: '#F9FCFB', minHeight: '100vh' }}>
      {/* Navigation */}
      <nav
        className="sticky top-0 z-50 border-b backdrop-blur-sm bg-white/80"
        style={{ borderColor: COLORS.border }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/favicon-32x32.png" alt="Tidum" className="h-8 w-8 rounded-lg" />
            <div>
              <h1 className="text-lg font-bold" style={{ color: COLORS.textDark }}>
                Tidum Veiledning
              </h1>
              <p className="text-xs" style={{ color: COLORS.textLight }}>
                Lær til å bruke plattformen effektivt
              </p>
            </div>
          </div>
          <div className="text-sm" style={{ color: COLORS.textLight }}>
            📖 Interaktiv guide
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="pt-16 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2
            className="text-5xl font-bold mb-6"
            style={{
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Velkommen til Tidum
          </h2>
          <p className="text-xl mb-8 leading-relaxed" style={{ color: COLORS.textLight }}>
            Behersk kunsten med <span style={{ color: COLORS.primary, fontWeight: '600' }}>intelligent arbeidstidsregistrering</span>.
            Registrer, analyser og optimaliser hver time av din profesjonelle reise med Tidums omfattende plattform.
          </p>
          <InfoBox type="info">
            📖 Denne interaktive veiledningen tar deg gjennom alle funksjoner med historier, eksempler og reelle arbeitsflyter.
          </InfoBox>
        </div>
        <SectionDivider />
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 pb-20">
        {/* TIME REGISTRATION */}
        <div className="mb-20" data-observe>
          <div className="flex items-center gap-4 mb-12">
            <div
              className="w-14 h-14 rounded-2xl border flex items-center justify-center"
              style={{ backgroundColor: '#E7F3EE', borderColor: '#D8E6DF', color: '#3A8B73', fontSize: '24px' }}
            >
              <Clock size={24} />
            </div>
            <div>
              <h2
                className="text-3xl font-bold"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                ⏱️ Registrer Din Tid
              </h2>
              <p className="text-sm mt-2" style={{ color: COLORS.textLight }}>
                Din profesjonelle dagbok starter her
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 border border-[#D5DDD9] mb-8 shadow-sm">
            <div className="flex gap-4">
              <div style={{ fontSize: '48px' }}>🌅</div>
              <div>
                <h3 className="text-xl font-bold mb-2">Din første dag med Tidum</h3>
                <p className="leading-relaxed" style={{ color: COLORS.textLight }}>
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

          <div
            className="bg-white rounded-2xl p-8 border border-[#D8E6DF] bg-gradient-to-r from-[#F9FCFB] to-[#F2FAF8] mb-8"
          >
            <h3 className="font-bold mb-6" style={{ color: COLORS.primary }}>
              📸 Arbeitsflyt for tidsregistrering
            </h3>
            <WorkflowSVG />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="bg-white rounded-2xl p-8 border border-[#D8E6DF] bg-gradient-to-r from-[#F9FCFB] to-[#F2FAF8]">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2" style={{ color: COLORS.textDark }}>
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
                        <p className="font-semibold" style={{ color: COLORS.primary }}>
                          {step.title}
                        </p>
                        <p className="text-sm mt-1" style={{ color: COLORS.textLight }}>
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
        </div>

        <SectionDivider />

        {/* REPORTS */}
        <div className="mb-20" data-observe>
          <div className="flex items-center gap-4 mb-12">
            <div
              className="w-14 h-14 rounded-2xl border flex items-center justify-center"
              style={{ backgroundColor: '#E8F5EE', borderColor: '#D8E6DF', color: '#4E9A6F', fontSize: '24px' }}
            >
              <BarChart3 size={24} />
            </div>
            <div>
              <h2
                className="text-3xl font-bold"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                📊 Rapporter & Analyse
              </h2>
              <p className="text-sm mt-2" style={{ color: COLORS.textLight }}>
                Gjør tidsdata om til innsikter
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 border border-[#D5DDD9] mb-8 shadow-sm">
            <div className="flex gap-4">
              <div style={{ fontSize: '48px' }}>📈</div>
              <div>
                <h3 className="text-xl font-bold mb-2">Fra tall til historier</h3>
                <p className="leading-relaxed" style={{ color: COLORS.textLight }}>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
              <div key={idx} className="bg-white rounded-2xl p-6 border border-[#D8E6DF] bg-gradient-to-r from-[#F9FCFB] to-[#F2FAF8]">
                <div className="flex items-center gap-3 mb-4">
                  <span style={{ color: COLORS.primary, fontSize: '20px' }}>{report.icon}</span>
                  <h4 className="font-bold">{report.title}</h4>
                </div>
                <p className="text-sm" style={{ color: COLORS.textLight }}>
                  {report.desc}
                </p>
                <div className="mt-4 pt-4 border-t border-[#D8E6DF]">
                  <p className="text-xs font-semibold" style={{ color: COLORS.primary }}>
                    📊 Eksempel:
                  </p>
                  <ul className="text-xs mt-2" style={{ color: COLORS.textLight }}>
                    {report.examples.map((ex, i) => (
                      <li key={i}>✓ {ex}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl p-8 border border-[#D8E6DF] bg-gradient-to-r from-[#F9FCFB] to-[#F2FAF8] mb-8">
            <h3 className="text-lg font-bold mb-4">📸 Eksempel: Rapport Dashboard</h3>
            <ScreenshotPlaceholder title="Rapport Dashboard Skjermbilde" emoji="📋" size="900x320px" src="/screenshots/reports-dashboard.webp" />
          </div>

          <div className="bg-white rounded-2xl p-8 border border-[#D8E6DF] bg-gradient-to-r from-[#F9FCFB] to-[#F2FAF8]">
            <h3 className="text-lg font-bold mb-8">Slik genererer du din første rapport</h3>
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
                      <p className="font-semibold" style={{ color: step.color }}>
                        {step.title}
                      </p>
                      <p className="text-sm mt-1" style={{ color: COLORS.textLight }}>
                        {step.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <InfoBox type="success">
              ✨ <span className="font-bold" style={{ color: COLORS.primary }}>Godkjenningsflyt:</span> Rapporter må ofte godkjennes av
              leder. Du får notifikasjoner når de er behandlet.
            </InfoBox>
          </div>
        </div>

        <SectionDivider />

        {/* CASE MANAGEMENT */}
        <div className="mb-20" data-observe>
          <div className="flex items-center gap-4 mb-12">
            <div
              className="w-14 h-14 rounded-2xl border flex items-center justify-center"
              style={{ backgroundColor: '#F5EFE1', borderColor: '#D8E6DF', color: '#8F7E52', fontSize: '24px' }}
            >
              <FileText size={24} />
            </div>
            <div>
              <h2
                className="text-3xl font-bold"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                📋 Sakshåndtering
              </h2>
              <p className="text-sm mt-2" style={{ color: COLORS.textLight }}>
                Spor, dokumenter og løs saker systematisk
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 border border-[#D5DDD9] mb-8 shadow-sm">
            <div className="flex gap-4">
              <div style={{ fontSize: '48px' }}>🔍</div>
              <div>
                <h3 className="text-xl font-bold mb-2">Dokumentasjon som gir kraft</h3>
                <p className="leading-relaxed" style={{ color: COLORS.textLight }}>
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

          <div className="bg-white rounded-2xl p-8 border border-[#D8E6DF] bg-gradient-to-r from-[#F9FCFB] to-[#F2FAF8]">
            <h3 className="text-lg font-bold mb-8">Sakens livssyklus</h3>
            <CaseLifecycleSVG />
            <div className="space-y-6">
              {[
                { emoji: '📥', title: 'Sak opprettet', desc: 'Ny sak med innledende informasjon', color: COLORS.primary },
                { emoji: '🔄', title: 'Dokumentasjon', desc: 'Samle bevis og dokumenter funn', color: COLORS.secondary },
                { emoji: '👀', title: 'Gjennomgang', desc: 'Venter på ledelse/admin-godkjenning', color: '#D97706' },
                { emoji: '✅', title: 'Løsning & lukking', desc: 'Godkjent og lagt til kunnskapsbase', color: COLORS.secondary },
              ].map((stage, idx) => (
                <div key={idx} className="flex gap-6">
                  <div className="text-2xl">{stage.emoji}</div>
                  <div className="flex-1">
                    <p className="font-bold" style={{ color: stage.color }}>
                      {idx + 1}. {stage.title}
                    </p>
                    <p className="text-sm mt-1" style={{ color: COLORS.textLight }}>
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
        </div>

        <SectionDivider />

        {/* ADMINISTRATION */}
        <div className="mb-20" data-observe>
          <div className="flex items-center gap-4 mb-12">
            <div
              className="w-14 h-14 rounded-2xl border flex items-center justify-center"
              style={{ backgroundColor: '#F0F5F7', borderColor: '#D8E6DF', color: COLORS.primary, fontSize: '24px' }}
            >
              <Settings size={24} />
            </div>
            <div>
              <h2
                className="text-3xl font-bold"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                ⚙️ Administrasjon
              </h2>
              <p className="text-sm mt-2" style={{ color: COLORS.textLight }}>
                Styr brukere, tilgang og ressurser
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-8 border border-[#D8E6DF] bg-gradient-to-r from-[#F9FCFB] to-[#F2FAF8]">
              <h3 className="text-lg font-bold mb-6">Saksgodkjenning</h3>
              <div className="space-y-4">
                <InfoBox type="success">
                  <p className="text-sm">
                    <span className="font-semibold">Admin deling</span>
                  </p>
                  <p className="text-xs mt-1" style={{ color: COLORS.textLight }}>
                    Oversikt over alle innsendte saker som venter gjennomgang
                  </p>
                </InfoBox>

                <InfoBox type="info">
                  <p className="text-sm">
                    <span className="font-semibold">Godkjenn/Avvis</span>
                  </p>
                  <p className="text-xs mt-1" style={{ color: COLORS.textLight }}>
                    Sett status eller be om revisjon med kommentarer
                  </p>
                </InfoBox>

                <InfoBox type="warning">
                  <p className="text-sm">
                    <span className="font-semibold">Kvalitetssjekk</span>
                  </p>
                  <p className="text-xs mt-1" style={{ color: COLORS.textLight }}>
                    Sikre konsistens og fullständighet i dokumentasjonen
                  </p>
                </InfoBox>
              </div>
            </div>

            <ScreenshotPlaceholder title="Admin Panel Skjermbilde" emoji="🖥️" size="600x240px" src="/screenshots/admin-panel.webp" />
          </div>

          <div className="bg-white rounded-2xl p-8 border border-[#D8E6DF] bg-gradient-to-r from-[#F9FCFB] to-[#F2FAF8] mt-8">
            <h3 className="text-lg font-bold mb-6">Tilgangsforespørsel arbeidsflyt</h3>
            <AccessRequestSVG />

            <div className="grid grid-cols-3 gap-4">
              {['Innsendt', 'Vurdert', 'Fullstendig'].map((title, idx) => (
                <div key={idx} className="bg-white rounded-2xl p-4 border border-[#D8E6DF] text-center">
                  <p className="font-semibold text-sm mb-2" style={{ color: COLORS.primary }}>
                    {title}
                  </p>
                  <p className="text-xs" style={{ color: COLORS.textLight }}>
                    {idx === 0 && 'Bruker sender forespørsel om tilgang'}
                    {idx === 1 && 'Leder gjennomgår og avgjør'}
                    {idx === 2 && 'Bruker får beskjed om resultat'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <SectionDivider />

        {/* BEST PRACTICES */}
        <div className="mb-20" data-observe>
          <h2
            className="text-3xl font-bold mb-12"
            style={{
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            💡 Best Practices
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { emoji: '🎯', title: 'Vær konsistent', desc: 'Registrer tid daglig. Konsistens skaper ærlige data og bedre innsikter.' },
              { emoji: '📝', title: 'Detaljer betyr noe', desc: 'Legg til meningsfulle beskrivelser. Framtidig deg vil takke deg.' },
              { emoji: '⏰', title: 'Tidsblokker', desc: 'Del dagen inn i fokuserte blokker. Det avslører mønstre bedre.' },
              { emoji: '🔍', title: 'Gjennomgang', desc: 'Generer ukerapporter. Spot trender tidlig og juster strategi.' },
              { emoji: '🤝', title: 'Samarbeid', desc: 'Del kunnskap gjennom saksmeldinger. Hele teamet vinner.' },
              { emoji: '📊', title: 'Data først', desc: 'Bruk analyser til å begrunne avgjørelser. Data taler sterkere.' },
            ].map((practice, idx) => (
              <div key={idx} className="bg-white rounded-2xl p-6 border border-[#D8E6DF] bg-gradient-to-r from-[#F9FCFB] to-[#F2FAF8]">
                <div className="flex items-start gap-4">
                  <span style={{ fontSize: '28px' }}>{practice.emoji}</span>
                  <div>
                    <h4 className="font-bold">{practice.title}</h4>
                    <p className="text-sm mt-2" style={{ color: COLORS.textLight }}>
                      {practice.desc}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <SectionDivider />

        {/* FAQ */}
        <div className="mb-20" data-observe>
          <h2
            className="text-3xl font-bold mb-12"
            style={{
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            ❓ Ofte Stilte Spørsmål
          </h2>
          <div className="space-y-4">
            {faqItems.map((item, idx) => (
              <FAQAccordion key={idx} item={item} />
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="bg-white rounded-2xl p-12 border border-[#D8E6DF] bg-gradient-to-r from-[#F9FCFB] to-[#F2FAF8] text-center mb-8">
          <h2
            className="text-3xl font-bold mb-6"
            style={{
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Klar til å mestre din tid?
          </h2>
          <p className="text-lg mb-8" style={{ color: COLORS.textLight }}>
            Du har nå alt du trenger for å bruke Tidum effektivt. Start rolig, vær konsistent, og se dine produktivitetsinnsikter vokse.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              className="px-8 py-3 rounded-lg text-white font-bold hover:shadow-lg transform hover:scale-105 transition"
              style={{ background: `linear-gradient(to right, ${COLORS.primary}, ${COLORS.secondary})` }}
            >
              🚀 Kom i gang
            </button>
            <button
              className="px-8 py-3 rounded-lg font-bold hover:text-white transition"
              style={{
                border: `2px solid ${COLORS.primary}`,
                color: COLORS.primary,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = COLORS.primary;
                e.currentTarget.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = COLORS.primary;
              }}
            >
              📞 Kontakt support
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#D5DDD9] backdrop-blur-md mt-20">
        <div className="max-w-7xl mx-auto px-6 py-12 text-center" style={{ color: COLORS.textLight }}>
          <p>© 2024-2026 Tidum Plattform. Alle rettigheter forbeholdt.</p>
          <p className="mt-2">Spørsmål? Sjekk dokumentasjonen eller kontakt support@tidum.com</p>
          <div className="flex justify-center gap-6 mt-6">
            {['Dokumentasjon', 'API', 'Support', 'Fellesskap'].map((link) => (
              <a
                key={link}
                href="#"
                style={{ color: COLORS.textLight }}
                className="hover:text-[#1F6B73] transition"
              >
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default InteractiveGuide;
