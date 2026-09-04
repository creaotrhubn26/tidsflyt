# KI-turnus 2026 (Ålesund) — Byggeplan, estimat og kravmatrise

**Anbud:** Anskaffelse – KI Turnus 2026, Ålesund kommune
**Doffin:** 2026-113925 · Prosedyre-ID `a06833d8-0f4d-4279-9660-dd06e780bffb`
**Estimert verdi:** 2,4 MNOK ekskl. mva · ~3 500 lisensbrukere (gradvis)
**Frist spørsmål:** 28.09.2026 · **Frist tilbud:** 05.10.2026 12:00 · Vedståelse 89 dager
**Tildeling:** Pris 40 % · Løsning (live demo) 60 % · Miljø 0 % (LOA §5b unntak)
**Dokument opprettet:** 04.09.2026

---

## 0. Kjerneinnsikt (fra repo-gjennomgang)

Dagens `tidsflyt`-produkt er **tidsregistrering (SmartTiming timeliste) + barnevern + CMS/plattform**. Det finnes **ingen turnusgenerator, ingen turnus-domenemodell og ingen optimeringsmotor**. Det eneste direkte gjenbrukbare fagelementet er `server/lib/arbeidstidsloven.ts` — en validator for arbeidsmiljøloven kap. 10 på enkelt-timeføringer (dag-/uketimer, 11t hvile, pause). Den *validerer*, men *genererer* ikke.

Konsekvens: dette anbudet krever et **nytt produktområde**, ikke en utvidelse. Plattformen (multi-tenant, RLS-isolasjon, auth/roller, audit, WCAG-CI, EHF/faktura, OpenAI-integrasjon) er solid fundament, men fagmotoren må bygges.

---

## 1. Arkitekturvalg

### 1.1 Motor: hybrid solver + validator + XAI

| Lag | Teknologi | Begrunnelse |
|-----|-----------|-------------|
| **Harde regler** | `arbeidstidsloven.ts` (utvidet) + regeldata | AML kap. 10 og tariff/særavtale er *ufravikelige* — kan ikke overlates til en LLM. Determinisme kreves. |
| **Generator** | **OR-Tools CP-SAT** (Python-sidecar) | Bransjestandard for turnus/vaktplanlegging (constraint programming). Harde krav som constraints, myke hensyn som vektet objektiv. Egen skriving av scheduler er feil bruk av tid. |
| **Forklaring (XAI)** | OpenAI (allerede integrert) + strukturert solver-utdata | Solveren vet nøyaktig hvilke constraints som binder og hvilke myke mål som ikke ble oppfylt. LLM oversetter dette til lesbar begrunnelse — aldri motsatt. |
| **Regel-CRUD, innspill, UI** | Eksisterende stack (React/TS, Express, Drizzle, Postgres, RLS) | Full gjenbruk av plattformmønstre fra barnevern. |

> **ponytail:** OR-Tools CP-SAT via Python-mikrotjeneste (Render). Node har ingen moden CP-SAT. Tak: sidecar legger til én deploy-enhet og et nettverkshopp — akseptabelt; bytt til innebygd WASM-OR-Tools kun hvis sidecar-drift blir et problem. XAI = narrasjon av solver-fakta, ikke fri generering — hindrer at modellen «finner på» en begrunnelse som ikke stemmer med turnusen.

### 1.2 Dataflyt (én generering)

```
Ansatt-innspill + bemanningsplan + regelsett + vaktkoder
      │
      ▼
Regelmotor bygger CP-SAT-modell  ──►  Harde constraints (AML, dekning, kompetanse)
                                       Myke mål (ønsker, helgefrekvens, rettferdighet,
                                       kontinuitet, kostnad) med prioriteringsvekter
      │
      ▼
CP-SAT løser  ──►  Turnusforslag + bindende constraints + uoppfylte myke mål
      │
      ▼
XAI-lag  ──►  «Hvorfor denne turnusen», hva som ikke kunne oppfylles, konsekvens av overstyring
      │
      ▼
UI: forslag, avvik, varsler, manuell justering m/ konsekvens-forhåndsvisning
```

---

## 2. Faseinndeling og estimat

