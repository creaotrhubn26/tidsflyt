# Barnevern: Meldingsmottak — design (delprosjekt 2 av 4 for vedtak-funksjonen)

**Status:** Godkjent av bruker 2026-08-23, klar for implementeringsplan.
**Bygger på:** [Kommune-tenant og roller (delprosjekt 1)](2026-08-23-kommune-tenant-roller-design.md) — `tidum_kommuner`, `users.kommuneId`, rollene `barnevernsleder`/`kommune_saksbehandler`, Entra ID SSO.
**Henger sammen med:** [Veikart barnevern-vertikal](../../veikart-barnevern-vertikal.md) fase 3, punkt 1 (Meldingsmottak) og punkt 2 (Undersøkelse — fristmotoren denne spesifikasjonen bygger er ment gjenbrukt der).

## 1. Hva dette dekker

Mottak og avklaring av bekymringsmeldinger til kommunal barneverntjeneste (bvl. § 2-1): manuell registrering, tildeling til saksbehandler, 1-ukes avklaringsfrist med eskalerende varsler, og beslutning (henleggelse med begrunnelse, eller videresending til undersøkelse). I tillegg: et transportlag for fremtidig Fiks IO-mottak (KS' meldingskø-plattform for "Nasjonal portal for bekymringsmelding"), bevisst begrenset i omfang — se § 5.

Selve undersøkelsen (bvl. § 2-2) er delprosjekt 3, ikke denne spesifikasjonen. Denne spesifikasjonen leverer kun frem til og med beslutningen "send til undersøkelse" — ikke undersøkelsens eget innhold.

## 2. Global Constraints

- Ny, dedikert tabell for meldinger — **ikke** gjenbruk av `tidum_saker` (den har `NOT NULL vendorId`/`tiltakslederId`, er tydelig utfører-side/tiltaksbedrift-bundet, jf. `shared/schema.ts:2000-2018`).
- All lesing/skriving av en melding skal håndheve `req.user.kommuneId === melding.kommuneId`. Ingen global "kommune-admin"-rolle finnes som skal kunne bypasse dette (i motsetning til `super_admin` på vendor-siden) — streng match, ingen unntak, med mindre en fremtidig rolle eksplisitt endrer dette.
- Fristmotoren (§ 4) er en generisk, gjenbrukbar modul — ikke bygget kun for avklaringsfristen. Delprosjekt 3 skal kunne registrere nye `fristType`-verdier uten endring i motorens kjerne.
- Fiks IO-transportlaget (§ 5) implementeres KUN mot offentlig dokumenterte deler (Maskinporten-tokenutveksling). Der protokolldetaljer ikke er offentlig dokumentert (AMQP-legitimasjonsutveksling, meldingskonvoluttens feltnavn, selve bekymringsmeldingens innholdsskjema), skal koden IKKE gjette — den skal logge råpayload uendret og eksplisitt markere parsing som ugjort, med kildehenvisning i kommentar til hvorfor. Se § 5.4 for fullstendig liste over kjente hull.
- Alle nye hemmeligheter (Fiks IO privatnøkkel) krypteres med eksisterende `sealSecret`/`openSecret` (`server/lib/secret-box.ts`) — samme mønster som `archiveConfigs.clientSecret`. Aldri lagre i klartekst.
- Alle nye tabeller får `tidum_`-prefiks (etablert konvensjon siden tabell-omdøpingen, unntatt `archive_*`-tabellene som bevisst ble utelatt — ikke gjenta det unntaket her).
- PII (barnets fødselsnummer/navn, melders identitet): lagres som vanlige, tilgangskontrollerte kolonner (samme nivå som eksisterende rapport-/sak-innhold) — dette er saksinnhold, ikke en autentiseringshemmelighet, og skal derfor IKKE hashes slik `expectedSsnHash`/`eidIdentities.ssnHash` gjør for eID-identitet. Tilgang kontrolleres av kommuneId-scoping, ikke av hashing.

## 3. Datamodell

### 3.1 `tidum_barnevern_meldinger`

```ts
export const barnevernMeldingStatusEnum = pgEnum("tidum_barnevern_melding_status", [
  "mottatt",
  "under_avklaring",
  "henlagt",
  "sendt_til_undersokelse",
]);

export const barnevernMeldingKildeEnum = pgEnum("tidum_barnevern_melding_kilde", [
  "manuell",
  "fiks_io",
]);

export const barnevernMeldinger = pgTable("tidum_barnevern_meldinger", {
  id: uuid("id").defaultRandom().primaryKey(),
  kommuneId: integer("kommune_id").notNull().references(() => kommuner.id),
  meldingsnummer: text("meldingsnummer").notNull().unique(),
  kilde: barnevernMeldingKildeEnum("kilde").notNull().default("manuell"),
  mottattDato: timestamp("mottatt_dato", { withTimezone: true }).notNull(),
  melderKategori: text("melder_kategori").notNull(), // skole|barnehage|helsepersonell|politi|nav|familie_nabo|anonym|annet
  melderNavn: text("melder_navn"),
  melderKontakt: text("melder_kontakt"),
  barnFodselsnummer: text("barn_fodselsnummer"),
  barnNavn: text("barn_navn"),
  beskrivelse: text("beskrivelse").notNull(),
  status: barnevernMeldingStatusEnum("status").notNull().default("mottatt"),
  tildeltSaksbehandlerId: varchar("tildelt_saksbehandler_id").references(() => users.id),
  avklaringsfrist: timestamp("avklaringsfrist", { withTimezone: true }).notNull(),
  avklartDato: timestamp("avklart_dato", { withTimezone: true }),
  avklartAvUserId: varchar("avklart_av_user_id").references(() => users.id),
  henleggelseBegrunnelse: text("henleggelse_begrunnelse"),
  fiksMeldingId: text("fiks_melding_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("tidum_barnevern_meldinger_kommune_idx").on(table.kommuneId, table.status),
]);
```

`meldingsnummer` genereres server-side ved opprettelse: `BVM-<kommunenummer>-<løpenummer>`. Løpenummer hentes fra en dedikert Postgres-sekvens per kommune (`CREATE SEQUENCE tidum_barnevern_meldingsnummer_seq_<kommuneId>` opprettet lazy ved kommunens første melding, eller én delt sekvens `tidum_barnevern_meldingsnummer_seq` med global neste-verdi hvis per-kommune-sekvenser blir upraktisk mange — implementeringsplanen avgjør basert på hvor mange kommuner som faktisk er aktive). `nextval()` er atomisk og krever ingen eksplisitt `SELECT ... FOR UPDATE`-håndtering.

`henleggelseBegrunnelse` er NOT NULL i databasen ikke håndhevet — håndheves i applikasjonskode (ruten som setter `status = 'henlagt'` krever feltet, returnerer 400 uten). Dette speiler hvordan `sakerStatusEnum`-relaterte krav håndheves andre steder (ingen DB-CHECK-constraints for tverrfelt-betingelser i denne kodebasen).

### 3.2 `tidum_barnevern_melding_vedlegg`

```ts
export const barnevernMeldingVedlegg = pgTable("tidum_barnevern_melding_vedlegg", {
  id: uuid("id").defaultRandom().primaryKey(),
  meldingId: uuid("melding_id").notNull().references(() => barnevernMeldinger.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Speiler `sakJournalAttachments` (`shared/schema.ts:2087-2096`) nøyaktig i form.

## 4. Fristmotor (generisk, delt med fremtidige delprosjekter)

### 4.1 `tidum_frister`

```ts
export const fristStatusEnum = pgEnum("tidum_frist_status", [
  "aktiv",
  "oppfylt",
  "brutt",
  "kansellert",
]);

export const frister = pgTable("tidum_frister", {
  id: uuid("id").defaultRandom().primaryKey(),
  entityType: text("entity_type").notNull(), // f.eks. "barnevern_melding"
  entityId: text("entity_id").notNull(),
  kommuneId: integer("kommune_id").references(() => kommuner.id),
  vendorId: integer("vendor_id").references(() => vendors.id),
  fristType: text("frist_type").notNull(), // f.eks. "avklaring"
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  status: fristStatusEnum("status").notNull().default("aktiv"),
  varsletOffsets: integer("varslet_offsets").array().notNull().default(sql`'{}'::integer[]`),
  notifyUserId: varchar("notify_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("tidum_frister_active_idx").on(table.status, table.dueAt),
  uniqueIndex("tidum_frister_entity_type_key").on(table.entityType, table.entityId, table.fristType),
]);
```

Nøyaktig én av `kommuneId`/`vendorId` er satt (håndheves i applikasjonskode, speiler `users.vendorId`/`users.kommuneId`-mønsteret fra delprosjekt 1 — ikke en DB CHECK-constraint, samme stil som resten av kodebasen).

### 4.2 `server/lib/frist-engine.ts`

```ts
export const FRIST_TYPE_CONFIG: Record<string, { escalationOffsetDays: number[] }> = {
  avklaring: { escalationOffsetDays: [-2, 0, 1, 3] }, // 2 dager før, på dagen, 1/3 dager etter
};

export async function registerFrist(params: {
  entityType: string;
  entityId: string;
  kommuneId?: number;
  vendorId?: number;
  fristType: string;
  dueAt: Date;
  notifyUserId?: string;
}): Promise<void>;

export async function cancelFrist(entityType: string, entityId: string, fristType: string): Promise<void>;

export async function runFristEscalations(now: Date = new Date()): Promise<{ notified: number; expired: number }>;
```

`runFristEscalations` itererer over alle `status = 'aktiv'`-rader. For hver rad: beregn `daysDiff = round((now - dueAt) / 86400000)`. For hvert offset i `FRIST_TYPE_CONFIG[fristType].escalationOffsetDays` som er `<= daysDiff` og IKKE allerede i `varsletOffsets`: send varsel via eksisterende `createNotification` (`server/routes/notification-routes.ts:11-33`) til `notifyUserId`, legg offset til `varsletOffsets`. Motoren endrer ALDRI `status` selv til `brutt`/`oppfylt` — det er domenespesifikk logikk (f.eks. meldings-ruten kansellerer sin egen frist ved henleggelse/videresending via `cancelFrist`). Dette holder motoren generisk: den vet ingenting om hva en "melding" er.

Cron: `server/routes/frist-escalation-cron.ts` (nytt), speiler `task-escalation-cron.ts:32-78` i struktur, kaller `runFristEscalations()` daglig.

### 4.3 Bruk i meldingsmottak

Ved opprettelse av en melding: `registerFrist({ entityType: "barnevern_melding", entityId: melding.id, kommuneId, fristType: "avklaring", dueAt: mottattDato + 7 dager, notifyUserId: tildeltSaksbehandlerId })`. Ved henleggelse/videresending: `cancelFrist("barnevern_melding", melding.id, "avklaring")`.

## 5. Fiks IO — transportlag (bevisst begrenset omfang)

### 5.1 Hva som ER offentlig dokumentert og bygges nå

- Maskinporten-tokenutveksling (JWT-grant mot virksomhetssertifikat, scope `ks:fiks`) — dette er en generell Digdir-standard (samme familie som ID-porten), godt dokumentert, implementeres med tillit.
- Kontokonfigurasjon per kommune: `tidum_kommuner` får nye, nullable kolonner `fiksKontoId` (text), `fiksPrivateKeyEncrypted` (text, `sealSecret`'et PKCS#8-nøkkel), `fiksCertificatePem` (text), `fiksEnabled` (boolean, default false).
- `server/fiks-io/maskinporten-client.ts`: henter access-token fra `https://maskinporten.no/token` (prod) / `https://test.maskinporten.no/token` (test), scope `ks:fiks`, signert JWT-assertion med kommunens virksomhetssertifikat-privatnøkkel.

### 5.2 Hva som IKKE er offentlig dokumentert og derfor IKKE bygges som ferdig kode

- Selve AMQP-legitimasjonsutvekslingen (hvordan Maskinporten-tokenet konkret brukes til å hente AMQP-tilgang — trolig via en separat REST-katalog-API, men eksakt endepunkt/kontrakt er ikke bekreftet offentlig).
- Meldingskonvoluttens feltnavn (avsender/mottaker-kontoId, meldingstype-streng, ekspirasjon) i selve AMQP-meldingen.
- Bekymringsmeldingens innholdsskjema (melders/barnets felt) — bekreftet ikke-offentlig, eksplisitt "avtale om bruk"-krevende (developers.fiks.ks.no).

### 5.3 Hva som bygges i stedet for det ubekreftede

`tidum_fiks_raw_intake_log`:

```ts
export const fiksRawIntakeLog = pgTable("tidum_fiks_raw_intake_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  kommuneId: integer("kommune_id").notNull().references(() => kommuner.id),
  rawPayloadEncrypted: text("raw_payload_encrypted").notNull(), // sealSecret(JSON.stringify(rå AMQP-melding))
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  processingError: text("processing_error"),
});
```

`server/fiks-io/receiver.ts`:

```ts
/**
 * STUB — bekymringsmeldingens innholdsskjema er IKKE offentlig dokumentert
 * (bekreftet mot developers.fiks.ks.no og ks-no sine offisielle klient-
 * biblioteker for Java/.NET — se docs/superpowers/specs/2026-08-23-
 * barnevern-meldingsmottak-design.md § 5.4). Denne funksjonen skal ALDRI
 * gjette feltnavn. Når KS-avtale + reelt skjema foreligger: implementer
 * parsing her, prosesser tidum_fiks_raw_intake_log-rader med
 * processedAt IS NULL (de er allerede trygt lagret og venter).
 */
export async function onBekymringsmeldingRaw(kommuneId: number, rawPayload: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO tidum_fiks_raw_intake_log (kommune_id, raw_payload_encrypted) VALUES ($1, $2)`,
    [kommuneId, sealSecret(JSON.stringify(rawPayload))],
  );
}
```

`setupFiksIoReceiver(app)` starter en AMQP-consumer PER kommune med `fiksEnabled = true` OG gyldig konfigurasjon — fullstendig inert (ingen tilkoblingsforsøk) når `FIKS_IO_ENABLED` env-flagg mangler eller ingen kommune er konfigurert, speiler `setupEntraIdAuth`s inaktiveringsmønster fra delprosjekt 1.

### 5.4 Kildehenvisninger for grensene over

- `https://developers.fiks.ks.no/tjenester/bekymringsmelding/` — eksplisitt "avtale om bruk"-krav, ingen offentlig innholdsskjema.
- `https://github.com/ks-no/fiks-io-klient-java` (README) — AMQP-vert `io.fiks.ks.no:5671`, Maskinporten-scope `ks:fiks`, `KontoKonfigurasjon` med PKCS#8-nøkkel.
- `https://github.com/ks-no/fiks-bekymringsmelding-produsent-klient` — modellklasser (`BekymringsmeldingId`, `Bydel`, `Historikk`, `Krypteringsnokler`, `Nokkel`) bekrefter at selv KS' egen produsent-klient aldri definerer innholdsskjemaet; `sendBekymringsmelding()` tar en rå, ugjennomsiktig `InputStream`.

