# Rapport-funksjon (Google Docs)

## Oversikt
Smart Timing kan nå generere profesjonelle månedlige rapporter direkte i Google Docs. Systemet støtter to maler tilpasset ulike roller.

## Funksjoner

### 1. Malvalg
- **Automatisk**: System velger mal basert på prosjektinformasjon fra oppsettet
  - Detekterer "miljøarbeider", "sosialarbeider", "aktivitør", "miljøterapeut" i konsulent, tiltak, eller bedrift-feltene
  - **Tiltak/Rolle dropdown** i setup inneholder forhåndsvalg med ikoner:
    - 👥 Miljøarbeider
    - 🧠 Sosialarbeider
    - ⚽ Aktivitør
    - 🌿 Miljøterapeut
    - 👤 Tiltaksleder
  - Detekterer nøkkelord: "miljøarbeider", "sosialarbeider", "aktivitør", "miljøterapeut", "tiltaksleder"
  - Faller tilbake til standard-mal hvis ingen nøkkelord finnes
  - Kan også skrive egen rolle (freeSolo)
- **Standard**: For konsulenter og generelle arbeidere
- **Miljøarbeider**: For sosialarbeidere og miljøarbeidere

### 2. Rapportsammenstilling
Brukere kan komponere rapporten før generering:
- ✍️ Egendefinert innledning
- 📝 Tilleggsnotater på slutten
- 👁️ Forhåndsvisning av innhold
- 🎯 Malspesifikke veiledninger

### 3. Automatisk innhold
Rapporten genereres automatisk med:
- 📅 Tittel og måned (norsk)
- ℹ️ **Prosjektinformasjon** (hentes fra prosjektoppsettet):
  - Konsulent
  - Bedrift
  - Oppdragsgiver
  - Tiltak
  - Klient ID
  - Periode
- 📊 Statistikk (totale timer, arbeidsdager, aktiviteter)
- 📋 Detaljert logg med alle registreringer
- 🔒 Personvernmerknader (for miljøarbeider)

## Malforskjeller

### Standard-mal
**Målgruppe**: Konsulenter, timebaserte arbeidere

**Fokus**: Arbeidstimer og møter

**Statistikk**:
- Totalt antall timer
- Arbeidsdager
- Arbeid (økter)
- Møter (møter)

**Logg-kolonner**:
- Dato
- Inn
- Ut
- Pause
- Aktivitet
- Tittel
- Prosjekt
- Sted

### Miljøarbeider-mal
**Målgruppe**: Sosialarbeidere, miljøarbeidere, støttepersoner

**Fokus**: Klientmøter og aktiviteter

**Statistikk**:
- Totalt antall timer
- Arbeidsdager
- Aktiviteter
- Klientmøter

**Logg-kolonner**:
- Dato
- Tid (timeintervall)
- Varighet (timer)
- Type (Aktivitet/Klientmøte)
- Beskrivelse
- Klient
- Sted
- Notater

**Spesielt**:
- Inkluderer personvernmerknader øverst i rapporten
- Viser notater-kolonnen (nyttig for kontekstuell informasjon)
- Fokuserer på varighet fremfor inn/ut-tid

## Personvernretningslinjer for Miljøarbeider

### 🔒 GDPR-krav
Rapporter for miljøarbeidere **skal ikke** inneholde navn eller personidentifiserbar informasjon. Dette er ikke tillatt i Tidum.

### Retningslinjer

#### ❌ IKKE bruk:
- **Navn** på personer
- **Fødselsdato** eller eksakt alder
- **Adresser** eller spesifikke steder
- **Unike detaljer** som kan identifisere personer
- **Sensitive personopplysninger**

#### ✅ BRUK i stedet:
- **Generelle betegnelser**:
  - "Gutten" / "Jenta"
  - "Brukeren" / "Personen"
  - "Ungdommen"
  - "Vedkommende"
  
- **Aldersgrupper** (hvis nødvendig):
  - "Ung person"
  - "Ungdom"
  - "Voksen"
  
- **Generelle beskrivelser**:
  - "Møte med bruker om hverdagsmestring"
  - "Aktivitet for sosial utvikling"
  - "Oppfølgingssamtale"

#### Eksempler

