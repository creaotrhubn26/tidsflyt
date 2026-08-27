const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const TOKEN_PATH = "/api/csrf-token";
const CSRF_ERROR_HEADER = "x-csrf-error";

let cachedToken: string | null = null;
let inflight: Promise<string | null> | null = null;

function resolveUrl(input: RequestInfo | URL): URL | null {
  const value = input instanceof Request ? input.url : String(input);
  try {
    return new URL(value, globalThis.location?.href ?? "http://localhost");
  } catch {
    return null;
  }
}

function isSameOrigin(input: RequestInfo | URL): boolean {
  const url = resolveUrl(input);
  if (!url) return false;
  return !globalThis.location || url.origin === globalThis.location.origin;
}

function isTokenRequest(input: RequestInfo | URL): boolean {
  return resolveUrl(input)?.pathname === TOKEN_PATH;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  return method.toUpperCase();
}

/** Fetch and cache a session-bound token without ever exposing it cross-origin. */
export function getCsrfToken(baseFetch: typeof fetch): Promise<string | null> {
  if (cachedToken) return Promise.resolve(cachedToken);
  if (!inflight) {
    inflight = baseFetch(TOKEN_PATH, {
      credentials: "include",
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        const candidate = (body as { token?: unknown } | null)?.token;
        cachedToken = typeof candidate === "string" ? candidate : null;
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

/** Token helper for XMLHttpRequest and other non-fetch transports. */
export function getCsrfTokenForRequest(): Promise<string | null> {
  return getCsrfToken(globalThis.fetch.bind(globalThis));
}

let installed = false;

/** Install before React and the offline queue start sending mutations. */
export function installCsrfFetch(): void {
  if (installed) return;
  installed = true;

  const baseFetch: typeof fetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = methodOf(input, init);
    if (
      !MUTATING_METHODS.has(method) ||
      !isSameOrigin(input) ||
      isTokenRequest(input)
    ) {
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

    const response = await send(await getCsrfToken(baseFetch));

    // Only the server's explicit CSRF marker permits a retry. An ordinary
    // authorization 403 must never duplicate a mutation.
    if (
      response.status === 403 &&
      response.headers.get(CSRF_ERROR_HEADER) === "invalid-token" &&
      !(input instanceof Request)
    ) {
      clearCsrfToken();
      const freshToken = await getCsrfToken(baseFetch);
      if (freshToken) return send(freshToken);
    }

    return response;
  };
}