## 6. API

Nytt filnavn: `server/routes/barnevern-melding-routes.ts`, montert i `server/routes.ts` bak samme `requireAuth`-mønster som resten av appen, med eksplisitt `kommuneId`-sjekk i hver handler (ikke en delt middleware denne runden — for få ruter til å rettferdiggjøre en ny, delt abstraksjon; vurderes i delprosjekt 3 hvis mønsteret gjentar seg over flere rutefiler).

| Metode | Sti | Rolle | Beskrivelse |
|---|---|---|---|
| POST | `/api/barnevern/meldinger` | `kommune_saksbehandler`, `barnevernsleder` | Opprett manuell melding. `kommuneId` fra `req.user.kommuneId`, ALDRI fra body. Beregner `avklaringsfrist`, registrerer frist. |
| GET | `/api/barnevern/meldinger` | samme | Liste, scoped på `req.user.kommuneId`, filter på `status` (query-param). |
| GET | `/api/barnevern/meldinger/:id` | samme | Detalj. 404 hvis `kommuneId` ikke matcher (ikke 403 — unngår å bekrefte at ID-en finnes i en annen kommune). |
| PATCH | `/api/barnevern/meldinger/:id/tildel` | `barnevernsleder` | Sett `tildeltSaksbehandlerId`, oppdater fristens `notifyUserId`. Hvis status er `mottatt`, sett den til `under_avklaring` (første tildeling markerer at avklaringsarbeidet er i gang). Ingen statusendring hvis allerede `under_avklaring` (re-tildeling). |
| POST | `/api/barnevern/meldinger/:id/henlegg` | `kommune_saksbehandler`, `barnevernsleder` | Krever `begrunnelse` i body (400 uten). Setter status, `avklartDato`, `avklartAvUserId`, kansellerer frist. |
| POST | `/api/barnevern/meldinger/:id/send-til-undersokelse` | samme | Setter status, `avklartDato`, `avklartAvUserId`, kansellerer frist. Oppretter IKKE en undersøkelse-entitet (delprosjekt 3's ansvar). |
| POST | `/api/barnevern/meldinger/:id/vedlegg` | samme | Filopplasting, gjenbruker eksisterende multer-middleware-mønster (finn og følg det faktiske mønsteret i implementeringsplanen — ikke oppfunnet her). |
| GET | `/api/barnevern/meldinger/:id/vedlegg/:vedleggId` | samme | Last ned vedlegg. |

Alle ruter: 404 (ikke 403) når raden finnes men tilhører en annen `kommuneId` — samme informasjonslekkasje-bevisste mønster som ble innført i BOLA-fiksen tidligere denne økten.

## 7. Feilhåndtering

- Manglende `begrunnelse` ved henleggelse → 400.
- Ugyldig `melderKategori` (ikke i den tillatte listen) → 400.
- `barnFodselsnummer` valideres for FORMAT (11 siffer) hvis oppgitt, ikke for MOD11-gyldighet (ingen Freg-oppslag i dette delprosjektet — det er fase 2/senere i veikartet).
- Fiks IO-mottak: enhver feil i selve AMQP-laget logges og forsøkes på nytt (ack/nack-semantikk) — payload er allerede trygt lagret i `tidum_fiks_raw_intake_log` før noe annet skjer, så en krasjende `onBekymringsmeldingRaw`-kaller mister aldri data.

## 8. Testing

- Enhetstester for `frist-engine.ts`: registrering, kansellering, eskalering (alle 4 offset-terskler, ingen dobbel-varsling ved gjentatt kjøring samme dag).
- Ruter-tester for `barnevern-melding-routes.ts`: opprett/liste/detalj/tildel/henlegg/send-til-undersøkelse, inkludert kommuneId-scoping-regresjonstest (aktør i kommune A kan IKKE se/endre en melding i kommune B — 404).
- Ingen tester for `fiks-io/receiver.ts` sin AMQP-tilkobling (kan ikke testes uten reell tilgang) — kun enhetstest for `onBekymringsmeldingRaw` sin lagringslogikk (gitt en rå payload, verifiser at raden havner riktig i `tidum_fiks_raw_intake_log`, kryptert).

## 9. Ikke i omfang

- Selve undersøkelsen (bvl. § 2-2) — delprosjekt 3.
- Fiks IO innholdsparsing — venter på KS-avtale/skjema, se § 5.
- Freg/DSF-oppslag for barnets identitet — fase 2 i veikartet.
- Partsinnsyn/innbyggerportal (melder/familie ser status på sin melding) — fase 2, krever ID-porten (ikke bygget).
- SvarUt/ekspedering — ikke relevant for mottak, kommer med vedtak-delprosjektet (delprosjekt 4).
- Dokumentgraderingsregler (kode 6/7 adressegradering) — fase 2.
