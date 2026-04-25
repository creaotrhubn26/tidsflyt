/**
 * server/lib/distance-provider.ts
 *
 * Pluggable distance-between-coordinates provider for kjøregodt-beregning.
 *
 * Tilgjengelige providers (i prioritert rekkefølge):
 *   1. OSRM    — open-source routing (driving distance over real road network)
 *   2. Haversine — luftlinje, fallback hvis OSRM ikke svarer
 *
 * OSRM-konfig:
 *   - Standard: `https://router.project-osrm.org` (offentlig demo, rate-limit
 *     ≈1 req/s — kun til prod hvis volumet er lavt)
 *   - For prod: kjør egen OSRM-instans (Docker-image `osrm/osrm-backend`) på
 *     norsk OpenStreetMap-extract og pek `OSRM_BASE_URL` på den.
 *
 * VEGVESEN_API_KEY:
 *   - Reservert for fremtidig integrasjon mot Statens vegvesen sitt
 *     premium-API (hvis/når en routing-endepunkt-spec foreligger).
 *   - NVDB (Nasjonal vegdatabank) gjør ikke routing — kun nettverksdata.
 *   - Inntil dette er avklart har VEGVESEN_API_KEY ingen kode-effekt.
 */

export type DistanceSource = 'haversine' | 'vegvesen' | 'osrm' | 'manual';

export interface Coords { lat: number; lng: number }
export interface DistanceResult {
  km: number;
  source: DistanceSource;
  durationSeconds?: number;
  note?: string;
}

/** Straight-line distance via Haversine. Returns km rounded to 2 decimals. */
export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371; // earth radius, km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.round(R * c * 100) / 100;
}

export interface DistanceProvider {
  /** Stable name (used in logging). */
  readonly name: string;
  /** True when this provider is reachable / configured. */
  isAvailable(): boolean;
  /** Compute driving distance between two geocoded points. */
  distanceKm(from: Coords, to: Coords): Promise<DistanceResult>;
}

class HaversineProvider implements DistanceProvider {
  readonly name = 'haversine';
  isAvailable() { return true; }
  async distanceKm(from: Coords, to: Coords): Promise<DistanceResult> {
    return {
      km: haversineKm(from, to),
      source: 'haversine',
      note: 'Luftlinje — faktisk kjørestrekning kan være 15-30 % lengre.',
    };
  }
}

const OSRM_BASE_URL = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
/** Cache OSRM-availability for short windows so we don't hammer the demo if it's down. */
let osrmDownUntil = 0;

class OsrmProvider implements DistanceProvider {
  readonly name = 'osrm';
  isAvailable() {
    if (Date.now() < osrmDownUntil) return false;
    return !!OSRM_BASE_URL;
  }
  async distanceKm(from: Coords, to: Coords): Promise<DistanceResult> {
    // OSRM expects lon,lat (not lat,lon). Path: /route/v1/driving/{lon},{lat};{lon},{lat}
    const path = `/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}`;
    const url = `${OSRM_BASE_URL.replace(/\/$/, '')}${path}?overview=false&alternatives=false&steps=false`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        // Mark provider unavailable for 60s after a failure
        osrmDownUntil = Date.now() + 60_000;
        throw new Error(`OSRM ${res.status}`);
      }
      const json = await res.json() as {
        code?: string;
        routes?: Array<{ distance?: number; duration?: number }>;
      };
      if (json.code !== 'Ok' || !json.routes?.[0]?.distance) {
        osrmDownUntil = Date.now() + 60_000;
        throw new Error(`OSRM bad response (code=${json.code})`);
      }
      const meters = json.routes[0].distance;
      const seconds = json.routes[0].duration;
      return {
        km: Math.round((meters / 1000) * 100) / 100,
        source: 'osrm',
        durationSeconds: typeof seconds === 'number' ? Math.round(seconds) : undefined,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

class VegvesenProviderStub implements DistanceProvider {
  readonly name = 'vegvesen';
  isAvailable() {
    // Reservert. Statens vegvesen har p.t. ikke et offentlig routing-API som
    // matcher kjøregodt-bruken. Når et premium-endepunkt foreligger, bytt
    // inn klienten her og les VEGVESEN_API_KEY + VEGVESEN_ROUTING_URL.
    return false;
  }
  async distanceKm(_from: Coords, _to: Coords): Promise<DistanceResult> {
    throw new Error('Vegvesen-provider ikke implementert ennå');
  }
}

const haversine = new HaversineProvider();
const osrm = new OsrmProvider();
const vegvesen = new VegvesenProviderStub();

/**
 * Forsøk providere i rekkefølge. Første som lykkes vinner.
 * Vegvesen → OSRM → Haversine (alltid tilgjengelig).
 */
export async function calculateDistance(from: Coords, to: Coords): Promise<DistanceResult> {
  for (const provider of [vegvesen, osrm]) {
    if (!provider.isAvailable()) continue;
    try {
      return await provider.distanceKm(from, to);
    } catch (err) {
      console.warn(`[distance-provider] ${provider.name} failed, trying fallback:`, (err as any)?.message || err);
    }
  }
  return haversine.distanceKm(from, to);
}
