/**
 * server/lib/poweroffice.ts
 *
 * PowerOffice Go v2 client for push integrations.
 *
 * Auth is OAuth 2.0 client_credentials (RFC 6749 §4.4):
 *   POST {AUTH_URL}
 *     Authorization: Basic base64(APPLICATION_KEY:CLIENT_KEY)
 *     Ocp-Apim-Subscription-Key: {SUBSCRIPTION_KEY}
 *     body: grant_type=client_credentials
 *
 * Access tokens have a 20-minute lifetime. This module caches them per
 * tenant (keyed by clientKey) and refreshes on demand. Tokens are never
 * persisted to the database.
 *
 * Application & subscription keys are shared across tenants (our
 * developer identity). ClientKey is per-tenant — the admin generates it
 * in their own PowerOffice Go client and pastes it into Tidum.
 *
 * Docs: https://developer.poweroffice.net/documentation/authentication
 */

const APPLICATION_KEY = process.env.POWEROFFICE_APPLICATION_KEY || '';
const SUBSCRIPTION_KEY = process.env.POWEROFFICE_SUBSCRIPTION_KEY || '';
const AUTH_URL = process.env.POWEROFFICE_AUTH_URL || 'https://goapi.poweroffice.net/Demo/OAuth/Token';
const BASE_URL = process.env.POWEROFFICE_BASE_URL || 'https://goapi.poweroffice.net/demo/v2';

/** True if the server has the shared app+subscription keys configured. */
export function isPowerOfficeConfigured(): boolean {
  return !!(APPLICATION_KEY && SUBSCRIPTION_KEY);
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

// Token cache is keyed by clientKey (the per-tenant secret).
const tokenCache = new Map<string, CachedToken>();

// Refresh ~1 min before PowerOffice's 20-min expiry to avoid races.
const TOKEN_TTL_MS = 19 * 60 * 1000;

export class PowerOfficeAuthError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'PowerOfficeAuthError';
  }
}

export class PowerOfficeApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly body?: unknown) {
    super(message);
    this.name = 'PowerOfficeApiError';
  }
}

async function fetchAccessToken(clientKey: string): Promise<string> {
  if (!isPowerOfficeConfigured()) {
    throw new PowerOfficeAuthError('PowerOffice application/subscription keys not configured on server');
  }
  const basic = Buffer.from(`${APPLICATION_KEY}:${clientKey}`).toString('base64');
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new PowerOfficeAuthError(
      `Token exchange failed (${res.status}): ${body.slice(0, 300)}`,
      res.status,
    );
  }

  const json = await res.json() as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new PowerOfficeAuthError('Token response missing access_token');
  }
  return json.access_token;
}

/** Returns a valid access token for the tenant, fetching/refreshing as needed. */
export async function getAccessToken(clientKey: string): Promise<string> {
  const cached = tokenCache.get(clientKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }
  const accessToken = await fetchAccessToken(clientKey);
  tokenCache.set(clientKey, { accessToken, expiresAt: Date.now() + TOKEN_TTL_MS });
  return accessToken;
}

/** Drop a cached token (e.g. after a 401 from the API). */
export function invalidateToken(clientKey: string): void {
  tokenCache.delete(clientKey);
}

/**
 * Verify a ClientKey actually works by exchanging it for a token.
 * Used during /connect to fail fast before persisting an invalid key.
 */
export async function verifyClientKey(clientKey: string): Promise<boolean> {
  try {
    await fetchAccessToken(clientKey);
    return true;
  } catch (err) {
    if (err instanceof PowerOfficeAuthError) return false;
    throw err;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;                 // e.g. "/HourRegistrations"
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

/**
 * Call a PowerOffice v2 endpoint on behalf of a tenant. Handles token
 * acquisition, a single 401-retry after invalidating the cached token,
 * and error wrapping.
 */
export async function call<T = unknown>(clientKey: string, opts: RequestOptions): Promise<T> {
  if (!isPowerOfficeConfigured()) {
    throw new PowerOfficeAuthError('PowerOffice not configured');
  }

  const url = new URL(BASE_URL.replace(/\/$/, '') + opts.path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const doRequest = async (token: string): Promise<Response> =>
    fetch(url.toString(), {
      method: opts.method || 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

  let token = await getAccessToken(clientKey);
  let res = await doRequest(token);

  if (res.status === 401) {
    // Token may have been revoked mid-flight. Refresh once and retry.
    invalidateToken(clientKey);
    token = await getAccessToken(clientKey);
    res = await doRequest(token);
  }

  if (!res.ok) {
    let body: unknown = undefined;
    try { body = await res.json(); } catch { body = await res.text().catch(() => ''); }
    throw new PowerOfficeApiError(
      `PowerOffice ${opts.method || 'GET'} ${opts.path} failed (${res.status})`,
      res.status,
      body,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
