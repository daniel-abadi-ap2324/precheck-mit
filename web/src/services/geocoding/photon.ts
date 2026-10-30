import type { AddressMatch } from "@/types";

/** Geocodificador Photon (OpenStreetMap) limitado al distrito de Panamá: [oeste, sur, este, norte]. */
export const PHOTON_URL = "https://photon.komoot.io/api/";
export { DISTRITO_BBOX as DISTRICT_BBOX } from "@/lib/gis/distrito";
import { DISTRITO_BBOX as DISTRICT_BBOX } from "@/lib/gis/distrito";
/** Sesgo hacia el centro de la ciudad (Bella Vista): entre homónimos, gana el más céntrico. */
export const CITY_CENTER = { lat: 8.983, lon: -79.52 } as const;

interface PhotonFeature {
  geometry?: { type?: string; coordinates?: number[] };
  properties?: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Convierte la respuesta de Photon en direcciones: nombre visible, detalle (calle y barrio) y punto. Sin duplicados. */
export function parsePhoton(json: unknown, limit = 5): AddressMatch[] {
  const features = (json as { features?: PhotonFeature[] } | null)?.features ?? [];
  const seen = new Set<string>();
  const out: AddressMatch[] = [];
  for (const f of features) {
    const c = f.geometry?.coordinates;
    if (f.geometry?.type !== "Point" || !c || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    const p = f.properties ?? {};
    const street = str(p.street);
    const number = str(p.housenumber);
    const name = str(p.name) ?? (street ? [street, number].filter(Boolean).join(" ") : null);
    if (!name) continue;
    const zona = str(p.district) ?? str(p.locality) ?? str(p.city);
    const detail = [street && street !== name ? street : null, zona && zona !== name ? zona : null].filter(Boolean).join(", ") || "Panamá";
    const key = `${name}|${detail}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `osm-${String(p.osm_type ?? "")}${String(p.osm_id ?? out.length)}`, label: name, detail, point: [c[0], c[1]] });
    if (out.length >= limit) break;
  }
  return out;
}

/** Busca direcciones en Photon dentro del distrito. Lanza si la red o el servicio fallan. */
export async function geocodePhoton(q: string, limit = 5, signal?: AbortSignal): Promise<AddressMatch[]> {
  const params = new URLSearchParams({ q, limit: String(limit * 2), bbox: DISTRICT_BBOX.join(","), lat: String(CITY_CENTER.lat), lon: String(CITY_CENTER.lon) });
  const res = await fetch(`${PHOTON_URL}?${params}`, {
    // Photon es un servicio público con uso justo: agente identificable y tiempo límite de 5 s.
    signal: signal ?? AbortSignal.timeout(5000),
    headers: { "User-Agent": "DOYC-PreCheck/0.3 (Alcaldía de Panamá; prototipo)" },
  });
  if (!res.ok) throw new Error(`Photon respondió ${res.status}`);
  return parsePhoton(await res.json(), limit);
}
