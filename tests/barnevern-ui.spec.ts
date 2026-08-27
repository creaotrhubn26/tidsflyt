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
  });
});
