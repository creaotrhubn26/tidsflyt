import { useLocation } from "wouter";
import { useSEO } from "@/hooks/use-seo";
import {
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Database,
  FileCheck2,
  FileSpreadsheet,
  MapPin,
  Search,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { tidumPageStyles } from "@/lib/tidum-page-styles";
import tidumMockup from "@assets/tidum-mockup.png";
import tidumWordmark from "@assets/tidum-wordmark.png";

function HeroMockup() {
  return (
    <div className="pointer-events-none relative mx-auto w-full max-w-[820px] select-none pt-2" aria-hidden="true">
      <div className="absolute left-[7%] top-[14%] hidden h-52 w-[70%] rounded-[999px] bg-[var(--color-secondary)]/12 blur-3xl md:block" />
      <div className="absolute left-[19%] top-[31%] hidden h-60 w-[63%] rounded-[999px] bg-[var(--color-primary)]/8 blur-3xl md:block" />

      <div className="absolute left-[13.5%] top-[26.4%] z-10 hidden h-[41.75%] w-[50.17%] overflow-hidden rounded-[8px] bg-[#fbfcfb] md:block">
        <div className="flex items-center justify-between border-b border-[#e6ece9] px-2.5 py-1.5 text-[8.5px] text-[#5f6b6d]">
          <div className="flex items-center gap-1.5">
            <img src="/favicon-32x32.png" alt="" className="h-2.5 w-2.5 rounded-full" />
            <span className="font-medium text-[#233136]">Tidum</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Funksjoner</span>
            <span className="rounded-sm bg-[#1F6B73] px-1.5 py-0.5 text-[7.5px] font-medium text-white">Se demo</span>
          </div>
        </div>

        <div className="grid gap-2 p-2.5 grid-cols-[1.35fr,0.95fr]">
          <div className="space-y-2">
            <div>
              <h4 className="text-[12px] font-semibold tracking-tight text-[#1f2f33]">Hei, Maria!</h4>
            </div>
            <div className="rounded-md border border-[#dde5e2] bg-white p-2">
              <div className="flex items-center gap-1.5 text-[#1E2A2C]">
                <Clock3 className="h-3 w-3 text-[#2f8a72]" />
                <p className="text-[7.5px] font-semibold">Registrer tid</p>
              </div>
              <div className="mt-1 flex items-end justify-between">
                <p className="text-[7.5px] font-semibold text-[#1E2A2C]">08:00 - 16:00</p>
                <p className="text-[7px] text-[#5f6b6d]">30 min</p>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="rounded bg-[#1F6B73] px-1.5 py-0.5 text-[7px] font-medium text-white">Starttid</span>
                <span className="rounded border border-[#d5dcda] px-1 py-0.5 text-[7px] text-[#5f6b6d]">+</span>
              </div>
            </div>

            <div className="overflow-hidden rounded-md border border-[#dde5e2] bg-white">
              <div className="grid grid-cols-4 border-b border-[#edf1ef] px-2 py-1 text-[6.5px] uppercase tracking-wide text-[#758185]">
                <span>Fravalg</span>
                <span className="text-center">Satt</span>
                <span className="text-center">Pluss/min</span>
                <span className="text-center">OK</span>
              </div>
              {[
                ["Man", "08:00", "14:00", "-"],
                ["Tir", "08:00", "16:00", "+"],
                ["Ons", "08:00", "16:00", "+"],
              ].map((row) => (
                <div key={row[0]} className="grid grid-cols-4 px-2 py-1 text-[7px] text-[#354146]">
                  <span>{row[0]}</span>
                  <span className="text-center">{row[1]}</span>
                  <span className="text-center">{row[2]}</span>
                  <span className="text-center text-[#7f8b8e]">{row[3]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="rounded-md border border-[#e1e6e4] bg-[#f8faf8] p-2">
              <div className="mb-1.5 h-1.5 w-14 rounded-full bg-[#dbe2de]" />
              <div className="h-1.5 w-10 rounded-full bg-[#dbe2de]" />
            </div>
            <div className="rounded-md border border-[#e1e6e4] bg-white p-2">
              <p className="mb-1 text-[7px] font-medium text-[#5f6b6d]">Tidlag</p>
              <div className="space-y-1 text-[7px] text-[#314043]">
                <div className="flex justify-between"><span>08:00</span><span>-</span></div>
                <div className="flex justify-between"><span>16:00</span><span>-</span></div>
              </div>
            </div>
            <div className="rounded-md border border-[#e1e6e4] bg-white p-2">
              <div className="h-1.5 w-full rounded-full bg-[#e7ecea]" />
              <div className="mt-1.5 h-1.5 w-3/4 rounded-full bg-[#e7ecea]" />
              <div className="mt-1.5 h-1.5 w-2/3 rounded-full bg-[#e7ecea]" />
            </div>
          </div>
        </div>
      </div>

      <div className="absolute left-[75.08%] top-[35.63%] z-10 hidden h-[40%] w-[12.42%] overflow-hidden rounded-[18px] bg-white md:block">
        <div className="h-full bg-[#fcfdfd] px-2 py-1.5">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <img src="/favicon-16x16.png" alt="" className="h-2 w-2 rounded-full" />
              <span className="text-[7px] font-medium text-[#243237]">Tidum</span>
            </div>
            <span className="text-[6px] text-[#6a7579]">⌕</span>
          </div>
          <p className="mb-1 text-[6.5px] font-medium text-[#29363a]">Registrer arbeidstid</p>
          <div className="space-y-1 rounded-md border border-[#e1e6e4] p-1.5">
            {[
              ["Stasjon", "08:00"],
              ["Skift", "15:30"],
              ["Pause", "30 min"],
            ].map((item) => (
              <div key={item[0]} className="flex items-center justify-between text-[6.5px] text-[#3a474b]">
                <span>{item[0]}</span>
                <span>{item[1]}</span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 rounded-sm bg-[#1F6B73] py-1 text-center text-[7px] font-medium text-white">Lagre</div>
          <div className="mt-1.5 flex items-center justify-between px-0.5 text-[6px] text-[#7a8589]">
            <span>◻</span>
            <span>▢</span>
            <span>◎</span>
            <span>◉</span>
          </div>
        </div>
      </div>

      <img
        src={tidumMockup}
        alt=""
        className="relative z-20 h-auto w-full object-contain drop-shadow-[0_12px_24px_rgba(23,41,46,0.2)] md:drop-shadow-[0_24px_44px_rgba(23,41,46,0.28)]"
      />
    </div>
  );
}

function StoryPainIllustration() {
  return (
    <svg
      viewBox="0 0 820 320"
      className="h-full w-full"
      role="img"
      aria-label="Illustrasjon av manuell og fragmentert tidsføring."
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="painBg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#2B3E46" />
          <stop offset="55%" stopColor="#1D2A31" />
          <stop offset="100%" stopColor="#141D23" />
        </linearGradient>
        <linearGradient id="paper" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#F3F6F8" />
          <stop offset="100%" stopColor="#E1E8EB" />
        </linearGradient>
        <linearGradient id="warn" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#E57A6E" />
          <stop offset="100%" stopColor="#C14E42" />
        </linearGradient>
      </defs>

      <rect width="820" height="320" fill="url(#painBg)" />
      <circle cx="120" cy="68" r="92" fill="#5F7E8A" opacity="0.15" />
      <circle cx="704" cy="256" r="128" fill="#8DA1A9" opacity="0.12" />

      <g transform="translate(90 52) rotate(-7 150 90)">
        <rect x="0" y="0" width="300" height="184" rx="16" fill="url(#paper)" opacity="0.9" />
        <rect x="24" y="34" width="136" height="10" rx="5" fill="#B8C8CE" />
        <rect x="24" y="58" width="252" height="8" rx="4" fill="#C8D3D8" />
        <rect x="24" y="78" width="252" height="8" rx="4" fill="#C8D3D8" />
        <rect x="24" y="98" width="180" height="8" rx="4" fill="#C8D3D8" />
        <rect x="198" y="18" width="86" height="34" rx="12" fill="url(#warn)" />
        <text x="241" y="40" textAnchor="middle" fontSize="16" fill="#FFFFFF" fontWeight="800">Feil</text>
      </g>

      <g transform="translate(340 70) rotate(4 180 100)">
        <rect x="0" y="0" width="352" height="198" rx="18" fill="#FAFCFD" />
        <rect x="22" y="22" width="88" height="20" rx="9" fill="#D4DEE3" />
        <rect x="22" y="54" width="308" height="1.5" fill="#D7E1E6" />
        <rect x="22" y="76" width="308" height="1.5" fill="#D7E1E6" />
        <rect x="22" y="98" width="308" height="1.5" fill="#D7E1E6" />
        <rect x="22" y="120" width="308" height="1.5" fill="#D7E1E6" />
        <rect x="22" y="142" width="308" height="1.5" fill="#D7E1E6" />
        <rect x="210" y="12" width="134" height="34" rx="12" fill="#CF6C60" />
        <text x="277" y="34" textAnchor="middle" fontSize="16" fill="#FFFFFF" fontWeight="800">Uklart</text>
      </g>

      <g transform="translate(618 24)">
        <circle cx="86" cy="86" r="64" fill="#1F2E36" stroke="#B7C4CA" strokeWidth="4" />
        <line x1="86" y1="86" x2="86" y2="50" stroke="#E8EEF1" strokeWidth="6" strokeLinecap="round" />
        <line x1="86" y1="86" x2="116" y2="96" stroke="#E8EEF1" strokeWidth="6" strokeLinecap="round" />
        <circle cx="86" cy="86" r="5" fill="#E8EEF1" />
      </g>
    </svg>
  );
}

function StoryReliefIllustration() {
  return (
    <svg
      viewBox="0 0 820 320"
      className="h-full w-full"
      role="img"
      aria-label="Illustrasjon av samlet og trygg arbeidstidsoversikt i Tidum."
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="reliefBg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#E6F2EE" />
          <stop offset="60%" stopColor="#D5E9E2" />
          <stop offset="100%" stopColor="#C5DFD7" />
        </linearGradient>
        <linearGradient id="screen" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F2F8F5" />
        </linearGradient>
      </defs>

      <rect width="820" height="320" fill="url(#reliefBg)" />
      <circle cx="152" cy="270" r="118" fill="#4E9A6F" opacity="0.12" />
      <circle cx="728" cy="68" r="104" fill="#1F6B73" opacity="0.12" />

      <g transform="translate(86 44)">
        <rect x="0" y="0" width="548" height="228" rx="20" fill="#0F1A1E" />
        <rect x="8" y="8" width="532" height="196" rx="14" fill="url(#screen)" />
        <rect x="232" y="210" width="84" height="8" rx="4" fill="#60767C" />
        <rect x="204" y="220" width="140" height="7" rx="3.5" fill="#84989E" />

        <g transform="translate(20 16)">
          <rect x="0" y="0" width="134" height="34" rx="10" fill="#FFFFFF" />
          <image href="/favicon-32x32.png" x="8" y="7" width="20" height="20" />
          <text x="36" y="22" fontSize="18" fill="#1E2A2C" fontWeight="800">Tidum</text>
        </g>

        <g transform="translate(28 66)">
          <rect x="0" y="0" width="318" height="98" rx="14" fill="#FFFFFF" stroke="#D8E6DF" />
          <text x="18" y="30" fontSize="20" fill="#1E2A2C" fontWeight="700">Registrer tid</text>
          <text x="18" y="66" fontSize="34" fill="#1E2A2C" fontWeight="700">08:00 - 16:00</text>
          <rect x="18" y="72" width="82" height="24" rx="10" fill="#1F6B73" />
          <text x="59" y="89" textAnchor="middle" fontSize="12" fill="#FFFFFF" fontWeight="700">Starttid</text>
        </g>

        <g transform="translate(366 66)">
          <rect x="0" y="0" width="144" height="38" rx="10" fill="#FFFFFF" stroke="#D8E6DF" />
          <rect x="0" y="50" width="144" height="114" rx="12" fill="#FFFFFF" stroke="#D8E6DF" />
          <rect x="12" y="64" width="88" height="8" rx="4" fill="#D6E3DD" />
          <rect x="12" y="82" width="64" height="8" rx="4" fill="#D6E3DD" />
          <rect x="12" y="100" width="108" height="8" rx="4" fill="#D6E3DD" />
        </g>
      </g>

      <g transform="translate(658 92)">
        <rect x="0" y="0" width="112" height="204" rx="28" fill="#0F1A1E" />
        <rect x="7" y="7" width="98" height="190" rx="22" fill="#FFFFFF" />
        <rect x="16" y="24" width="82" height="12" rx="6" fill="#E1ECE7" />
        <rect x="16" y="48" width="82" height="12" rx="6" fill="#E1ECE7" />
        <rect x="16" y="72" width="82" height="12" rx="6" fill="#E1ECE7" />
        <rect x="16" y="104" width="82" height="26" rx="10" fill="#1F6B73" />
        <text x="57" y="121" textAnchor="middle" fontSize="12" fill="#FFFFFF" fontWeight="700">Lagre</text>
      </g>
    </svg>
  );
}

const featureCards = [
  {
    icon: Clock3,
    title: "Registrer",
    points: [
      { icon: Calendar, text: "Enkel føring av arbeidstid" },
      { icon: Smartphone, text: "Mobil- og feltvennlig" },
    ],
    iconTone: "text-[#3A8B73]",
    iconBg: "bg-[#E7F3EE]",
  },
  {
    icon: FileCheck2,
    title: "Dokumenter",
    points: [
      { icon: Database, text: "Alt lagres" },
      { icon: Search, text: "Endringer spores" },
      { icon: ShieldCheck, text: "Klar for revisjon" },
    ],
    iconTone: "text-[#8F7E52]",
    iconBg: "bg-[#F5EFE1]",
  },
  {
    icon: BarChart3,
    title: "Få oversikt",
    points: [
      { icon: FileSpreadsheet, text: "Rapporter" },
      { icon: TrendingUp, text: "Innsikt for ledelse" },
      { icon: Zap, text: "Mindre manuelt arbeid" },
    ],
    iconTone: "text-[#4C9A6F]",
    iconBg: "bg-[#E8F5EE]",
  },
] as const;

const painStoryPoints = [
  {
    icon: FileSpreadsheet,
    title: "Manuelle timelister og Excel",
    detail: "Flere versjoner i omløp gjør det uklart hva som faktisk stemmer.",
  },
  {
    icon: ShieldCheck,
    title: "Usikker dokumentasjon",
    detail: "Når noe må etterprøves, blir det krevende å finne trygg historikk.",
  },
  {
    icon: ClipboardList,
    title: "Tidskrevende rapportering",
    detail: "Tid går til opprydding i data i stedet for oppfølging av mennesker.",
  },
] as const;

const painTimeline = [
  { time: "15:42", text: "Vakten avsluttes. Timer er ført ulikt på mobil, papir og Excel." },
  { time: "16:10", text: "Leder prøver å samle alt før rapportfrist." },
  { time: "16:45", text: "Små avvik blir store spørsmål om hva som er riktig." },
] as const;

type HowStepVariant = "users" | "time" | "live" | "export";

function HowStepIllustration({ variant }: { variant: HowStepVariant }) {
  const accent =
    variant === "users"
      ? "#4E9A6F"
      : variant === "time"
        ? "#1F6B73"
        : variant === "live"
          ? "#2D8570"
          : "#2E7690";

  return (
    <svg
      viewBox="0 0 480 220"
      className="h-full w-full"
      role="img"
      aria-label="Illustrasjon av steg i Tidum-oppsett."
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`howBg-${variant}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#EAF3F0" />
          <stop offset="100%" stopColor="#DDE9E5" />
        </linearGradient>
      </defs>

      <rect width="480" height="220" fill={`url(#howBg-${variant})`} />
      <rect x="18" y="18" width="444" height="184" rx="14" fill="#FFFFFF" stroke="#D5E1DD" />
      <rect x="18" y="18" width="444" height="28" rx="14" fill="#F2F7F5" />
      <image href="/favicon-16x16.png" x="30" y="24" width="14" height="14" />
      <text x="50" y="35" fontSize="12" fill="#284047" fontWeight="700">Tidum</text>
      <circle cx="445" cy="32" r="4" fill={accent} />

      {variant === "users" && (
        <g transform="translate(34 58)">
          <rect x="0" y="0" width="250" height="122" rx="10" fill="#F9FCFB" stroke="#D9E5E1" />
          {[
            { y: 16, name: "Maria N.", role: "Miljøarbeider" },
            { y: 48, name: "Ali H.", role: "Feltteam" },
            { y: 80, name: "Sofie K.", role: "Teamleder" },
          ].map((row) => (
            <g key={row.name} transform={`translate(12 ${row.y})`}>
              <circle cx="8" cy="8" r="7" fill="#BFD8CE" />
              <text x="22" y="11" fontSize="10" fill="#1E2A2C" fontWeight="700">{row.name}</text>
              <rect x="116" y="1" width="88" height="14" rx="7" fill="#E7F2EE" />
              <text x="160" y="11" textAnchor="middle" fontSize="9" fill="#2A6452">{row.role}</text>
            </g>
          ))}

          <rect x="284" y="8" width="146" height="48" rx="10" fill="#FFFFFF" stroke="#D9E5E1" />
          <text x="296" y="26" fontSize="10" fill="#55686E">Legg til bruker</text>
          <rect x="296" y="31" width="96" height="16" rx="8" fill={accent} />
          <text x="344" y="42" textAnchor="middle" fontSize="9" fill="#FFFFFF" fontWeight="700">Inviter</text>
        </g>
      )}

      {variant === "time" && (
        <g transform="translate(34 58)">
          <rect x="0" y="0" width="284" height="122" rx="12" fill="#F9FCFB" stroke="#D9E5E1" />
          <text x="16" y="24" fontSize="12" fill="#1E2A2C" fontWeight="700">Registrer tid</text>
          <text x="16" y="56" fontSize="34" fill="#1E2A2C" fontWeight="800">08:00 - 16:00</text>
          <rect x="16" y="72" width="84" height="22" rx="10" fill={accent} />
          <text x="58" y="86" textAnchor="middle" fontSize="10" fill="#FFFFFF" fontWeight="700">Starttid</text>
          <rect x="332" y="0" width="98" height="58" rx="10" fill="#FFFFFF" stroke="#D9E5E1" />
          <text x="344" y="20" fontSize="10" fill="#55686E">Skift</text>
          <text x="344" y="39" fontSize="13" fill="#1E2A2C" fontWeight="700">15:30</text>
          <rect x="332" y="66" width="98" height="56" rx="10" fill="#FFFFFF" stroke="#D9E5E1" />
          <text x="344" y="86" fontSize="10" fill="#55686E">Pause</text>
          <text x="344" y="106" fontSize="13" fill="#1E2A2C" fontWeight="700">30 min</text>
        </g>
      )}

      {variant === "live" && (
        <g transform="translate(34 58)">
          <rect x="0" y="0" width="180" height="122" rx="10" fill="#F9FCFB" stroke="#D9E5E1" />
          <text x="14" y="22" fontSize="11" fill="#1E2A2C" fontWeight="700">Sanntid nå</text>
          {[
            { x: 18, h: 48 },
            { x: 46, h: 62 },
            { x: 74, h: 34 },
            { x: 102, h: 76 },
            { x: 130, h: 55 },
          ].map((bar) => (
            <rect key={bar.x} x={bar.x} y={102 - bar.h} width="16" height={bar.h} rx="6" fill={accent} opacity="0.85" />
          ))}

          <rect x="202" y="0" width="228" height="122" rx="10" fill="#FFFFFF" stroke="#D9E5E1" />
          <text x="216" y="22" fontSize="11" fill="#1E2A2C" fontWeight="700">Aktivitet</text>
          {[
            { y: 36, label: "Maria startet vakt", ok: true },
            { y: 62, label: "Ali registrerte pause", ok: true },
            { y: 88, label: "Sofie godkjente timer", ok: true },
          ].map((row) => (
            <g key={row.label} transform={`translate(216 ${row.y})`}>
              <circle cx="6" cy="0" r="4" fill={row.ok ? "#4E9A6F" : "#CC7A6E"} />
              <text x="16" y="4" fontSize="10" fill="#2D3E43">{row.label}</text>
            </g>
          ))}
        </g>
      )}

      {variant === "export" && (
        <g transform="translate(34 58)">
          <rect x="0" y="0" width="292" height="122" rx="10" fill="#F9FCFB" stroke="#D9E5E1" />
          <text x="14" y="22" fontSize="11" fill="#1E2A2C" fontWeight="700">Rapportklar</text>
          <rect x="14" y="32" width="264" height="1.5" fill="#D9E5E1" />
          {[
            { y: 44, a: "Maria N.", b: "40 t", c: "Godkjent" },
            { y: 66, a: "Ali H.", b: "37.5 t", c: "Godkjent" },
            { y: 88, a: "Sofie K.", b: "42 t", c: "Godkjent" },
          ].map((row) => (
            <g key={row.a} transform={`translate(14 ${row.y})`}>
              <text x="0" y="0" fontSize="10" fill="#2D3E43">{row.a}</text>
              <text x="128" y="0" fontSize="10" fill="#2D3E43">{row.b}</text>
              <text x="188" y="0" fontSize="10" fill="#2A6B59">{row.c}</text>
            </g>
          ))}

          <rect x="306" y="0" width="124" height="122" rx="10" fill="#FFFFFF" stroke="#D9E5E1" />
          <text x="320" y="22" fontSize="11" fill="#1E2A2C" fontWeight="700">Eksporter</text>
          <rect x="320" y="34" width="96" height="24" rx="10" fill={accent} />
          <text x="368" y="49" textAnchor="middle" fontSize="10" fill="#FFFFFF" fontWeight="700">PDF</text>
          <rect x="320" y="66" width="96" height="24" rx="10" fill="#E7F2EE" />
          <text x="368" y="81" textAnchor="middle" fontSize="10" fill="#2A6452" fontWeight="700">Excel</text>
        </g>
      )}
    </svg>
  );
}

const howItWorksSteps = [
  {
    title: "Opprett brukere",
    description: "Inviter ansatte, legg til roller og kom i gang uten teknisk oppsett.",
    icon: Users,
    variant: "users" as const,
  },
  {
    title: "Registrer arbeidstid",
    description: "Før timer raskt på mobil eller PC med samme arbeidsflyt for alle.",
    icon: Clock3,
    variant: "time" as const,
  },
  {
    title: "Følg med i sanntid",
    description: "Se status mens dagen pågår, så ledelsen slipper etterslep.",
    icon: BarChart3,
    variant: "live" as const,
  },
  {
    title: "Eksporter rapporter",
    description: "Send videre i riktig format når lønn, oppfølging eller revisjon krever det.",
    icon: FileSpreadsheet,
    variant: "export" as const,
  },
] as const;

export default function LandingPage() {
  const [, setLocation] = useLocation();

  useSEO({
    title: "Tidum – Profesjonell timeføring for norske bedrifter",
    description: "Tidum er Norges mest brukervennlige plattform for timeføring, rapportering og ressursplanlegging. Spar tid, øk lønnsomhet og hold full kontroll over timer og prosjekter.",
    ogType: "website",
    canonical: "https://tidum.no/",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Tidum",
        url: "https://tidum.no",
        logo: "https://tidum.no/favicon-512x512.png",
        sameAs: [],
        contactPoint: {
          "@type": "ContactPoint",
          telephone: "+47-97-95-92-94",
          contactType: "customer service",
          availableLanguage: "Norwegian",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Tidum",
        url: "https://tidum.no",
        inLanguage: "nb",
        description: "Profesjonell timeføring for norske bedrifter",
      },
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Tidum",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "NOK",
        },
        description: "Norges mest brukervennlige plattform for timeføring, rapportering og ressursplanlegging.",
      },
    ],
  });

  const goToContact = () => setLocation("/kontakt");

  const scrollToFeatures = () => {
    document.getElementById("funksjoner")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToHow = () => {
    document.getElementById("hvordan")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="tidum-page">
      <style>{tidumPageStyles}</style>

      <div className="rt-container pb-20 pt-8">
        <section className="tidum-panel tidum-fade-up relative overflow-hidden rounded-[28px]">
          <div className="pointer-events-none absolute -left-16 top-[34%] h-36 w-96 rotate-[-14deg] rounded-[999px] bg-[rgba(131,171,145,0.2)]" />
          <div className="pointer-events-none absolute right-[-140px] top-14 h-80 w-[520px] rounded-[999px] bg-[rgba(194,205,195,0.24)]" />

          <header className="relative z-10 flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <img src={tidumWordmark} alt="Tidum" className="h-10 w-auto sm:h-11" />
            </div>

            <div className="flex items-center gap-4 sm:gap-6">
              <button
                type="button"
                onClick={scrollToFeatures}
                className="hidden items-center gap-2 text-base text-[#26373C] transition-colors hover:text-[var(--color-primary)] sm:inline-flex"
              >
                <ClipboardList className="h-4 w-4" />
                Funksjoner
              </button>
              <Button
                onClick={goToContact}
                className="tidum-btn-primary inline-flex h-auto items-center px-6 py-3 text-base font-semibold"
              >
                Be om demo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </header>

          <div className="relative z-10 grid gap-12 px-6 py-10 sm:px-8 sm:py-12 lg:grid-cols-[1.1fr,1.2fr] lg:items-center lg:gap-10">
            <div>
              <h1 className="tidum-title">Arbeidstid, gjort enkelt</h1>
              <p className="tidum-text mt-6 max-w-2xl">
                Tidum er et moderne arbeidstidssystem for felt og turnus. Enkel registrering, trygg
                dokumentasjon og full oversikt - for både ansatte og ledelse.
              </p>
              <div className="mt-8 flex flex-wrap gap-3 sm:gap-4">
                <Button
                  onClick={goToContact}
                  className="tidum-btn-primary h-auto px-6 py-3 text-lg font-semibold"
                >
                  Be om demo
                </Button>
                <Button
                  type="button"
                  onClick={scrollToHow}
                  variant="outline"
                  className="tidum-btn-secondary h-auto px-6 py-3 text-lg font-medium"
                >
                  Se hvordan det fungerer
                </Button>
              </div>
            </div>

            <HeroMockup />
          </div>

          <div id="funksjoner" className="relative z-10 border-t border-[var(--color-border)] px-6 pb-10 pt-8 sm:px-8 sm:pb-12 sm:pt-10">
            <h2 className="text-center text-[clamp(2rem,4.1vw,3.6rem)] font-semibold tracking-tight text-[#15343D]">
              Et system bygget for virkeligheten
            </h2>

            <div className="mt-7 grid gap-4 md:grid-cols-3">
              {featureCards.map(({ icon: Icon, title, points, iconBg, iconTone }) => (
                <Card key={title} className="rounded-2xl border-[var(--color-border)] bg-white/95 shadow-[0_8px_28px_rgba(22,43,49,0.06)]">
                  <CardContent className="p-6 sm:p-7">
                    <div className="mb-4 flex items-center gap-3">
                      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${iconBg}`}>
                        <Icon className={`h-6 w-6 ${iconTone}`} />
                      </div>
                      <h3 className="text-[clamp(1.35rem,2.2vw,2.05rem)] font-semibold tracking-tight text-[#1D2C31]">{title}</h3>
                    </div>
                    <ul className="space-y-2 text-[clamp(1rem,1.25vw,1.25rem)] text-[#2E3D43]">
                      {points.map(({ icon: PointIcon, text }) => (
                        <li key={text} className="flex items-start gap-2.5">
                          <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md bg-[#EAF4EF]">
                            <PointIcon className="h-3.5 w-3.5 text-[#2A7B62]" />
                          </span>
                          <span>{text}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-section)] p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
            <Card className="relative overflow-hidden rounded-2xl border-[#E7D3CF] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,246,244,0.9))]">
              <div className="pointer-events-none absolute -left-8 top-8 h-36 w-36 rounded-full bg-[#EAC8C1]/35 blur-2xl" />
              <CardContent className="relative p-6 sm:p-7">
                <div className="relative overflow-hidden rounded-xl border border-[#E6D4D0] bg-[#F0F3F4]">
                  <div className="h-48 w-full">
                    <StoryPainIllustration />
                  </div>
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#10191f]/55 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 rounded-md bg-[#0F2028]/90 px-3 py-1.5 text-sm font-semibold text-white shadow-lg">
                    Flere systemer. Flere tolkninger.
                  </div>
                </div>

                <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#E6D4D0] bg-white/85 px-3 py-1 text-xs font-medium text-[#7E534C]">
                  <Clock3 className="h-3.5 w-3.5" />
                  Et vanlig vaktskifte, før Tidum
                </p>

                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#15343D] sm:text-4xl">
                  Mange jobber fortsatt med feil verktøy
                </h2>
                <p className="mt-4 max-w-3xl text-[var(--color-text-muted)]">
                  En helt vanlig ettermiddag: vakten avsluttes, timer kommer inn fra ulike steder, og rapporten må leveres.
                  Når verktøyene ikke snakker sammen, oppstår usikkerhet og unødvendig press.
                </p>

                <div className="mt-6 grid gap-3">
                  {painStoryPoints.map(({ icon: Icon, title, detail }) => (
                    <div key={title} className="rounded-xl border border-[#E8D9D5] bg-white/92 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-lg bg-[#F8EDEB] p-2">
                          <Icon className="h-4 w-4 text-[#9A5B52]" />
                        </div>
                        <div>
                          <p className="font-semibold text-[#2A363A]">{title}</p>
                          <p className="mt-0.5 text-sm text-[#667376]">{detail}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-[var(--color-border)] bg-white/96 shadow-[0_8px_28px_rgba(22,43,49,0.06)]">
              <CardContent className="p-6 sm:p-7">
                <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#ECF4F1]">
                  <div className="h-48 w-full">
                    <StoryReliefIllustration />
                  </div>
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#EFF6F3]/80 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 rounded-md bg-[#1F6B73]/95 px-3 py-1.5 text-sm font-semibold text-white shadow-lg">
                    Ett system. Én trygg sannhet.
                  </div>
                </div>

                <h3 className="mt-5 text-2xl font-semibold tracking-tight text-[#15343D]">Hvordan behovet kjennes</h3>
                <p className="mt-2 text-[var(--color-text-muted)]">Små feil blir fort store konsekvenser i en travel hverdag.</p>

                <div className="mt-5 space-y-3">
                  {painTimeline.map((entry) => (
                    <div key={entry.time} className="rounded-xl border border-[var(--color-border)] bg-[#F9FBFA] px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 min-w-[50px] rounded-md bg-[#EEF2F1] px-2 py-1 text-center text-xs font-semibold text-[#4E5F63]">
                          {entry.time}
                        </div>
                        <p className="text-sm leading-relaxed text-[#2E3D43]">{entry.text}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-xl border border-[#D6E5DD] bg-[#EEF7F2] px-4 py-3">
                  <p className="text-sm font-medium text-[#1E5A49]">
                    Tidum er laget for å rydde opp uten å gjøre hverdagen mer komplisert.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="tidum-fade-up mt-12 grid gap-5 lg:grid-cols-2 lg:items-stretch">
          <Card className="h-full rounded-2xl border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(243,247,245,0.9))]">
            <CardContent className="flex h-full flex-col p-6 sm:p-7">
              <div className="min-h-[100px]">
                <h2 className="text-3xl font-semibold tracking-tight text-[#15343D] sm:text-4xl">Trygghet for alle parter</h2>
                <p className="mt-3 text-[var(--color-text-muted)]">
                  Tidum er laget for støtte i hverdagen, ikke ekstra press.
                </p>
              </div>
              <div className="mt-6 grid gap-3">
                {[
                  {
                    icon: ShieldCheck,
                    title: "Ikke overvåkning",
                    description: "Kun nødvendig registrering for trygg dokumentasjon.",
                  },
                  {
                    icon: Clock3,
                    title: "Ikke stress",
                    description: "Rask føring som passer arbeidshverdagen.",
                  },
                  {
                    icon: ClipboardList,
                    title: "Ikke komplisert",
                    description: "Tydelig oppsett uten unødvendige steg.",
                  },
                ].map(({ icon: Icon, title, description }) => (
                  <div key={title} className="flex min-h-[102px] rounded-xl border border-[var(--color-border)] bg-white/90 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-lg bg-[#E7F3EE] p-2">
                        <Icon className="h-4 w-4 text-[var(--color-primary)]" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#1D2C31]">{title}</p>
                        <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="h-full rounded-2xl border-[var(--color-border)] bg-white/95 shadow-[0_8px_28px_rgba(22,43,49,0.06)]">
            <CardContent className="flex h-full flex-col p-6 sm:p-7">
              <div className="min-h-[100px]">
                <h3 className="text-2xl font-semibold tracking-tight text-[#15343D]">Dette gir trygghet i praksis</h3>
                <p className="mt-2 text-[var(--color-text-muted)]">
                  For ansatte, ledere og virksomheten.
                </p>
              </div>
              <div className="mt-5 grid gap-3">
                {[
                  {
                    icon: Users,
                    title: "Ansatte føler tillit",
                    description: "Tydelig og rettferdig registrering uten unødvendig kontroll.",
                  },
                  {
                    icon: BarChart3,
                    title: "Ledere får oversikt",
                    description: "Oppdatert innsikt uten manuell sammenstilling.",
                  },
                  {
                    icon: FileCheck2,
                    title: "Virksomheten får dokumentasjon",
                    description: "Sporbar historikk klar for krav og revisjon.",
                  },
                ].map(({ icon: Icon, title, description }) => (
                  <div key={title} className="flex min-h-[102px] rounded-xl border border-[var(--color-border)] bg-[#F7FAF9] px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-lg bg-[#E7F3EE] p-2">
                        <Icon className="h-4 w-4 text-[var(--color-primary)]" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#1D2C31]">{title}</p>
                        <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="tidum-fade-up mt-12">
          <h2 className="text-3xl font-semibold tracking-tight text-[#15343D] sm:text-4xl">Hvem bruker Tidum?</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              { icon: Users, label: "Miljøarbeidere" },
              { icon: ClipboardList, label: "Turnus- og feltarbeid" },
              { icon: ShieldCheck, label: "Private omsorgsaktører" },
              { icon: Users, label: "Kommuner og offentlige virksomheter" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4">
                <Icon className="h-5 w-5 text-[var(--color-primary)]" />
                <p className="font-medium">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="hvordan" className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-section)] p-6 sm:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-[#15343D] sm:text-4xl">Kom i gang på minutter</h2>
              <p className="mt-2 max-w-2xl text-[var(--color-text-muted)]">
                Slik ser arbeidsflyten ut når brukeren faktisk er inne i Tidum.
              </p>
            </div>
            <p className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#3C5C62]">
              4 steg fra oppsett til rapport
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {howItWorksSteps.map(({ title, description, icon: StepIcon, variant }, index) => (
              <Card key={title} className="overflow-hidden rounded-2xl border-[var(--color-border)] bg-white/95 shadow-[0_8px_28px_rgba(22,43,49,0.06)]">
                <div className="border-b border-[var(--color-border)] bg-[#E9F1EE]">
                  <div className="h-[170px] w-full">
                    <HowStepIllustration variant={variant} />
                  </div>
                </div>
                <CardContent className="p-5 sm:p-6">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)]/12 text-sm font-semibold text-[var(--color-primary)]">
                      {index + 1}
                    </span>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#EAF4EF]">
                      <StepIcon className="h-4 w-4 text-[#2A7B62]" />
                    </span>
                    <h3 className="text-lg font-semibold text-[#1D2C31]">{title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-muted)]">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-white p-6 sm:p-8">
          <div className="grid gap-6 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-[#15343D] sm:text-4xl">Bygget for norsk arbeidsliv</h2>
              <p className="mt-4 text-[var(--color-text-muted)]">
                Løsningen er laget for norsk språk og norsk kontekst, med dokumentasjon og personvern i sentrum.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  title: "Norsk språk - norsk flagg",
                  detail: "Språk og begreper som føles kjent i hverdagen.",
                  flag: true,
                  icon: null,
                },
                {
                  title: "Norsk kontekst",
                  detail: "Bygget for turnus og feltarbeid i norske virksomheter.",
                  flag: false,
                  icon: MapPin,
                },
                {
                  title: "Fokus på dokumentasjon",
                  detail: "Sporbar historikk for internkontroll og oppfølging.",
                  flag: false,
                  icon: FileCheck2,
                },
                {
                  title: "Personvern først",
                  detail: "Trygg håndtering av data med tydelige roller og tilgang.",
                  flag: false,
                  icon: ShieldCheck,
                },
              ].map((item) => (
                <div key={item.title} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-3">
                  <div className="flex items-start gap-2">
                    {item.flag ? (
                      <span className="relative mt-0.5 inline-block h-4 w-6 overflow-hidden rounded-[2px] bg-[#C8263A] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                        <span className="absolute left-[25%] top-0 h-full w-[22%] bg-white" />
                        <span className="absolute left-[30%] top-0 h-full w-[12%] bg-[#193B83]" />
                        <span className="absolute left-0 top-[34%] h-[32%] w-full bg-white" />
                        <span className="absolute left-0 top-[40%] h-[20%] w-full bg-[#193B83]" />
                      </span>
                    ) : (
                      item.icon && <item.icon className="mt-0.5 h-4 w-4 text-[var(--color-secondary)]" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-[#1F3136]">{item.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{item.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="tidum-fade-up mt-12 rounded-3xl border border-[#1a5d65] bg-[var(--color-primary)] px-6 py-10 text-white sm:px-8">
          <h2 className="text-center text-[clamp(28px,4vw,42px)] font-semibold tracking-tight">
            Klar for å gjøre arbeidstid enklere?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-white/85">
            Se hvordan Tidum kan passe deres arbeidshverdag uten unødvendig kompleksitet.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={goToContact}
              className="h-auto rounded-xl bg-white px-6 py-3 text-[var(--color-primary)] hover:bg-white/90"
            >
              Be om demo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={goToContact}
              className="h-auto rounded-xl border-white/70 px-6 py-3 text-white hover:bg-white/10"
            >
              Ta kontakt
              <ChevronRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </section>

        <footer className="tidum-fade-up mt-10 rounded-3xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,246,0.92))] px-6 py-8 sm:px-8">
          <div className="grid gap-8 md:grid-cols-[1.2fr,0.9fr,1fr]">
            <div>
              <img src={tidumWordmark} alt="Tidum" className="h-10 w-auto" />
              <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--color-text-muted)]">
                Arbeidstidssystem for felt, turnus og norsk dokumentasjonskrav.
              </p>
              <button
                type="button"
                onClick={goToContact}
                className="mt-3 text-sm font-medium text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-hover)]"
              >
                kontakt@tidum.no
              </button>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#35545B]">Snarveier</p>
              <div className="mt-3 grid gap-2 text-sm">
                <button
                  type="button"
                  onClick={scrollToFeatures}
                  className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]"
                >
                  <ChevronRight className="h-4 w-4" />
                  Funksjoner
                </button>
                <button
                  type="button"
                  onClick={scrollToHow}
                  className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]"
                >
                  <ChevronRight className="h-4 w-4" />
                  Hvordan det fungerer
                </button>
                <button
                  type="button"
                  onClick={goToContact}
                  className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]"
                >
                  <ChevronRight className="h-4 w-4" />
                  Be om demo
                </button>
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
}