Estimat i **utviklingsuker (dev-uker)** for én erfaren fullstack + AI-assistanse. To spor, fordi tildelingskriterium 2 (60 %) er en **live demo** i evalueringsfasen på få dagers varsel etter 05.10.

### Spor A — Presentasjonsklar demo (til evaluering)
Minste troverdige skive som demonstrerer alle bulletpunktene under kriterium 2 overbevisende. Ikke produksjonshard, men reell motor på realistiske data.

| Fase | Innhold | Estimat |
|------|---------|---------|
| A0 | Turnus-domenemodell (tabeller, RLS), regel-CRUD (harde+myke), vaktkoder, bemanningsplan | 2–3 uker |
| A1 | CP-SAT-sidecar: harde constraints (AML kap.10, dekning, kompetanse) → gyldig turnus ~25 linjer | 2–3 uker |
| A2 | Myke mål + prioriteringsvekter (ønsker, helgefrekvens, rettferdighet, kontinuitet) | 1,5–2 uker |
| A3 | XAI: forklaring, uoppfylte krav, overstyring m/konsekvens | 1,5–2 uker |
| A4 | Ansatt-innspill-UI + planlegger-UI + presentasjonspolish (WCAG) | 2 uker |
| **Sum A** | **Demo som dekker alle kriterium-2-punkter** | **~9–12 dev-uker** |

### Spor B — Produksjonsklar (etter evt. tildeling)
Full skala 3 500 brukere, hele regelverket, integrasjoner, drift.

| Fase | Innhold | Estimat |
|------|---------|---------|
| B1 | Fullt regelverk: lokale avtaler, særavtaler, dispensasjoner, individuelle unntak, HTA | 3–4 uker |
| B2 | Skalering/ytelse 3 500 brukere, solver-tuning, jobbkø, caching | 3–4 uker |
| B3 | Integrasjoner (HR/lønn, kalender), import ansattdata, EHF/ordre (gjenbruk) | 2–3 uker |
| B4 | Kontinuitet/pasient-hensyn, kostnadsoptimalisering, revisjon/logg | 2–3 uker |
| B5 | Herding, pentest, drift-runbooks, brukerdok, opplæring | 3–4 uker |
| **Sum B** | **Produksjonsklar** | **~13–18 dev-uker** |

**Total MVP→produksjon: ~22–30 dev-uker (≈5,5–7,5 mnd).**

### ⚠ Tidslinje-risk (må avklares før go)
- Tilbud leveres **05.10.2026** (~4,5 uker fra i dag). Spor A alene er **9–12 uker**. **Demoen rekker ikke å bli ferdig på ordinær aggressiv linje innen presentasjonsvinduet** uten enten (a) parallell bemanning (2–3 utviklere komprimerer Spor A til ~4–5 uker), (b) gjenbruk av en eksisterende turnusmotor/partner, eller (c) at demoen scopes til et smalt, men ekte, kjernescenario (én avdeling, ~25 linjer, harde AML-constraints + XAI) og resten vises som roadmap.
- **Referansekravet er pass/fail:** minst 1 KI-turnusleveranse siste 2 år. Uten reell referanse avvises tilbudet uansett. **Dette avgjør go/no-go og må avklares først.**

---

## 3. Kravmatrise

**Status:** `Gjenbruk` = finnes i plattform · `Utvid` = delvis finnes · `Nybygg` = må bygges
**Kilde:** TK = tildelingskriterium · KK = kvalifikasjonskrav · ADM = administrativt

