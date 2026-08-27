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
    await page.route("**/api/auth/user", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SAKSBEHANDLER) }));

    // Tilstandsfull mock av barnevern-API-et.
    const meldinger: any[] = [];
    const saker: any[] = [];
    const journal: Record<string, any[]> = {};
    const planer: any[] = [];
    const dokumenter: any[] = [];
    const oppgaver: any[] = [];

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
    await expect(page.getByTestId("sak-detalj").getByText("Tiltak", { exact: true })).toBeVisible();

    // Plan: utkast med tiltak → godkjenn
    await page.getByTestId("sak-tab-plan").click();
    await page.getByTestId("plan-formaal-input").fill("Stabil skolegang.");
    await page.getByTestId("plan-opprett-button").click();
    await page.getByTestId("tiltak-beskrivelse-input").fill("Miljøterapeut i hjemmet");
    await page.getByTestId("tiltak-ansvarlig-input").fill("Kari Saksbehandler");
    await page.getByTestId("tiltak-legg-til-button").click();
    await expect(page.getByText("Miljøterapeut i hjemmet")).toBeVisible();
    await page.getByTestId("plan-godkjenn-button").click();
    await expect(page.getByTestId("sak-detalj").getByText("Godkjent", { exact: true })).toBeVisible();

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
  });
});
