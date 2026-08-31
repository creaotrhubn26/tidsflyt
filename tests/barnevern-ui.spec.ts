/**
 * UI-flyt for kommunalt barnevern (/barnevern): registrer bekymringsmelding,
 * opprett undersøkelsessak, faseovergang og journalføring. API-et mockes med
 * tilstandsfull in-memory-modell; backend-logikken er dekket av
 * server/lib/__tests__/barnevern-*.test.ts mot ekte PostgreSQL.
 */
import { test, expect, type Page } from "@playwright/test";

const SAKSBEHANDLER = {
  id: "ksb-001",
  email: "saksbehandler@halden.kommune.no",
  name: "Kari Saksbehandler",
  firstName: "Kari",
  lastName: "Saksbehandler",
  role: "kommune_saksbehandler",
  approved: true,
};

async function mockApiFallback(page: Page) {
  await page.route(/\/api\//, async (route) => {
    const url = route.request().url();
    const arrayEndpoints = ["activities", "company/users", "notifications"];
    const isArray = arrayEndpoints.some((ep) => url.includes(ep));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(isArray ? [] : {}),
    });
  });
}

test.describe("Barnevern UI-flyt", () => {
  test("melding → undersøkelsessak → fase → journal", async ({ page }) => {
    await mockApiFallback(page);
    // Toast-viewporten (nederst) fanger pointer-events og Radix pauser
    // nedtellingen ved hover — på mobil blokkerer det knapper bak.
    // Testen trenger aldri klikke i toasts; gjør laget klikk-gjennom.
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = '[aria-label*="Notifications"] { pointer-events: none !important; } [aria-label*="Notifications"] * { pointer-events: none !important; }';
      document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
    });
    await page.route("**/api/auth/user", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SAKSBEHANDLER) }));
    await page.route("**/api/kommune/brukere", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
        { id: "sb-1", email: "sb1@k.no", navn: "Siri Saksbehandler", rolle: "kommune_saksbehandler", rolleLabel: "Saksbehandler" },
        { id: "sb-2", email: "sb2@k.no", navn: "Trond Trygg", rolle: "kommune_saksbehandler", rolleLabel: "Saksbehandler" },
      ]) }));

    // Tilstandsfull mock av barnevern-API-et.
    const meldinger: any[] = [];
    const saker: any[] = [];
    const journal: Record<string, any[]> = {};
    const planer: any[] = [];
    const dokumenter: any[] = [];
    const oppgaver: any[] = [];
    const innsynskrav: any[] = [];
    const forebyggende: any[] = [];
    const innsendinger: any[] = [];

    await page.route(/\/api\/barnevern/, async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

      if (method === "POST" && path === "/api/barnevern/meldinger") {
        const body = route.request().postDataJSON();
        const melding = {
          id: `m-${meldinger.length + 1}`,
          meldingsnummer: `BVM-3001-${meldinger.length + 1}`,
          kilde: "manuell",
          mottattDato: new Date().toISOString(),
          status: "mottatt",
          avklaringsfrist: new Date(Date.now() + (body.prioritet === "akutt" ? 24 : 168) * 3600000).toISOString(),
          avklartDato: null,
          henleggelseBegrunnelse: null,
          tildeltSaksbehandlerId: null,
          prioritet: body.prioritet ?? "normal",
          ufodtBarn: body.ufodtBarn === true,
          termindato: body.termindato ?? null,
          forelderMeldingId: null,
          soskenkopiAvMeldingId: null,
          melderNavn: body.melderNavn ?? null,
          melderKontakt: body.melderKontakt ?? null,
          barnNavn: body.barnNavn ?? null,
          barnFodselsnummer: body.barnFodselsnummer ?? null,
          melderKategori: body.melderKategori,
          beskrivelse: body.beskrivelse,
        };
        meldinger.push(melding);
        return json(melding, 201);
      }
      if (method === "GET" && path === "/api/barnevern/meldinger") return json(meldinger);
      const revMatch = path.match(/^\/api\/barnevern\/meldinger\/([^/]+)\/revisjoner$/);
      if (method === "GET" && revMatch) return json([]);
      const undersokMatch = path.match(/^\/api\/barnevern\/meldinger\/([^/]+)\/send-til-undersokelse$/);
      if (method === "POST" && undersokMatch) {
        const melding = meldinger.find((m) => m.id === undersokMatch[1]);
        melding.status = "sendt_til_undersokelse";
        const sak = {
          id: `s-${saker.length + 1}`,
          saksnummer: `BVS-3001-${saker.length + 1}`,
          meldingId: melding.id,
          barnNavn: melding.barnNavn,
          barnFodselsnummer: melding.barnFodselsnummer,
          fase: "undersokelse",
          tildeltSaksbehandlerId: null,
          undersokelsesfrist: new Date(Date.now() + 90 * 86400000).toISOString(),
          avsluttetDato: null,
          avsluttetAvUserId: null,
          createdAt: new Date().toISOString(),
          faseHistorikk: [{ fraFase: null, tilFase: "undersokelse", begrunnelse: "Opprettet fra bekymringsmelding", endretAvUserId: SAKSBEHANDLER.id, createdAt: new Date().toISOString() }],
        };
        saker.push(sak);
        journal[sak.id] = [];
        return json({ ...melding, sak: { id: sak.id, saksnummer: sak.saksnummer } });
      }
      const meldingMatch = path.match(/^\/api\/barnevern\/meldinger\/([^/]+)$/);
      if (method === "GET" && meldingMatch) {
        const melding = meldinger.find((m) => m.id === meldingMatch[1]);
        return melding ? json(melding) : json({ error: "Ikke funnet" }, 404);
      }
      if (method === "GET" && path === "/api/barnevern/saker") return json(saker);
      const journalMatch = path.match(/^\/api\/barnevern\/saker\/([^/]+)\/journal$/);
      if (journalMatch) {
        const sakId = journalMatch[1];
        if (method === "GET") return json(journal[sakId] ?? []);
        const body = route.request().postDataJSON();
        const entry = {
          id: `j-${(journal[sakId] ?? []).length + 1}`,
          kategori: body.kategori,
          innhold: body.innhold,
          correctsEntryId: body.correctsEntryId ?? null,
          forfatterUserId: SAKSBEHANDLER.id,
          createdAt: new Date().toISOString(),
        };
        (journal[sakId] ??= []).push(entry);
        return json(entry, 201);
      }
      const faseMatch = path.match(/^\/api\/barnevern\/saker\/([^/]+)\/fase$/);
      if (method === "POST" && faseMatch) {
        const sak = saker.find((s) => s.id === faseMatch[1]);
        const body = route.request().postDataJSON();
        sak.faseHistorikk.push({ fraFase: sak.fase, tilFase: body.tilFase, begrunnelse: body.begrunnelse, endretAvUserId: SAKSBEHANDLER.id, createdAt: new Date().toISOString() });
        sak.fase = body.tilFase;
        return json(sak);
      }
      // Oppgaver
      if (path === "/api/barnevern/oppgaver") {
        if (method === "GET") {
          const et = url.searchParams.get("entityType");
          const eid = url.searchParams.get("entityId");
          return json(oppgaver.filter((o) => o.entityType === et && o.entityId === eid));
        }
        const body = route.request().postDataJSON();
        const oppgave = { id: `o-${oppgaver.length + 1}`, status: "apen", fullfortDato: null, beskrivelse: null, ...body };
        oppgaver.push(oppgave);
        return json(oppgave, 201);
      }
      const fullforMatch = path.match(/^\/api\/barnevern\/oppgaver\/([^/]+)\/fullfor$/);
      if (method === "PATCH" && fullforMatch) {
        const oppgave = oppgaver.find((o) => o.id === fullforMatch[1]);
        oppgave.status = "fullfort";
        return json(oppgave);
      }
      // Planer
      const planListeMatch = path.match(/^\/api\/barnevern\/saker\/([^/]+)\/planer$/);
      if (planListeMatch) {
        if (method === "GET") return json(planer.filter((p) => p.sakId === planListeMatch[1]));
        const body = route.request().postDataJSON();
        const plan = {
          id: `p-${planer.length + 1}`, sakId: planListeMatch[1], plantype: "tiltaksplan",
          versjon: planer.filter((p) => p.sakId === planListeMatch[1]).length + 1,
          status: "utkast", formaal: body.formaal ?? null, deltakere: [],
          evalueringsfrist: body.evalueringsfrist ?? null, godkjentDato: null, tiltak: [],
        };
        planer.push(plan);
        return json(plan, 201);
      }
      const planGodkjennMatch = path.match(/^\/api\/barnevern\/planer\/([^/]+)\/godkjenn$/);
      if (method === "POST" && planGodkjennMatch) {
        const plan = planer.find((p) => p.id === planGodkjennMatch[1]);
        plan.status = "godkjent";
        plan.godkjentDato = new Date().toISOString();
        return json(plan);
      }
      const planTiltakMatch = path.match(/^\/api\/barnevern\/planer\/([^/]+)\/tiltak$/);
      if (method === "POST" && planTiltakMatch) {
        const plan = planer.find((p) => p.id === planTiltakMatch[1]);
        const body = route.request().postDataJSON();
        const tiltak = { id: `t-${plan.tiltak.length + 1}`, status: "planlagt", frist: null, statusnotat: null, ...body };
        plan.tiltak.push(tiltak);
        return json(tiltak, 201);
      }
      const tiltakStatusMatch = path.match(/^\/api\/barnevern\/plan-tiltak\/([^/]+)\/status$/);
      if (method === "PATCH" && tiltakStatusMatch) {
        for (const plan of planer) {
          const tiltak = plan.tiltak.find((t: any) => t.id === tiltakStatusMatch[1]);
          if (tiltak) {
            tiltak.status = route.request().postDataJSON().status;
            return json(tiltak);
          }
        }
        return json({ error: "Ikke funnet" }, 404);
      }
      // Dokumenter
      if (method === "GET" && path === "/api/barnevern/dokumentmaler") {
        return json([
          { malId: "vedtak_hjelpetiltak", dokumenttype: "vedtak", tittel: "Vedtak om hjelpetiltak", hjemmel: "barnevernsloven § 3-1" },
          { malId: "brev_innkalling_samtale", dokumenttype: "brev", tittel: "Innkalling til samtale", hjemmel: null },
        ]);
      }
      const dokListeMatch = path.match(/^\/api\/barnevern\/saker\/([^/]+)\/dokumenter$/);
      if (dokListeMatch) {
        if (method === "GET") return json(dokumenter.filter((d) => d.sakId === dokListeMatch[1]));
        const body = route.request().postDataJSON();
        const erVedtak = body.malId.startsWith("vedtak");
        const dokument = {
          id: `d-${dokumenter.length + 1}`, sakId: dokListeMatch[1],
          dokumenttype: erVedtak ? "vedtak" : "brev", malId: body.malId,
          tittel: erVedtak ? "Vedtak om hjelpetiltak" : "Innkalling til samtale",
          hjemmel: erVedtak ? "barnevernsloven § 3-1" : null,
          innhold: `VEDTAK I BARNEVERNSSAK BVS-3001-1 — flettet innhold.`,
          mottaker: body.mottaker ?? null, status: "utkast", ekspedertVia: null,
          createdAt: new Date().toISOString(),
        };
        dokumenter.push(dokument);
        return json(dokument, 201);
      }
      const dokGodkjennMatch = path.match(/^\/api\/barnevern\/dokumenter\/([^/]+)\/godkjenn$/);
      if (method === "POST" && dokGodkjennMatch) {
        const dokument = dokumenter.find((d) => d.id === dokGodkjennMatch[1]);
        dokument.status = "godkjent";
        return json(dokument);
      }
      if (path === "/api/barnevern/tilgangslogg") {
        return json([
          { id: "tl-1", userId: "sb-1", handling: "lest", objektType: "sak", objektId: "s-1", detaljer: null, createdAt: new Date().toISOString() },
          { id: "tl-2", userId: "sb-2", handling: "endret", objektType: "break_glass", objektId: "bg-1", detaljer: null, createdAt: new Date().toISOString() },
        ]);
      }
      if (path === "/api/barnevern/delegasjoner" && method === "GET") {
        return json([{
          id: "del-1", type: "delegasjon", fraUserId: "sb-1", tilUserId: "sb-2", sakId: null,
          begrunnelse: "Ferie uke 40", fraDato: new Date().toISOString(), tilDato: new Date(Date.now() + 86400000).toISOString(),
          opprettetAv: "leder-1", opphevetAv: null, opphevetAt: null, createdAt: new Date().toISOString(),
        }]);
      }
      const dokEkspederMatch = path.match(/^\/api\/barnevern\/dokumenter\/([^/]+)\/ekspeder$/);
      if (method === "POST" && dokEkspederMatch) {
        const dokument = dokumenter.find((d) => d.id === dokEkspederMatch[1]);
        dokument.status = "ekspedert";
        dokument.ekspedertVia = route.request().postDataJSON().via;
        (journal[dokument.sakId] ??= []).push({
          id: `j-dok-${dokument.id}`, kategori: "vedtak",
          innhold: `${dokument.tittel} — ekspedert.`, correctsEntryId: null,
          forfatterUserId: SAKSBEHANDLER.id, createdAt: new Date().toISOString(),
        });
        return json(dokument);
      }
      // Innsyn
      const innsynListeMatch = path.match(/^\/api\/barnevern\/saker\/([^/]+)\/innsynskrav$/);
      if (innsynListeMatch) {
        if (method === "GET") return json(innsynskrav.filter((k) => k.sakId === innsynListeMatch[1]));
        const body = route.request().postDataJSON();
        const krav = {
          id: `ik-${innsynskrav.length + 1}`, sakId: innsynListeMatch[1],
          partNavn: body.partNavn, partRelasjon: body.partRelasjon,
          mottattDato: new Date().toISOString(),
          behandlingsfrist: new Date(Date.now() + 5 * 86400000).toISOString(),
          status: "mottatt", unntak: [], beslutningBegrunnelse: null,
          utlevertDato: null, utlevertVia: null, klageMottattDato: null,
        };
        innsynskrav.push(krav);
        return json(krav, 201);
      }
      const innsynBeslutning = path.match(/^\/api\/barnevern\/innsynskrav\/([^/]+)\/beslutning$/);
      if (method === "POST" && innsynBeslutning) {
        const krav = innsynskrav.find((k) => k.id === innsynBeslutning[1]);
        const body = route.request().postDataJSON();
        krav.status = body.utfall;
        krav.beslutningBegrunnelse = body.begrunnelse ?? null;
        krav.unntak = body.unntak ?? [];
        return json(krav);
      }
      const innsynUtlever = path.match(/^\/api\/barnevern\/innsynskrav\/([^/]+)\/utlever$/);
      if (method === "POST" && innsynUtlever) {
        const krav = innsynskrav.find((k) => k.id === innsynUtlever[1]);
        krav.status = "utlevert";
        krav.utlevertVia = route.request().postDataJSON().via;
        return json(krav);
      }
      // Forebyggende
      if (path === "/api/barnevern/forebyggende/statistikk") {
        return json({
          perKategori: [],
          aktivitetPerAar: [{ aar: 2026, antall_aktiviteter: forebyggende.reduce((n, t) => n + t.aktiviteter.length, 0), antall_deltakere: 27 }],
        });
      }
      if (path === "/api/barnevern/forebyggende") {
        if (method === "GET") return json(forebyggende);
        const body = route.request().postDataJSON();
        const tiltak = {
          id: `f-${forebyggende.length + 1}`, tittel: body.tittel, beskrivelse: null,
          kategori: body.kategori, samarbeidsparter: [], startDato: null, sluttDato: null,
          status: "planlagt", aktiviteter: [] as any[],
        };
        forebyggende.push(tiltak);
        return json(tiltak, 201);
      }
      const forebyggendeAktivitet = path.match(/^\/api\/barnevern\/forebyggende\/([^/]+)\/aktiviteter$/);
      if (method === "POST" && forebyggendeAktivitet) {
        const tiltak = forebyggende.find((t) => t.id === forebyggendeAktivitet[1]);
        const body = route.request().postDataJSON();
        const aktivitet = { id: `fa-${tiltak.aktiviteter.length + 1}`, dato: body.dato, beskrivelse: body.beskrivelse, antallDeltakere: body.antallDeltakere ?? null, notat: null };
        tiltak.aktiviteter.push(aktivitet);
        return json(aktivitet, 201);
      }
      const forebyggendeDetalj = path.match(/^\/api\/barnevern\/forebyggende\/([^/]+)$/);
      if (forebyggendeDetalj) {
        const tiltak = forebyggende.find((t) => t.id === forebyggendeDetalj[1]);
        if (!tiltak) return json({ error: "Ikke funnet" }, 404);
        if (method === "PATCH") tiltak.status = route.request().postDataJSON().status ?? tiltak.status;
        return json(tiltak);
      }
      // Nøkkeltall
      if (path === "/api/barnevern/kpi") {
        return json({
          generert: new Date().toISOString(),
          kpier: [
            { id: "meldinger_30d", navn: "Nye meldinger siste 30 dager", beskrivelse: "Antall meldinger.",
              kilde: "tidum_barnevern_meldinger", formel: "SELECT COUNT(*) ...", eier: "Barnevernsleder",
              frekvens: "Løpende", enhet: "antall", verdi: 4 },
            { id: "avklart_innen_frist_90d", navn: "Andel avklart innen frist", beskrivelse: "Prosent.",
              kilde: "tidum_barnevern_meldinger", formel: "SELECT ...", eier: "Barnevernsleder",
              frekvens: "Løpende", enhet: "prosent", verdi: 100 },
          ],
        });
      }
      // Innrapportering
      if (path === "/api/barnevern/innrapportering") return json(innsendinger);
      if (path === "/api/barnevern/innrapportering/kjor") {
        const innsending = {
          id: `bvr-${innsendinger.length + 1}`,
          rapportdato: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
          status: "sendt", innholdsHash: "a".repeat(64), valideringsfeil: null,
          forsok: 1, kvittering: { mottaksId: "BVR-2026-042" }, feil: null,
          sendtDato: new Date().toISOString(),
        };
        innsendinger.push(innsending);
        return json({ id: innsending.id, status: "koet" }, 202);
      }
      const sakMatch = path.match(/^\/api\/barnevern\/saker\/([^/]+)$/);
      if (method === "GET" && sakMatch) {
        const sak = saker.find((s) => s.id === sakMatch[1]);
        return sak ? json(sak) : json({ error: "Ikke funnet" }, 404);
      }
      return json({});
    });

    await page.goto("/barnevern", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("barnevern-title")).toBeVisible({ timeout: 10000 });

    // Registrer akutt melding
    await page.getByTestId("ny-melding-button").click();
    await page.getByTestId("melding-prioritet-select").click();
    await page.getByRole("option", { name: /akutt/i }).click();
    await page.getByTestId("melding-barnnavn-input").fill("Ola Testbarn");
    await page.getByTestId("melding-beskrivelse-input").fill("Alvorlig bekymring meldt fra politi.");
    await page.getByTestId("melding-lagre-button").click();

    // Meldingen vises i listen med akutt-badge; åpne den
    await expect(page.getByTestId("melding-rad-m-1")).toBeVisible();
    await expect(page.getByTestId("melding-rad-m-1").getByText("Akutt")).toBeVisible();
    await page.getByTestId("melding-rad-m-1").click();
    await expect(page.getByTestId("melding-detalj")).toBeVisible();
    await expect(page.getByText("Alvorlig bekymring meldt fra politi.")).toBeVisible();

    // Opprett undersøkelsessak — hopper til Saker-fanen
    await page.getByTestId("melding-undersokelse-button").click();
    await expect(page.getByTestId("sak-detalj")).toBeVisible();
    await expect(page.getByTestId("sak-detalj").getByText("BVS-3001-1")).toBeVisible();
    await expect(page.getByTestId("sak-detalj").getByText(/Undersøkelsesfrist/)).toBeVisible();

    // Journalfør
    await page.getByTestId("journal-innhold-input").fill("Oppstartsmøte gjennomført med foreldrene.");
    await page.getByTestId("journal-lagre-button").click();
    await expect(page.getByText("Oppstartsmøte gjennomført med foreldrene.")).toBeVisible();

    // Faseovergang til tiltak med begrunnelse
    await page.getByTestId("fase-tiltak-button").click();
    await page.getByTestId("fase-begrunnelse-input").fill("Undersøkelsen konkluderer med hjelpetiltak.");
    await page.getByTestId("fase-bekreft-button").click();
    await expect(page.getByTestId("sak-detalj").getByText("Tiltak", { exact: true }).first()).toBeVisible();

    // Plan: utkast med tiltak → godkjenn
    await page.getByTestId("sak-tab-plan").click();
    await page.getByTestId("plan-formaal-input").fill("Stabil skolegang.");
    await page.getByTestId("plan-opprett-button").click();
    await page.getByTestId("tiltak-beskrivelse-input").fill("Miljøterapeut i hjemmet");
    await page.getByTestId("tiltak-ansvarlig-input").fill("Kari Saksbehandler");
    await page.getByTestId("tiltak-legg-til-button").click();
    await expect(page.getByText("Miljøterapeut i hjemmet")).toBeVisible();
    // På mobil ligger toast-viewporten øverst og kan dekke knappen mens
    // «Tiltak lagt til»-toasten vises (~5 s) — retry til klikket når frem.
    await expect(async () => {
      // Radix pauser toast-nedtellingen ved hover — flytt musen vekk så
      // toasten får lukke seg før nytt klikkforsøk.
      await page.mouse.move(5, 5);
      await page.waitForTimeout(600);
      await page.getByTestId("plan-godkjenn-button").click({ timeout: 2000 });
      await expect(page.getByTestId("sak-detalj").getByText("Godkjent", { exact: true })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30000 });

    // Dokument: vedtak fra mal → godkjenn → ekspeder
    await page.getByTestId("sak-tab-dokumenter").click();
    await page.getByTestId("dokument-mal-select").click();
    await page.getByRole("option", { name: /vedtak om hjelpetiltak/i }).click();
    await page.getByTestId("dokument-mottaker-input").fill("Mor Testesen");
    await page.getByTestId("dokument-opprett-button").click();
    await page.getByTestId("dokument-godkjenn-d-1").click();
    await page.getByTestId("dokument-ekspeder-d-1").click();
    await expect(page.getByTestId("dokument-d-1").getByText("Ekspedert")).toBeVisible();

    // Oppgave: opprett → fullfør
    await page.getByTestId("sak-tab-oppgaver").click();
    await page.getByTestId("oppgave-tittel-input").fill("Følg opp skolen");
    await page.getByTestId("oppgave-opprett-button").click();
    await expect(page.getByText("Følg opp skolen")).toBeVisible();
    await page.getByTestId("oppgave-fullfor-o-1").click();
    await expect(page.getByTestId("oppgave-o-1").getByText("Fullført")).toBeVisible();

    // Innsyn: begjæring → delvis innvilgelse med unntak → utlevering
    await page.getByTestId("sak-tab-innsyn").click();
    await page.getByTestId("innsyn-part-input").fill("Mor Testesen");
    await page.getByTestId("innsyn-opprett-button").click();
    await expect(page.getByTestId("innsyn-ik-1")).toBeVisible();
    await page.getByTestId("innsyn-beslutt-ik-1").click();
    await page.getByTestId("innsyn-utfall-select").click();
    await page.getByRole("option", { name: /delvis innvilget/i }).click();
    await page.getByTestId("innsyn-hjemmel-input").fill("fvl. § 19 b");
    await page.getByTestId("innsyn-begrunnelse-input").fill("Melders identitet skjermes.");
    await page.getByTestId("innsyn-bekreft-button").click();
    await expect(page.getByTestId("innsyn-utlever-ik-1")).toBeVisible();
    await page.getByTestId("innsyn-utlever-ik-1").click();
    await expect(page.getByTestId("innsyn-ik-1").getByText("Utlevert")).toBeVisible();

    // Forebyggende: opprett tiltak → registrer aktivitet
    await page.getByTestId("tab-forebyggende").click();
    await page.getByTestId("forebyggende-tittel-input").fill("Foreldreveiledningskurs");
    await page.getByTestId("forebyggende-opprett-button").click();
    await expect(page.getByTestId("forebyggende-detalj")).toBeVisible();
    await page.getByTestId("aktivitet-dato-input").fill("2026-09-10");
    await page.getByTestId("aktivitet-beskrivelse-input").fill("Første kurskveld");
    await page.getByTestId("aktivitet-deltakere-input").fill("12");
    await page.getByTestId("aktivitet-registrer-button").click();
    await expect(page.getByText("Første kurskveld")).toBeVisible();

    // Innrapportering: kjør nå → innsending med kvittering vises
    await page.getByTestId("tab-innrapportering").click();
    await page.getByTestId("innrapportering-kjor-button").click();
    await expect(page.getByTestId("innsending-bvr-1")).toBeVisible();
    await expect(page.getByTestId("innsending-bvr-1").getByText("Sendt")).toBeVisible();
    await expect(page.getByText(/BVR-2026-042/)).toBeVisible();

    // Nøkkeltall: verdier + kilde/formel synlig (krav 13-dokumentasjonen)
    await page.getByTestId("tab-nokkeltall").click();
    await expect(page.getByTestId("kpi-meldinger_30d")).toBeVisible();
    await expect(page.getByTestId("kpi-avklart_innen_frist_90d").getByText("100 %")).toBeVisible();
    await page.getByTestId("kpi-meldinger_30d").click();
    await expect(page.getByTestId("kpi-meldinger_30d").getByText(/^Kilde$/)).toBeVisible();

    // Tilgang (krav 15): revisorlogg + delegasjoner
    await page.getByTestId("tab-tilgang").click();
    await expect(page.getByTestId("tilgangslogg-tabell").getByText("Siri Saksbehandler")).toBeVisible();
    await expect(page.getByTestId("tilgangslogg-tabell").getByText("break_glass", { exact: false })).toBeVisible();
    await expect(page.getByTestId("delegasjon-del-1")).toBeVisible();
    await expect(page.getByTestId("delegasjon-del-1").getByText("Ferie uke 40", { exact: false })).toBeVisible();
  });
});