| ID | Krav | Kilde | Status | Modul / plassering | Spor·Fase |
|----|------|-------|--------|--------------------|-----------|
| K-01 | Registrere/adm./vedlikeholde turnusregler og arbeidstidsregler | TK2 | Utvid | Regelmotor (bygger på `arbeidstidsloven.ts`) | A0 |
| K-02 | Registrere/forvalte lokale avtaler, særavtaler, dispensasjoner | TK2 | Nybygg | Regelmotor – avtaledata | A0/B1 |
| K-03 | Individuelle unntak/tilpasninger per ansatt | TK2 | Nybygg | Ansatt-regelunntak | A0/B1 |
| K-04 | Varsle avvik/brudd/risiko mot AML og øvrige regler | TK2 | Utvid | AML-validator koblet til generering | A1 |
| K-05 | Ansatt registrerer innspill, preferanser, ønsker | TK2 | Nybygg | Ansatt-innspill-UI + tabell | A0/A4 |
| K-06 | Arbeidsflyt for leder/turnusplanlegger | TK2 | Nybygg | Planlegger-UI | A4 |
| K-07 | Definerte steg før generering kan startes | TK2 | Nybygg | Genererings-workflow (gating) | A1/A4 |
| K-08 | Generere turnus ~25 linjer, målbar tid | TK2 | Nybygg | CP-SAT-sidecar | A1 |
| K-09 | Presentere forslag, avvik, varsler | TK2 | Nybygg | Resultat-UI | A3/A4 |
| K-10 | Hensyn til individuelle ønsker/tilrettelegging (f.eks. helgefrekvens) | TK2 | Nybygg | Myke mål i objektiv | A2 |
| K-11 | Prioritere mellom lov/avtale, kompetanse, bemanning, kontinuitet, rettferdighet, ønsker, kostnad | TK2 | Nybygg | Prioriteringsvekter i solver | A2/B4 |
| K-12 | Vise hva som må håndteres manuelt | TK2 | Nybygg | XAI – manuelle poster | A3 |
| K-13 | Forklare grunnlaget for generert forslag | TK2 | Nybygg | XAI-lag | A3 |
| K-14 | Vise hvilke regler/hensyn/prioriteringer som ligger til grunn | TK2 | Nybygg | XAI – strukturert utdata | A3 |
| K-15 | Justere/overstyre forslag | TK2 | Nybygg | Manuell justering | A3/A4 |
| K-16 | Synliggjøre konsekvens av endringer | TK2 | Nybygg | Konsekvens-forhåndsvisning (re-validering) | A3 |
| K-17 | Vise hvilke krav/hensyn som ikke kan oppfylles fullt ut | TK2 | Nybygg | XAI – uoppfylte constraints | A3 |
| K-18 | Skybasert, ~3 500 brukere, gradvis innføring | Beskrivelse | Utvid | Plattform + skalering | B2 |
| K-19 | Universell utforming (WCAG) | KK9 | Gjenbruk | axe i CI, eksisterende tokens | A4 |
| K-20 | Pris: prisskjema (Excel), 5-års evalueringssum, hybridmodell knekkpunkt 1 | TK1 | ADM | Kommersielt vedlegg | — |
| K-21 | Referanse: ≥1 KI-turnusleveranse siste 2 år | KK3 | ⚠ Avklar | Vedlegg «Leverandørens erfaring» (maks 1 A4) | — |
| K-22 | Skatteattest RF-1507 (<6 mnd) | KK1 | ADM | Gjenbruk fra Halden | — |
| K-23 | Kredittverdighet min. A (D&B RiskGuardian) | KK2 | ADM | Oppdragsgiver sjekker selv | — |
| K-24 | ESPD / avvisningsgrunner | Deltakelse | ADM | Gjenbruk fra Halden | — |
| K-25 | EHF: elektronisk bestilling/faktura, e-betaling | Adm. | Gjenbruk | Eksisterende faktura/EHF | B3 |
| K-26 | Kvalitetssikringsstandarder (uavhengig attest) | KK9 | Delvis | Sikkerhet/CI-dok; evt. ISO-attest | B5 |

---

## 4. Anbefalt neste steg

1. **Avklar K-21 (referanse) — go/no-go.** Uten reell KI-turnus-referanse er tilbudet ikke kvalifisert; da bør ressursene ikke brukes på motorbygging.
2. Ved go: bestem tidslinje-strategi (parallell bemanning / partner-motor / smalt demo-scope) mot 05.10-fristen.
3. Start Spor A0 (domenemodell + regel-CRUD) — fundamentet er verdifullt uansett strategi og gjenbrukbart mot andre kommuner.
4. Parallelt: kommersielle vedlegg (K-20 prisskjema, K-22/23/24 kvalifikasjon).

> Anbudet er merket **egnet for SMB** og har lav terskel på kvalifikasjon utover referansekravet — hovedhindringen er referansen og tidslinjen, ikke økonomi eller formalia.
