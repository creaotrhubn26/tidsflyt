/**
 * scripts/seed-barnevern-demo.ts
 *
 * Krav 31: norsk demonstrasjonsdatasett for barnevernsvertikalen —
 * gjør 2-timers demoen kjørbar mot en hvilken som helst base (inkl.
 * frisk push+migrasjons-etablert). Idempotent: sletter og gjenskaper
 * demo-kommunen «Demo kommune (barnevern)» hver kjøring; rører ALDRI
 * andre kommuner.
 *
 * Bruk: DATABASE_URL=... TIDUM_SECRET_KEY=... npx tsx scripts/seed-barnevern-demo.ts
 *
 * Innlogging etterpå (custom-auth): brukerne under opprettes med
 * passord-hash fra DEMO_PASSORD (default 'Demo1234!').
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "../server/db";
import { withKommuneRlsContext, withSystemRlsContext } from "../server/lib/database-rls-context";
import { registerFrist } from "../server/lib/frist-engine";

const DEMO_ORGNR = "999888777";
const DEMO_PASSORD = process.env.DEMO_PASSORD || "Demo1234!";

async function slettEksisterendeDemo(): Promise<void> {
  const { rows: [eksisterende] } = await pool.query(
    `SELECT id FROM tidum_kommuner WHERE org_nummer = $1`, [DEMO_ORGNR],
  );
  if (!eksisterende) return;
  const kommuneId = eksisterende.id;
  await withSystemRlsContext("demo_seed_cleanup", async (client) => {
    // Barnetabellene CASCADEr fra sak/melding/forebyggende (migrasjon 099).
    await client.query(`DELETE FROM tidum_frister WHERE kommune_id = $1`, [kommuneId]);
    await client.query(`DELETE FROM tidum_barnevernsregister_innsendinger WHERE kommune_id = $1`, [kommuneId]);
    await client.query(`DELETE FROM tidum_barnevern_oppgaver WHERE kommune_id = $1`, [kommuneId]);
    await client.query(`DELETE FROM tidum_barnevern_saker WHERE kommune_id = $1`, [kommuneId]);
    await client.query(`DELETE FROM tidum_barnevern_meldinger WHERE kommune_id = $1`, [kommuneId]);
    await client.query(`DELETE FROM tidum_barnevern_forebyggende WHERE kommune_id = $1`, [kommuneId]);
    await client.query(`DELETE FROM tidum_sms_utboks WHERE kommune_id = $1`, [kommuneId]);
  });
  await pool.query(`DELETE FROM tidum_barnevern_tilgangslogg WHERE kommune_id = $1`, [kommuneId]).catch(() => {});
  await pool.query(`DELETE FROM users WHERE kommune_id = $1`, [kommuneId]);
  await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [kommuneId]);
  console.log("Fjernet eksisterende demodata.");
}

async function main(): Promise<void> {
  await slettEksisterendeDemo();

  const { rows: [kommune] } = await pool.query(
    `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer)
     VALUES ('Demo kommune (barnevern)', $1, '3099') RETURNING id`,
    [DEMO_ORGNR],
  );
  const kommuneId: number = kommune.id;
  const hash = await bcrypt.hash(DEMO_PASSORD, 10);

  const brukere = [
    { id: "demo-leder", navn: ["Liv", "Ledersen"], rolle: "barnevernsleder" },
    { id: "demo-saksbehandler", navn: ["Kari", "Saksbehandler"], rolle: "kommune_saksbehandler" },
    { id: "demo-saksbehandler-2", navn: ["Per", "Olsen"], rolle: "kommune_saksbehandler" },
    { id: "demo-kommune-admin", navn: ["Adam", "Admin"], rolle: "kommune_admin" },
  ];
  for (const b of brukere) {
    await pool.query(
      `INSERT INTO users (id, username, password, email, first_name, last_name, kommune_id, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [b.id, `${b.id}@demo.tidum.no`, hash, `${b.id}@demo.tidum.no`, b.navn[0], b.navn[1], kommuneId, b.rolle],
    );
  }

  await withKommuneRlsContext(kommuneId, async (client) => {
    const nesteMeldingsnr = async () =>
      `BVM-3099-${(await client.query(`SELECT nextval('tidum_barnevern_meldingsnummer_seq') AS n`)).rows[0].n}`;
    const nesteSaksnr = async () =>
      `BVS-3099-${(await client.query(`SELECT nextval('tidum_barnevern_saksnummer_seq') AS n`)).rows[0].n}`;

    const nyMelding = async (felter: {
      kategori: string; beskrivelse: string; barnNavn?: string; fnr?: string;
      prioritet?: string; ufodt?: boolean; termindato?: string; status?: string;
      mottattDagerSiden?: number; tildelt?: string; melderNavn?: string;
    }) => {
      const mottatt = new Date(Date.now() - (felter.mottattDagerSiden ?? 0) * 86400000);
      const fristTimer = felter.prioritet === "akutt" ? 24 : 168;
      const frist = new Date(mottatt.getTime() + fristTimer * 3600000);
      const { rows: [m] } = await client.query(
        `INSERT INTO tidum_barnevern_meldinger
           (kommune_id, meldingsnummer, kilde, mottatt_dato, melder_kategori, melder_navn,
            barn_navn, barn_fodselsnummer, beskrivelse, avklaringsfrist, prioritet,
            ufodt_barn, termindato, status, tildelt_saksbehandler_id,
            avklart_dato, avklart_av_user_id)
         VALUES ($1, $2, 'manuell', $3, $4, $5, $6, $7, $8, $9, $10::tidum_barnevern_melding_prioritet, $11, $12, $13::tidum_barnevern_melding_status, $14,
                 CASE WHEN $13::text IN ('henlagt', 'sendt_til_undersokelse') THEN NOW() END,
                 CASE WHEN $13::text IN ('henlagt', 'sendt_til_undersokelse') THEN 'demo-leder' END)
         RETURNING id`,
        [
          kommuneId, await nesteMeldingsnr(), mottatt, felter.kategori, felter.melderNavn ?? null,
          felter.barnNavn ?? null, felter.fnr ?? null, felter.beskrivelse, frist,
          felter.prioritet ?? "normal", felter.ufodt ?? false, felter.termindato ?? null,
          felter.status ?? "mottatt", felter.tildelt ?? null,
        ],
      );
      if ((felter.status ?? "mottatt") === "mottatt" || felter.status === "under_avklaring") {
        await registerFrist({
          entityType: "barnevern_melding", entityId: m.id, kommuneId,
          fristType: "avklaring", dueAt: frist, notifyUserId: felter.tildelt ?? "demo-leder",
        }, client);
      }
      return m.id as string;
    };

    // Meldinger i alle tilstander (krav 1-demoen).
    await nyMelding({
      kategori: "politi", beskrivelse: "Akutt bekymring etter hendelse i hjemmet i natt. Politiet rykket ut kl. 02:30.",
      barnNavn: "Emma Demodatter", prioritet: "akutt", mottattDagerSiden: 0, melderNavn: "Operasjonssentralen",
    });
    await nyMelding({
      kategori: "skole", beskrivelse: "Kontaktlærer melder om høyt udokumentert fravær og bekymringsfull endring i adferd siste to måneder.",
      barnNavn: "Noah Demosen", status: "under_avklaring", tildelt: "demo-saksbehandler", mottattDagerSiden: 3,
      melderNavn: "Fjellveien skole",
    });
    await nyMelding({
      kategori: "helsepersonell", beskrivelse: "Jordmor melder bekymring for rusbruk i svangerskapet.",
      ufodt: true, termindato: "2026-11-20", status: "under_avklaring", tildelt: "demo-saksbehandler", mottattDagerSiden: 5,
      melderNavn: "Helsestasjonen",
    });
    const henlagtId = await nyMelding({
      kategori: "familie_nabo", beskrivelse: "Nabo melder om krangling. Avklart som åpenbart grunnløs etter samtale.",
      barnNavn: "Sofie Demodatter", status: "henlagt", mottattDagerSiden: 12,
    });
    await client.query(
      `UPDATE tidum_barnevern_meldinger SET henleggelse_begrunnelse = 'Åpenbart grunnløs — enkeltstående nabokonflikt uten holdepunkter.' WHERE id = $1`,
      [henlagtId],
    );

    // Saker i alle faser (krav 2), med journal/plan/dokument/oppgave/innsyn.
    const nySak = async (felter: {
      barnNavn: string; fnr: string; fase: string; tildelt: string;
      opprettetDagerSiden: number; meldingBeskrivelse: string;
    }) => {
      const meldingId = await nyMelding({
        kategori: "skole", beskrivelse: felter.meldingBeskrivelse,
        barnNavn: felter.barnNavn, fnr: felter.fnr,
        status: "sendt_til_undersokelse", tildelt: felter.tildelt,
        mottattDagerSiden: felter.opprettetDagerSiden + 4,
      });
      const opprettet = new Date(Date.now() - felter.opprettetDagerSiden * 86400000);
      const undersokelsesfrist = new Date(opprettet.getTime() + 90 * 86400000);
      const avsluttende = felter.fase === "avsluttet" || felter.fase === "henlagt";
      const { rows: [sak] } = await client.query(
        `INSERT INTO tidum_barnevern_saker
           (kommune_id, saksnummer, melding_id, barn_navn, barn_fodselsnummer, fase,
            tildelt_saksbehandler_id, undersokelsesfrist, created_at,
            avsluttet_dato, avsluttet_av_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                 CASE WHEN $10 THEN NOW() END, CASE WHEN $10 THEN 'demo-leder' END)
         RETURNING id`,
        [
          kommuneId, await nesteSaksnr(), meldingId, felter.barnNavn, felter.fnr,
          felter.fase, felter.tildelt, undersokelsesfrist, opprettet, avsluttende,
        ],
      );
      const sakId: string = sak.id;
      await client.query(
        `INSERT INTO tidum_barnevern_sak_fase_historikk (sak_id, kommune_id, fra_fase, til_fase, begrunnelse, endret_av_user_id, created_at)
         VALUES ($1, $2, NULL, 'undersokelse', 'Opprettet fra bekymringsmelding', $3, $4)`,
        [sakId, kommuneId, felter.tildelt, opprettet],
      );
      if (felter.fase !== "undersokelse") {
        await client.query(
          `INSERT INTO tidum_barnevern_sak_fase_historikk (sak_id, kommune_id, fra_fase, til_fase, begrunnelse, endret_av_user_id)
           VALUES ($1, $2, 'undersokelse', $3, $4, 'demo-leder')`,
          [sakId, kommuneId, felter.fase === "avsluttet" ? "tiltak" : felter.fase,
           "Undersøkelsen konkludert etter helhetsvurdering."],
        );
      }
      if (felter.fase === "avsluttet") {
        await client.query(
          `INSERT INTO tidum_barnevern_sak_fase_historikk (sak_id, kommune_id, fra_fase, til_fase, begrunnelse, endret_av_user_id)
           VALUES ($1, $2, 'tiltak', 'avsluttet', 'Tiltakene har hatt ønsket effekt; familien klarer seg uten videre oppfølging.', 'demo-leder')`,
          [sakId, kommuneId],
        );
      }
      if (felter.fase === "undersokelse") {
        await registerFrist({
          entityType: "barnevern_sak", entityId: sakId, kommuneId,
          fristType: "undersokelse", dueAt: undersokelsesfrist, notifyUserId: felter.tildelt,
        }, client);
      }
      return sakId;
    };

    const undersokelseSak = await nySak({
      barnNavn: "Noah Demosen", fnr: "15038712345", fase: "undersokelse",
      tildelt: "demo-saksbehandler", opprettetDagerSiden: 20,
      meldingBeskrivelse: "Skolen melder vedvarende bekymring; avklaringen konkluderte med undersøkelse.",
    });
    const tiltakSak = await nySak({
      barnNavn: "Lukas Demoson", fnr: "22069811223", fase: "tiltak",
      tildelt: "demo-saksbehandler", opprettetDagerSiden: 75,
      meldingBeskrivelse: "Helsesykepleier meldte bekymring for omsorgssituasjonen.",
    });
    await nySak({
      barnNavn: "Ida Demodatter", fnr: "03019955667", fase: "avsluttet",
      tildelt: "demo-saksbehandler-2", opprettetDagerSiden: 200,
      meldingBeskrivelse: "Barnehagen meldte bekymring; saken er nå avsluttet etter vellykkede tiltak.",
    });

    // Journal på undersøkelsessaken.
    for (const [kategori, innhold, dagerSiden] of [
      ["telefonsamtale", "Oppstartssamtale med mor. Avtalt hjemmebesøk neste uke.", 18],
      ["hjemmebesok", "Hjemmebesøk gjennomført. Ryddige forhold; barnet virket trygt, men foreldrene beskriver høyt konfliktnivå.", 12],
      ["samtale_med_barnet", "Samtale med Noah på skolen. Han forteller at han gruer seg til å dra hjem når far er sint.", 6],
    ] as const) {
      await client.query(
        `INSERT INTO tidum_barnevern_sak_journal (sak_id, kommune_id, kategori, innhold, forfatter_user_id, created_at)
         VALUES ($1, $2, $3, $4, 'demo-saksbehandler', NOW() - ($5 || ' days')::interval)`,
        [undersokelseSak, kommuneId, kategori, innhold, String(dagerSiden)],
      );
    }

    // Godkjent tiltaksplan med tiltak på tiltakssaken (krav 5).
    const { rows: [plan] } = await client.query(
      `INSERT INTO tidum_barnevern_planer
         (kommune_id, sak_id, plantype, versjon, status, formaal, deltakere, evalueringsfrist,
          godkjent_av, godkjent_dato, opprettet_av)
       VALUES ($1, $2, 'tiltaksplan', 1, 'godkjent',
               'Stabilisere hjemmesituasjonen og sikre skolegang.',
               $3, NOW() + interval '45 days', 'demo-leder', NOW() - interval '30 days', 'demo-saksbehandler')
       RETURNING id`,
      [kommuneId, tiltakSak, JSON.stringify([
        { navn: "Mona Demoson (mor)", rolle: "forelder" },
        { navn: "Kari Saksbehandler", rolle: "saksbehandler" },
      ])],
    );
    for (const [beskrivelse, ansvarlig, status] of [
      ["Miljøterapeut i hjemmet to ettermiddager i uken", "Kari Saksbehandler", "pagar"],
      ["Foreldreveiledningskurs (COS-P)", "Familievernkontoret", "pagar"],
      ["Støttekontakt for Lukas annenhver helg", "Kari Saksbehandler", "planlagt"],
    ] as const) {
      await client.query(
        `INSERT INTO tidum_barnevern_plan_tiltak (plan_id, kommune_id, beskrivelse, ansvarlig, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [plan.id, kommuneId, beskrivelse, ansvarlig, status],
      );
    }
    await registerFrist({
      entityType: "barnevern_plan", entityId: plan.id, kommuneId,
      fristType: "evaluering", dueAt: new Date(Date.now() + 45 * 86400000), notifyUserId: "demo-saksbehandler",
    }, client);

    // Ekspedert vedtak (krav 6) — journalføres slik ekspederingsruta gjør.
    const { rows: [vedtakJournal] } = await client.query(
      `INSERT INTO tidum_barnevern_sak_journal (sak_id, kommune_id, kategori, innhold, forfatter_user_id)
       VALUES ($1, $2, 'vedtak', 'Vedtak om hjelpetiltak — ekspedert via sikker dialog til Mona Demoson.', 'demo-leder')
       RETURNING id`,
      [tiltakSak, kommuneId],
    );
    await client.query(
      `INSERT INTO tidum_barnevern_dokumenter
         (kommune_id, sak_id, dokumenttype, mal_id, tittel, hjemmel, innhold, mottaker, plan_id,
          status, godkjent_av, godkjent_dato, ekspedert_dato, ekspedert_via, journal_entry_id, opprettet_av)
       VALUES ($1, $2, 'vedtak', 'vedtak_hjelpetiltak', 'Vedtak om hjelpetiltak', 'barnevernsloven § 3-1',
               'VEDTAK I BARNEVERNSSAK — med hjemmel i barnevernsloven § 3-1 innvilges hjelpetiltak i henhold til gjeldende tiltaksplan. Vedtaket kan påklages til statsforvalteren innen tre uker.',
               $3, $4, 'ekspedert', 'demo-leder', NOW() - interval '29 days', NOW() - interval '28 days',
               'sikker_dialog', $5, 'demo-saksbehandler')`,
      [kommuneId, tiltakSak, JSON.stringify({ navn: "Mona Demoson" }), plan.id, vedtakJournal.id],
    );

    // Oppgaver (krav 3) — én åpen med frist, én fullført.
    const { rows: [oppgave] } = await client.query(
      `INSERT INTO tidum_barnevern_oppgaver
         (kommune_id, entity_type, entity_id, tittel, tildelt_user_id, opprettet_av, frist)
       VALUES ($1, 'sak', $2, 'Innhent uttalelse fra skolen før undersøkelsesmøtet', 'demo-saksbehandler', 'demo-leder', NOW() + interval '4 days')
       RETURNING id`,
      [kommuneId, undersokelseSak],
    );
    await registerFrist({
      entityType: "barnevern_oppgave", entityId: oppgave.id, kommuneId,
      fristType: "oppgave", dueAt: new Date(Date.now() + 4 * 86400000), notifyUserId: "demo-saksbehandler",
    }, client);
    await client.query(
      `INSERT INTO tidum_barnevern_oppgaver
         (kommune_id, entity_type, entity_id, tittel, tildelt_user_id, opprettet_av, status, fullfort_dato, fullfort_av)
       VALUES ($1, 'sak', $2, 'Avtal oppstartsmøte med foreldrene', 'demo-saksbehandler', 'demo-leder', 'fullfort', NOW() - interval '15 days', 'demo-saksbehandler')`,
      [kommuneId, undersokelseSak],
    );

    // Innsynsbegjæring under behandling (krav 16).
    const { rows: [innsyn] } = await client.query(
      `INSERT INTO tidum_barnevern_innsynskrav
         (kommune_id, sak_id, part_navn, part_relasjon, behandlingsfrist, opprettet_av)
       VALUES ($1, $2, 'Mona Demoson', 'forelder', NOW() + interval '3 days', 'demo-saksbehandler')
       RETURNING id`,
      [kommuneId, tiltakSak],
    );
    await registerFrist({
      entityType: "barnevern_innsynskrav", entityId: innsyn.id, kommuneId,
      fristType: "innsyn", dueAt: new Date(Date.now() + 3 * 86400000), notifyUserId: "demo-saksbehandler",
    }, client);

    // Forebyggende arbeid med aktiviteter (krav 18).
    const { rows: [forebyggende] } = await client.query(
      `INSERT INTO tidum_barnevern_forebyggende
         (kommune_id, tittel, beskrivelse, kategori, samarbeidsparter, ansvarlig_user_id, start_dato, status)
       VALUES ($1, 'Foreldreveiledningskurs høst 2026', 'Åpent kurs i samarbeid med helsestasjonen og skolene.',
               'program', $2, 'demo-leder', '2026-09-01', 'pagar')
       RETURNING id`,
      [kommuneId, JSON.stringify([
        { navn: "Helsestasjonen", type: "helsestasjon" },
        { navn: "Fjellveien skole", type: "skole" },
      ])],
    );
    for (const [dato, beskrivelse, deltakere] of [
      ["2026-09-10", "Første kurskveld: trygghetssirkelen", 14],
      ["2026-09-17", "Andre kurskveld: grensesetting", 16],
    ] as const) {
      await client.query(
        `INSERT INTO tidum_barnevern_forebyggende_aktiviteter
           (forebyggende_id, kommune_id, dato, beskrivelse, antall_deltakere, registrert_av)
         VALUES ($1, $2, $3, $4, $5, 'demo-leder')`,
        [forebyggende.id, kommuneId, dato, beskrivelse, deltakere],
      );
    }
  });

  console.log(`
Demodata klart for «Demo kommune (barnevern)» (kommunenummer 3099).

Innlogging (passord: ${DEMO_PASSORD}):
  demo-leder@demo.tidum.no            Barnevernsleder
  demo-saksbehandler@demo.tidum.no    Saksbehandler (tildelt sakene)
  demo-saksbehandler-2@demo.tidum.no  Saksbehandler (need-to-know-demo)
  demo-kommune-admin@demo.tidum.no    Kommuneadministrator (ingen saksinnsyn)

Innhold: 4 meldinger (akutt/under avklaring/ufødt/henlagt) + 3 saker
(undersøkelse m/journal+oppgaver, tiltak m/godkjent plan+ekspedert vedtak
+innsynskrav, avsluttet), forebyggende program m/aktiviteter, frister i
fristmotoren. Kjør gjerne innrapportering fra leder-UI-et for BVR-demo.
`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed feilet:", err);
  process.exit(1);
});
