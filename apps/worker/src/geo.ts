import geoip from 'geoip-lite';

export type GeoResult = { country: string | null; city: string | null };

export async function lookupGeo(
  ip: string | null | undefined,
  timeoutMs = 100,
  lookup: (ip: string) => GeoResult | Promise<GeoResult> = (value) => {
    const result = geoip.lookup(value);
    return { country: result?.country ?? null, city: result?.city ?? null };
  }
): Promise<GeoResult> {
  if (!ip) return { country: null, city: null };
  return Promise.race([
    Promise.resolve().then(() => lookup(ip)),
    new Promise<GeoResult>((resolve) => setTimeout(() => resolve({ country: null, city: null }), timeoutMs))
  ]);
}
