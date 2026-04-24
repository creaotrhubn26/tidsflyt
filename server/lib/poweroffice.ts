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
const SUBSCRIPTION_KEY_PRIMARY = process.env.POWEROFFICE_SUBSCRIPTION_KEY || '';
const SUBSCRIPTION_KEY_SECONDARY = process.env.POWEROFFICE_SUBSCRIPTION_KEY_SECONDARY || '';
const AUTH_URL = process.env.POWEROFFICE_AUTH_URL || 'https://goapi.poweroffice.net/Demo/OAuth/Token';
const BASE_URL = process.env.POWEROFFICE_BASE_URL || 'https://goapi.poweroffice.net/demo/v2';

/**
 * Subscription-key rotation.
 *   - Primary is used first.
 *   - On 401/403 responses (subscription key rejected), we transparently
 *     retry once with the secondary, and remember that secondary succeeded
 *     until this process restarts — so subsequent calls don't re-hit the bad
 *     primary. Key rotation in Azure APIM is eventually consistent, so this
 *     window (minutes) is normal during rotation cycles.
 *   - `activeSubscriptionKey` is the in-memory preference; it resets on boot.
 */
let activeSubscriptionKey: 'primary' | 'secondary' = 'primary';

function currentSubscriptionKey(): string {
  if (activeSubscriptionKey === 'secondary' && SUBSCRIPTION_KEY_SECONDARY) {
    return SUBSCRIPTION_KEY_SECONDARY;
  }
  return SUBSCRIPTION_KEY_PRIMARY;
}

function otherSubscriptionKey(): string | null {
  if (activeSubscriptionKey === 'primary' && SUBSCRIPTION_KEY_SECONDARY) {
    return SUBSCRIPTION_KEY_SECONDARY;
  }
  if (activeSubscriptionKey === 'secondary' && SUBSCRIPTION_KEY_PRIMARY) {
    return SUBSCRIPTION_KEY_PRIMARY;
  }
  return null;
}

function isSubscriptionRejection(status: number): boolean {
  return status === 401 || status === 403;
}

/** True if the server has the shared app + at least one subscription key configured. */
export function isPowerOfficeConfigured(): boolean {
  return !!(APPLICATION_KEY && SUBSCRIPTION_KEY_PRIMARY);
}

/** Debug helper — expose which key is in use (not the key value itself). */
export function getActiveSubscriptionKeyName(): 'primary' | 'secondary' {
  return activeSubscriptionKey;
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

  const doFetch = async (subKey: string) => fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Ocp-Apim-Subscription-Key': subKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  let res = await doFetch(currentSubscriptionKey());

  // If the current subscription key is rejected, rotate once to the other.
  if (isSubscriptionRejection(res.status)) {
    const other = otherSubscriptionKey();
    if (other) {
      console.warn('[poweroffice] subscription-key rejected, rotating to backup');
      res = await doFetch(other);
      if (res.ok) {
        activeSubscriptionKey = activeSubscriptionKey === 'primary' ? 'secondary' : 'primary';
      }
    }
  }

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

  const doRequest = async (token: string, subKey: string): Promise<Response> =>
    fetch(url.toString(), {
      method: opts.method || 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Ocp-Apim-Subscription-Key': subKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

  let token = await getAccessToken(clientKey);
  let res = await doRequest(token, currentSubscriptionKey());

  // 401 means Bearer token is stale — refresh once and retry on same key.
  if (res.status === 401) {
    invalidateToken(clientKey);
    token = await getAccessToken(clientKey);
    res = await doRequest(token, currentSubscriptionKey());
  }

  // 403 (or persistent 401) after a token refresh usually means the
  // subscription key was rotated in Azure APIM — try the other key once.
  if (isSubscriptionRejection(res.status)) {
    const other = otherSubscriptionKey();
    if (other) {
      console.warn('[poweroffice] API call rejected subscription-key, rotating to backup');
      res = await doRequest(token, other);
      if (res.ok) {
        activeSubscriptionKey = activeSubscriptionKey === 'primary' ? 'secondary' : 'primary';
      }
    }
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
