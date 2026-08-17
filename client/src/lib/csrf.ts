/**
 * client/src/lib/csrf.ts
 *
 * Klientsiden av CSRF-vernet (server: server/lib/csrf.ts, montert i
 * server/custom-auth.ts på alle sesjons-autentiserte POST/PUT/PATCH/DELETE).
 *
 * Hvorfor en global fetch-wrapper og ikke bare et header-tillegg i
 * `apiRequest`: klienten har ~50 direkte `fetch(...)`-kallsteder med
 * mutasjonsmetoder (CMS-editor, portal-layout, offline-køens `drainQueue`,
 * dialoger m.m.) i tillegg til `apiRequest`. Ett punkt alle går gjennom er
 * både mindre diff og den eneste varianten som ikke råtner neste gang noen
 * skriver et nytt `fetch`-kall.
 *
 * Tokenet hentes lat (første mutasjon), caches, og hentes på nytt én gang
 * hvis serveren svarer 403 — csrf-csrf binder tokenet til `req.sessionID`,
 * og passport regenererer sesjonen ved innlogging, så et token hentet FØR
 * innlogging er ugyldig ETTER den.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const TOKEN_URL = "/api/csrf-token";

let cachedToken: string | null = null;
let inflight: Promise<string | null> | null = null;

/** Hent (og cache) CSRF-tokenet. `baseFetch` er den upatchede fetch-en. */
export function getCsrfToken(baseFetch: typeof fetch): Promise<string | null> {
  if (cachedToken) return Promise.resolve(cachedToken);
  if (!inflight) {
    inflight = baseFetch(TOKEN_URL, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: any) => {
        cachedToken = typeof body?.token === "string" ? body.token : null;
        return cachedToken;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function clearCsrfToken(): void {
  cachedToken = null;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  return method.toUpperCase();
}

function isSameOrigin(input: RequestInfo | URL): boolean {
  const url = input instanceof Request ? input.url : String(input);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return true; // relativ URL
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

let installed = false;

/**
 * Patch globalThis.fetch slik at alle tilstandsendrende same-origin-kall
 * får `x-csrf-token`. Kalles én gang fra main.tsx.
 */
export function installCsrfFetch(): void {
  if (installed) return;
  installed = true;

  const baseFetch: typeof fetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = methodOf(input, init);
    const url = input instanceof Request ? input.url : String(input);
    if (!MUTATING_METHODS.has(method) || !isSameOrigin(input) || url.includes(TOKEN_URL)) {
      return baseFetch(input, init);
    }

    const send = async (token: string | null) => {
      if (!token) return baseFetch(input, init);
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      headers.set("x-csrf-token", token);
      return baseFetch(input, { ...init, method, headers });
    };

    const res = await send(await getCsrfToken(baseFetch));

    // 403 kan bety at tokenet er bundet til en utdatert sesjon (innlogging
    // regenererer sesjonen). Hent nytt token og prøv én gang til. Requests
    // konstruert som `Request`-objekt kan ikke sendes på nytt (body er
    // konsumert), så de hoppes over.
    if (res.status === 403 && cachedToken && !(input instanceof Request)) {
      clearCsrfToken();
      const fresh = await getCsrfToken(baseFetch);
      if (fresh) return send(fresh);
    }

    return res;
  };
}
