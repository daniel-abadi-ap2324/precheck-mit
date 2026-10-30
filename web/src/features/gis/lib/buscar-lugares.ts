import { etiquetaZona } from "@/lib/norma-zona";
import type { AddressMatch, Corregimiento, LngLat, Parcel, SheetCell } from "@/types";
import { featureCollectionBBox, localProjector, type BBox } from "@/lib/gis/geo";

/** Resultado de la búsqueda del mapa: un lote, un corregimiento, una hoja del Documento Gráfico o una dirección. */
export type PlaceResult =
  | { kind: "lote"; id: string; label: string; detail: string; parcel: Parcel }
  | { kind: "corregimiento"; id: string; label: string; detail: string; bbox: BBox; point: LngLat }
  | { kind: "hoja"; id: string; label: string; detail: string; bbox: BBox; point: LngLat }
  | { kind: "direccion"; id: string; label: string; detail: string; point: LngLat };

export const PLACE_KIND_LABEL: Record<PlaceResult["kind"], string> = {
  lote: "Lote",
  corregimiento: "Corregimiento",
  hoja: "Hoja",
  direccion: "Dirección",
};

/** Minúsculas, sin tildes y con espacios simples: «Vía España» y «via  espana» coinciden. */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Solo letras y dígitos: «10-3B», «10 3b» y «103B» coinciden. */
const compacto = (s: string) => normalizar(s).replace(/[^a-z0-9]/g, "");

/** Corregimientos cuyo nombre contiene la consulta; los que empiezan por ella van primero. */
export function buscarCorregimientos(q: string, corregimientos: GeoJSON.FeatureCollection, max = 4): PlaceResult[] {
  const nq = normalizar(q);
  if (nq.length < 2) return [];
  return corregimientos.features
    .flatMap((f) => {
      const c = f.properties as Corregimiento | null;
      const nombre = c?.nombre ? normalizar(c.nombre) : "";
      const i = nombre.indexOf(nq);
      const bbox = i >= 0 ? featureCollectionBBox({ type: "FeatureCollection", features: [f] }) : null;
      if (!c || !bbox) return [];
      const point: LngLat = c.etiqueta ?? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
      return [{ i, r: { kind: "corregimiento" as const, id: `corr-${c.id}`, label: c.nombre, detail: `Distrito de ${c.distrito ?? "Panamá"} · código ${c.id}`, bbox, point } }];
    })
    .sort((a, b) => a.i - b.i || a.r.label.localeCompare(b.r.label, "es"))
    .slice(0, max)
    .map((x) => x.r);
}

/** Hojas del mosaico cuyo código contiene la consulta (sin distinguir guiones ni espacios). */
export function buscarHojas(q: string, mosaico: GeoJSON.FeatureCollection, max = 4): PlaceResult[] {
  const cq = compacto(q);
  // Las hojas llevan dígitos («10-3B»): una palabra sin dígitos no es un código de hoja.
  if (cq.length < 2 || !/\d/.test(cq)) return [];
  return mosaico.features
    .flatMap((f) => {
      const cell = f.properties as SheetCell | null;
      const i = cell?.hoja ? compacto(cell.hoja).indexOf(cq) : -1;
      const bbox = i >= 0 ? featureCollectionBBox({ type: "FeatureCollection", features: [f] }) : null;
      if (!cell || !bbox) return [];
      const point: LngLat = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
      const detail = `Hoja del Documento Gráfico${cell.escala ? ` · ${cell.escala}` : ""}`;
      return [{ i, r: { kind: "hoja" as const, id: `hoja-${cell.hoja}`, label: cell.hoja, detail, bbox, point } }];
    })
    .sort((a, b) => a.i - b.i || a.r.label.localeCompare(b.r.label, "es", { numeric: true }))
    .slice(0, max)
    .map((x) => x.r);
}

export const loteResult = (p: Parcel): PlaceResult => ({
  kind: "lote",
  id: `lote-${p.id}`,
  label: `${p.id} · Finca ${p.finca}`,
  detail: `${p.origen === "declarado" ? "Lote declarado (no es catastro) · " : ""}${p.address} · ${etiquetaZona(p.zoningCode)}`,
  parcel: p,
});

export const direccionResult = (a: AddressMatch): PlaceResult => ({ kind: "direccion", id: `dir-${a.id}`, label: a.label, detail: a.detail, point: a.point });

/** Orden de la lista: lotes, corregimientos, hojas y direcciones. */
export function combinarResultados(parts: { lotes: Parcel[]; corregimientos: PlaceResult[]; hojas: PlaceResult[]; direcciones: AddressMatch[] }): PlaceResult[] {
  return [...parts.lotes.map(loteResult), ...parts.corregimientos, ...parts.hojas, ...parts.direcciones.map(direccionResult)];
}

/** Radio en que se buscan lotes alrededor de una dirección: más o menos lo que se ve a zoom 17. */
export const LOTES_CERCA_M = 500;

/**
 * ¿Hay algún lote cargado en el lugar elegido? Con caja (corregimiento, hoja): algún lote con el centro dentro.
 * Con punto (dirección): algún lote a menos de `radioM`. Sirve para avisar cuando no hay lote que elegir.
 */
export function hayLotesCerca(lotes: GeoJSON.FeatureCollection, place: PlaceResult, radioM = LOTES_CERCA_M): boolean {
  const centros = lotes.features.flatMap((f) => {
    const b = featureCollectionBBox({ type: "FeatureCollection", features: [f] });
    return b ? [[(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] as LngLat] : [];
  });
  if ("bbox" in place) {
    const [w, s, e, n] = place.bbox;
    return centros.some(([x, y]) => x >= w && x <= e && y >= s && y <= n);
  }
  if (place.kind === "lote") return true;
  const proyectar = localProjector(place.point);
  return centros.some((c) => Math.hypot(...proyectar(c)) <= radioM);
}
