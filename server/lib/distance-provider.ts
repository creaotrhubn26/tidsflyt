/**
 * server/lib/distance-provider.ts
 *
 * Pluggable distance-between-coordinates provider for kjøregodt-beregning.
 *
 * Today: Haversine (great-circle, straight-line). This underestimates real
 *   driving distance but is a safe fallback that requires no external call.
 *
 * Future: a router-backed provider using Statens vegvesen / NVDB / Google
 *   Directions. Reserve env `VEGVESEN_API_KEY` + `VEGVESEN_ROUTING_URL` for
 *   the swap-in. Until the exact Vegvesen endpoint contract is confirmed,
 *   the stub here only uses Haversine. See README note.
 */

export type DistanceSource = 'haversine' | 'vegvesen' | 'manual';

export interface Coords { lat: number; lng: number }
export interface DistanceResult {
  km: number;
  source: DistanceSource;
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
  /** True when this provider is available (keys set, network reachable, etc.). */
  isAvailable(): boolean;
  /** Compute driving distance between two geocoded points. */
  distanceKm(from: Coords, to: Coords): Promise<DistanceResult>;
}

class HaversineProvider implements DistanceProvider {
  isAvailable() { return true; }
  async distanceKm(from: Coords, to: Coords): Promise<DistanceResult> {
    return {
      km: haversineKm(from, to),
      source: 'haversine',
      note: 'Luftlinje — faktisk kjørestrekning kan være 15-30 % lengre.',
    };
  }
}

class VegvesenProviderStub implements DistanceProvider {
  isAvailable() {
    // Vegvesen integrasjonen venter på en konkret endepunkt-spec; til da
    // faller den tilbake til Haversine. Sett VEGVESEN_API_KEY + bytt inn
    // ekte client her når spec er avklart.
    return false;
  }
  async distanceKm(_from: Coords, _to: Coords): Promise<DistanceResult> {
    throw new Error('Vegvesen-provider ikke implementert ennå');
  }
}

const haversine = new HaversineProvider();
const vegvesen = new VegvesenProviderStub();

/** Try the best available provider, falling through to Haversine. */
export async function calculateDistance(from: Coords, to: Coords): Promise<DistanceResult> {
  if (vegvesen.isAvailable()) {
    try {
      return await vegvesen.distanceKm(from, to);
    } catch {
      // fall through
    }
  }
  return haversine.distanceKm(from, to);
}