**❌ FEIL:**
> "Møte med Mohammed Ali (15) på Grünerløkka om rusutfordringer"

**✅ RIKTIG:**
> "Møte med ungdom om hverdagsmestring"

**❌ FEIL:**
> "Hjemmebesøk hos Emma på Tøyen. Jobbet med matrutiner og økonomi."

**✅ RIKTIG:**
> "Hjemmebesøk med fokus på ADL-trening og økonomiforståelse"

### Automatisk personvernmerknader
Miljøarbeider-rapporter inkluderer automatisk følgende tekst øverst:

> **PERSONVERN**: Navn og personlig informasjon er ikke tillatt i Tidum. Denne rapporten skal ikke inneholde personidentifiserbar informasjon i tråd med GDPR-krav. Personer omtales med generelle betegnelser.

## Brukergrensesnitt

### Veiledning i composer
Når miljøarbeider-mal velges, vises en gul informasjonsboks med:
- ⚠️ Tydelig advarsel om personvern
- 📋 Liste over hva som skal unngås
- ✅ Forslag til anonymisering
- 📖 Lenke til GDPR-informasjon

### Placeholder-tekst
Tekstfeltene har malspesifikk placeholder-tekst:
- Standard: Generell veiledning
- Miljøarbeider: Inkluderer personvernpåminnelser

## API-endepunkt

### POST /api/reports/generate

**Body**:
```json
{
  "month": "202411",
  "user_id": "default",
  "template": "miljøarbeider",
  "customIntro": "Innledning her...",
  "customNotes": "Tilleggsnotater her..."
}
```

**Response**:
```json
{
  "success": true,
  "documentId": "abc123...",
  "documentUrl": "https://docs.google.com/document/d/abc123.../edit",
  "message": "Rapport opprettet for november 2024",
  "reportType": "miljøarbeider",
  "stats": {
    "totalHours": 152.5,
    "workDays": 20,
    "meetings": 12,
    "workSessions": 35,
    "logCount": 47
  }
}
```

## Brukerflyt

1. **Åpne composer**
   - Klikk "Skriv rapport" i "Skriv en rapport for måneden"-seksjonen

2. **Velg mal**
   - Velg fra dropdown: Automatisk/Standard/Miljøarbeider
   - Les veiledningen som vises

3. **Se personvernretningslinjer** (hvis miljøarbeider)
   - Gul informasjonsboks med retningslinjer
   - Les nøye før du skriver

4. **Skriv innledning** (valgfritt)
   - Bruk tekstfeltet for egendefinert intro
   - Følg placeholder-eksempelet
   - Husk anonymisering (miljøarbeider)

5. **Forhåndsvis innhold**
   - Se hva som inkluderes i rapporten
   - Bekreft at alt ser riktig ut

6. **Legg til notater** (valgfritt)
   - Bruk tekstfeltet for tilleggsnotater
   - Fokuser på generelle mønstre (miljøarbeider)

7. **Generer rapport**
   - Klikk "Generer Google Docs rapport"
   - Rapporten åpnes i ny fane
   - Kan redigeres videre i Google Docs

## Tekniske detaljer

### OAuth-scopes
- `auth/documents`: For å opprette og redigere Google Docs
- `auth/userinfo.email`: For å identifisere bruker

### Token-håndtering
- Automatisk refresh av utløpte tokens
- Sikker lagring i database
- Feilhåndtering med brukervenlige meldinger

### Rapportgenerering
- Bruker Google Docs API v1
- Batch-oppdatering av dokumentinnhold
- Tab-separerte kolonner for ryddig formatering
- Reversert request-rekkefølge for korrekt innholdsposisjonering

## Fremtidige forbedringer

Potensielle utvidelser:
- 📊 Diagram og visualiseringer
- 🎨 Mer avansert formatering (fet tekst, farger)
- 📎 Vedlegg og bilder
- 🔄 Mal-lagring og gjenbruk
- 🌐 Flerspråklig støtte
- 📧 Automatisk e-postutsending
- 📅 Planlagt rapportgenerering

## Support

Ved spørsmål eller problemer:
1. Sjekk at Google-kontoen er tilkoblet
2. Verifiser at du har logger for den valgte måneden
3. Sjekk at prosjektinformasjon er komplett
4. Se konsolllogger for tekniske feil
