"use client";

import { useEffect, useRef } from "react";
import {
  AttributionControl,
  Map as MlMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import { cn } from "@/lib/utils";
import { landUseColors, LAND_USE_DEFAULT } from "@/config/land-use-colors";
import { zoningFamilyColors } from "@/config/zoning-colors";
import { baseLayerColors, mapColors } from "@/config/base-layer-colors";

export type MapLayerKey =
  | "basemap"
  | "boundary"
  | "corregimientos"
  | "rivers"
  | "sheets"
  | "zoning"
  | "parcels"
  | "landUse"
  | "projects"
  | "infrastructure";

/** Vista del mapa: caja [oeste, sur, este, norte] en WGS84 y zoom. */
export interface MapViewport {
  bounds: [number, number, number, number];
  zoom: number;
}

/** Polígono en curso del modo dibujo. */
export interface MapDrawing {
  points: [number, number][];
  onAddPoint: (lngLat: [number, number]) => void;
}

/** Encuadre programático del mapa. */
export interface MapFocus {
  key: string;
  bbox?: [number, number, number, number];
  point?: [number, number];
  zoom?: number;
}

export interface MapViewerProps {
  /** Lotes (demostración): polígonos con propiedades { id, zoning, landUse }. */
  parcels?: GeoJSON.FeatureCollection;
  /** Zonificación del Documento Gráfico: polígonos con propiedades ZonePolygon. */
  zoning?: GeoJSON.FeatureCollection;
  projects?: GeoJSON.FeatureCollection;
  infrastructure?: GeoJSON.FeatureCollection;
  /** Capas base del índice del Documento Gráfico (DPU). */
  ocean?: GeoJSON.FeatureCollection;
  district?: GeoJSON.FeatureCollection;
  /** Polígonos de corregimientos (capa distrito8v4) con `nombre` y `etiqueta` [lng, lat] para el rótulo. */
  corregimientos?: GeoJSON.FeatureCollection;
  rivers?: GeoJSON.FeatureCollection;
  /** Mosaico de hojas: propiedades SheetCell + `vectorizada` (boolean). */
  sheets?: GeoJSON.FeatureCollection;
  /** Hoja resaltada en la grilla. */
  selectedSheet?: string | null;
  /** Si se pasa, un clic fuera de lotes y zonas entrega el punto [lng, lat] (hoja y corregimiento bajo el cursor). */
  onSelectLocation?: (lngLat: [number, number]) => void;
  /** Vista actual, con retardo tras cada movimiento (moveend) y al cargar. */
  onViewportChange?: (viewport: MapViewport) => void;
  /**
   * Encuadre inicial [oeste, sur, este, norte]. `null` = todavía no disponible (espera sin centrar en los
   * lotes); sin la prop, el mapa se centra en los lotes o en el lote seleccionado.
   */
  initialBounds?: [number, number, number, number] | null;
  visibleLayers?: Partial<Record<MapLayerKey, boolean>>;
  selectedParcelId?: string | null;
  onSelectParcel?: (parcelId: string) => void;
  selectedZoneId?: string | null;
  /** Si se pasa, un clic sobre una zona (fuera de un lote) la selecciona. */
  onSelectZone?: (zoneId: string) => void;
  /**
   * Encuadre pedido desde fuera (p. ej. la búsqueda): una caja o un punto con zoom. Se aplica cada vez que cambia
   * `key`. Si trae `point`, además marca ese punto en el mapa.
   */
  focus?: MapFocus | null;
  /**
   * Modo dibujo del lote: cada clic agrega un vértice [lng, lat] (no selecciona lotes, zonas ni hojas) y el mapa
   * muestra el polígono en curso.
   */
  drawing?: MapDrawing | null;
  /** Encuadre inicial [lng, lat]. Sin él, el mapa se centra en los lotes al recibirlos. */
  center?: [number, number];
  zoom?: number;
  className?: string;
  ariaLabel?: string;
}

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/** Polígono en curso: vértices, contorno y, con 3 o más vértices, el relleno. */
export function draftCollection(points: [number, number][]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = points.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: {} }));
  if (points.length >= 2) {
    const line = points.length >= 3 ? [...points, points[0]] : points;
    features.unshift({ type: "Feature", geometry: { type: "LineString", coordinates: line }, properties: {} });
  }
  if (points.length >= 3) {
    features.unshift({ type: "Feature", geometry: { type: "Polygon", coordinates: [[...points, points[0]]] }, properties: {} });
  }
  return { type: "FeatureCollection", features };
}

/** Expresión MapLibre de color por uso de suelo (misma fuente que la leyenda). */
const LAND_USE_EXPRESSION = ["match", ["get", "landUse"], ...Object.entries(landUseColors).flat(), LAND_USE_DEFAULT] as unknown as ExpressionSpecification;

const familyEntries = Object.entries(zoningFamilyColors);
/** Relleno y contorno por familia de zona (misma fuente que la leyenda: src/config/zoning-colors.ts). */
const ZONING_FILL = ["match", ["get", "familia"], ...familyEntries.flatMap(([k, v]) => [k, v.fill ?? mapColors.zoningNoFill]), mapColors.zoningFallbackFill] as unknown as ExpressionSpecification;
const ZONING_FILL_OPACITY = ["match", ["get", "familia"], ...familyEntries.flatMap(([k, v]) => [k, v.fill ? 0.34 : 0]), 0.3] as unknown as ExpressionSpecification;
const ZONING_LINE = ["match", ["get", "familia"], ...familyEntries.flatMap(([k, v]) => [k, v.line]), mapColors.zoningFallbackLine] as unknown as ExpressionSpecification;

/** Textos de los controles de MapLibre en español. */
const MAP_LOCALE: Record<string, string> = {
  "NavigationControl.ZoomIn": "Acercar",
  "NavigationControl.ZoomOut": "Alejar",
  "NavigationControl.ResetBearing": "Restablecer orientación",
  "ScrollZoomBlocker.CtrlMessage": "Use Ctrl + rueda para acercar el mapa",
  "TouchPanBlocker.Message": "Use dos dedos para mover el mapa",
  "AttributionControl.ToggleAttribution": "Mostrar u ocultar la atribución",
};

/**
 * La zonificación se oculta al alejar el mapa por zoom de capa, sin vaciar la fuente: vaciarla y rellenarla
 * al cruzar el umbral hacía que la capa se apagara y se encendiera.
 */
const ZONING_LAYER_MINZOOM = 12.5;

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const DEFAULT_CENTER: [number, number] = [-79.531, 8.9953];

/**
 * Mapa base: estilo vectorial Positron de OpenFreeMap (datos © OpenStreetMap, esquema OpenMapTiles; sin clave).
 * Las teselas ráster de CARTO (light_all) exigen clave de API desde 2026 y las de openstreetmap.org no
 * admiten este uso. El estilo se descarga al cargar el mapa y se inserta DEBAJO de las capas propias; si
 * falla, queda el fondo de papel y las capas vectoriales siguen legibles.
 */
const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const GLYPHS_URL = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const LABEL_FONT = ["Noto Sans Bold"];
/** El mapa base agrega su propia atribución (OpenFreeMap © OpenMapTiles, datos de OpenStreetMap). */
const MAP_ATTRIBUTION =
  "© OpenStreetMap contributors · Zonificación: Documento Gráfico del PLOT (DPU), referencial · Límites e índice de hojas: DPU – Alcaldía de Panamá · Corregimientos: capa distrito8v4 (08-08)";
/** Capas del estilo Positron que no aportan a la lectura urbana (escudos de ruta). */
const BASEMAP_SKIP = /shield/;

const BASE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: GLYPHS_URL,
  sources: {},
  layers: [{ id: "paper", type: "background", paint: { "background-color": mapColors.paper } }],
};

/** Inserta las capas del mapa base bajo las capas propias. Devuelve los ids insertados. */
async function addBasemap(map: MlMap, signal: AbortSignal): Promise<string[]> {
  const res = await fetch(BASEMAP_STYLE_URL, { signal });
  if (!res.ok) throw new Error(`Mapa base: HTTP ${res.status}`);
  const style = (await res.json()) as StyleSpecification;
  if (signal.aborted) return [];
  if (typeof style.sprite === "string") map.setSprite(style.sprite);
  for (const [id, source] of Object.entries(style.sources)) map.addSource(`bm-${id}`, source);
  const ids: string[] = [];
  for (const layer of style.layers) {
    if (layer.type === "background" || BASEMAP_SKIP.test(layer.id) || !("source" in layer) || typeof layer.source !== "string") continue;
    const id = `bm-${layer.id}`;
    // Rótulos de calles sobre el relleno de zonas; el resto (vías, edificios, agua) debajo.
    map.addLayer({ ...layer, id, source: `bm-${layer.source}` } as typeof layer, layer.type === "symbol" ? "landuse-fill" : FIRST_OWN_LAYER);
    ids.push(id);
  }
  return ids;
}

/** Primera capa propia: el mapa base se inserta debajo. */
const FIRST_OWN_LAYER = "district-mask";

/** Máscara que atenúa todo lo que queda fuera del distrito (el mundo con el distrito como hueco). */
export function outsideMask(district: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const holes = district.features.flatMap((f) => {
    const g = f.geometry;
    if (g?.type === "Polygon") return g.coordinates.slice(0, 1);
    if (g?.type === "MultiPolygon") return g.coordinates.map((p) => p[0]).filter(Boolean);
    return [];
  });
  if (!holes.length) return EMPTY;
  const world: GeoJSON.Position[] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...holes] } }] };
}

/** Puntos de rótulo desde la propiedad `etiqueta` [lng, lat] (punto interior calculado al preparar la capa). */
export function labelPoints(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fc.features.flatMap((f) => {
      const p = f.properties?.etiqueta;
      return Array.isArray(p) && p.length === 2 ? [{ type: "Feature" as const, properties: { nombre: f.properties?.nombre ?? "" }, geometry: { type: "Point" as const, coordinates: p as number[] } }] : [];
    }),
  };
}

/** Trama diagonal para las hojas pendientes de vectorizar. */
function hatchImage(hex: string, size = 8) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = (x + y) % size < 1.5;
      data.set([r, g, b, on ? 150 : 0], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}

const SHEETS_VECTORIZED = ["==", ["get", "vectorizada"], true] as unknown as ExpressionSpecification;
const SHEETS_PENDING = ["!=", ["get", "vectorizada"], true] as unknown as ExpressionSpecification;
/** Por debajo de este zoom la grilla de hojas se rotula y se puede elegir con un clic en cualquier punto. */
const SHEETS_DETAIL_MAXZOOM = 14;

function css(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

type Bounds = [[number, number], [number, number]];

/** Caja envolvente de una colección de polígonos/puntos (null si está vacía). */
export function collectionBounds(fc: GeoJSON.FeatureCollection): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (c: GeoJSON.Position) => {
    minX = Math.min(minX, c[0]);
    maxX = Math.max(maxX, c[0]);
    minY = Math.min(minY, c[1]);
    maxY = Math.max(maxY, c[1]);
  };
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Point") visit(g.coordinates);
    else if (g.type === "Polygon") g.coordinates[0]?.forEach(visit);
    else if (g.type === "MultiPolygon") g.coordinates.forEach((p) => p[0]?.forEach(visit));
  }
  return Number.isFinite(minX) ? [[minX, minY], [maxX, maxY]] : null;
}

export function MapViewer({
  parcels = EMPTY,
  zoning = EMPTY,
  projects = EMPTY,
  infrastructure = EMPTY,
  ocean = EMPTY,
  district = EMPTY,
  corregimientos = EMPTY,
  rivers = EMPTY,
  sheets = EMPTY,
  selectedSheet = null,
  onSelectLocation,
  onViewportChange,
  initialBounds,
  visibleLayers = { basemap: true, parcels: true, zoning: true, projects: true },
  selectedParcelId = null,
  focus = null,
  drawing = null,
  onSelectParcel,
  selectedZoneId = null,
  onSelectZone,
  center,
  zoom = 16,
  className,
  ariaLabel = "Mapa de lotes y zonificación",
}: MapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<Map<string, () => void>>(new Map());
  const centeredRef = useRef(Boolean(center) || initialBounds !== undefined);
  const fittedRef = useRef(false);
  const basemapIdsRef = useRef<string[]>([]);
  const basemapOnRef = useRef(true);
  const onSelectRef = useRef(onSelectParcel);
  const onSelectZoneRef = useRef(onSelectZone);
  const onSelectLocationRef = useRef(onSelectLocation);
  const drawingRef = useRef(drawing);
  const onViewportRef = useRef(onViewportChange);
  useEffect(() => {
    onSelectRef.current = onSelectParcel;
    onSelectZoneRef.current = onSelectZone;
    onSelectLocationRef.current = onSelectLocation;
    onViewportRef.current = onViewportChange;
  }, [onSelectParcel, onSelectZone, onSelectLocation, onViewportChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MlMap({
      container: containerRef.current,
      style: BASE_STYLE,
      center: center ?? DEFAULT_CENTER,
      zoom,
      maxZoom: 20,
      attributionControl: false,
      locale: MAP_LOCALE,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    map.addControl(new AttributionControl({ compact: true, customAttribution: MAP_ATTRIBUTION }), "bottom-right");
    const basemapAbort = new AbortController();
    let viewportTimer: ReturnType<typeof setTimeout> | undefined;
    const emitViewport = () => {
      const b = map.getBounds();
      onViewportRef.current?.({ bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom: map.getZoom() });
    };
    map.on("moveend", () => {
      clearTimeout(viewportTimer);
      viewportTimer = setTimeout(emitViewport, 250);
    });
    map.on("load", () => {
      const brand = css("--mp-brand", mapColors.brand);
      const dim = css("--mp-dimension", mapColors.dimension);
      const ink = css("--mp-ink", mapColors.ink);
      const c = baseLayerColors;
      map.addImage("sheet-hatch", hatchImage(c.sheets.pending));
      for (const id of ["ocean", "district", "district-mask", "corregimientos", "corregimientos-labels", "rivers"]) map.addSource(id, { type: "geojson", data: EMPTY });
      map.addSource("sheets", { type: "geojson", data: EMPTY, promoteId: "hoja" });
      map.addSource("zoning", { type: "geojson", data: EMPTY, promoteId: "id" });
      map.addSource("parcels", { type: "geojson", data: EMPTY, promoteId: "id" });
      map.addSource("projects", { type: "geojson", data: EMPTY });
      map.addSource("infrastructure", { type: "geojson", data: EMPTY });

      // Capas base del índice del Documento Gráfico (debajo de la zonificación, encima del mapa base).
      // La máscara atenúa lo que queda fuera del distrito; el océano va encima para que se lea como agua.
      map.addLayer({ id: "district-mask", type: "fill", source: "district-mask", paint: { "fill-color": c.district.mask, "fill-opacity": 0.08 } });
      map.addLayer({ id: "ocean-fill", type: "fill", source: "ocean", paint: { "fill-color": c.ocean.fill, "fill-opacity": 0.6 } });
      map.addLayer({
        id: "sheets-fill",
        type: "fill",
        source: "sheets",
        paint: {
          "fill-color": ["case", SHEETS_VECTORIZED, c.sheets.vectorized, c.sheets.pending] as unknown as ExpressionSpecification,
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, ["case", SHEETS_VECTORIZED, 0.05, 0.02], 13, ["case", SHEETS_VECTORIZED, 0.03, 0.01], SHEETS_DETAIL_MAXZOOM, 0] as unknown as ExpressionSpecification,
        },
      });
      map.addLayer({
        id: "sheets-hatch",
        type: "fill",
        source: "sheets",
        maxzoom: SHEETS_DETAIL_MAXZOOM,
        filter: SHEETS_PENDING,
        paint: { "fill-pattern": "sheet-hatch", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.14, 13, 0.1] },
      });
      map.addLayer({
        id: "rivers-line",
        type: "line",
        source: "rivers",
        minzoom: 12,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": c.rivers.line, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.9, 15, 1.6, 18, 2.6], "line-opacity": 0.85 },
      });
      map.addLayer({
        id: "sheets-line",
        type: "line",
        source: "sheets",
        filter: SHEETS_VECTORIZED,
        paint: {
          "line-color": c.sheets.vectorized,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.9, 14, 1.2],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.4, 13, 0.35, 15, 0.15],
        },
      });
      map.addLayer({
        id: "sheets-line-pending",
        type: "line",
        source: "sheets",
        filter: SHEETS_PENDING,
        paint: {
          "line-color": c.sheets.pending,
          "line-width": 0.8,
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.35, 13, 0.3, 15, 0.1],
          "line-dasharray": [3, 2],
        },
      });
      // Divisiones de corregimientos (capa distrito8v4): visibles desde la escala del distrito, encima del índice de hojas.
      map.addLayer({
        id: "corregimientos-line",
        type: "line",
        source: "corregimientos",
        minzoom: 8,
        layout: { "line-join": "round" },
        paint: {
          "line-color": c.corregimientos.line,
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.3, 11, 1.8, 14, 2.2, 17, 2.6],
          "line-opacity": 0.9,
          "line-dasharray": [4, 1.5],
        },
      });
      map.addLayer({
        id: "district-line-halo",
        type: "line",
        source: "district",
        layout: { "line-join": "round" },
        paint: { "line-color": c.district.halo, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3.5, 14, 5.5], "line-opacity": 0.8 },
      });
      map.addLayer({
        id: "district-line",
        type: "line",
        source: "district",
        layout: { "line-join": "round" },
        paint: { "line-color": c.district.line, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.6, 14, 2.6], "line-opacity": 0.9 },
      });

      // Zonificación real (Documento Gráfico)
      map.addLayer({ id: "zoning-fill", type: "fill", source: "zoning", minzoom: ZONING_LAYER_MINZOOM, paint: { "fill-color": ZONING_FILL, "fill-opacity": ZONING_FILL_OPACITY } });
      map.addLayer({
        id: "zoning-line",
        type: "line",
        source: "zoning",
        minzoom: ZONING_LAYER_MINZOOM,
        filter: ["==", ["get", "estado"], "ok"],
        paint: { "line-color": ZONING_LINE, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.4, 16, 1.1, 18, 1.6], "line-opacity": 0.85 },
      });
      map.addLayer({
        id: "zoning-line-unlabeled",
        type: "line",
        source: "zoning",
        minzoom: ZONING_LAYER_MINZOOM,
        filter: ["==", ["get", "estado"], "sin_etiqueta"],
        paint: { "line-color": zoningFamilyColors.sin_etiqueta.line, "line-width": 0.8, "line-opacity": 0.55, "line-dasharray": [3, 2] },
      });
      map.addLayer({
        id: "zoning-line-conflict",
        type: "line",
        source: "zoning",
        minzoom: ZONING_LAYER_MINZOOM,
        filter: ["==", ["get", "estado"], "conflicto"],
        paint: { "line-color": zoningFamilyColors.conflicto.line, "line-width": 1.6, "line-opacity": 0.9, "line-dasharray": [2, 1.5] },
      });

      // Lotes: de demostración (tinta) y dibujados por el profesional (color de cota, más grueso: no son catastro).
      map.addLayer({ id: "landuse-fill", type: "fill", source: "parcels", layout: { visibility: "none" }, paint: { "fill-color": LAND_USE_EXPRESSION, "fill-opacity": 0.6 } });
      map.addLayer({ id: "parcel-fill", type: "fill", source: "parcels", paint: { "fill-color": c.parcels.fill, "fill-opacity": 0.45 } });
      map.addLayer({
        id: "parcel-line",
        type: "line",
        source: "parcels",
        paint: {
          "line-color": ["case", ["==", ["get", "origen"], "declarado"], dim, ink] as unknown as ExpressionSpecification,
          "line-width": ["interpolate", ["linear"], ["zoom"], 14, ["case", ["==", ["get", "origen"], "declarado"], 1.5, 0.5], 17, ["case", ["==", ["get", "origen"], "declarado"], 2.5, 1], 19, ["case", ["==", ["get", "origen"], "declarado"], 3, 1.4]] as unknown as ExpressionSpecification,
          "line-opacity": 0.85,
        },
      });
      map.addLayer({ id: "zone-selected", type: "line", source: "zoning", minzoom: ZONING_LAYER_MINZOOM, filter: ["==", ["get", "id"], ""], paint: { "line-color": brand, "line-width": 3 } });
      map.addLayer({ id: "parcel-selected-fill", type: "fill", source: "parcels", filter: ["==", ["get", "id"], ""], paint: { "fill-color": dim, "fill-opacity": 0.18 } });
      map.addLayer({ id: "parcel-selected", type: "line", source: "parcels", filter: ["==", ["get", "id"], ""], paint: { "line-color": dim, "line-width": 3 } });

      map.addLayer({
        id: "zoning-label",
        type: "symbol",
        source: "zoning",
        minzoom: 15.5,
        filter: ["has", "codigo"],
        layout: { "text-field": ["coalesce", ["get", "codigo"], ""], "text-size": 12, "text-font": LABEL_FONT, "text-padding": 4, "text-max-width": 8 },
        paint: { "text-color": mapColors.labelText, "text-halo-color": mapColors.halo, "text-halo-width": 1.6 },
      });
      map.addLayer({ id: "sheet-selected", type: "line", source: "sheets", filter: ["==", ["get", "hoja"], ""], paint: { "line-color": brand, "line-width": 2.5 } });
      map.addLayer({
        id: "sheets-label",
        type: "symbol",
        source: "sheets",
        maxzoom: SHEETS_DETAIL_MAXZOOM,
        layout: {
          "text-field": ["get", "hoja"],
          "text-font": LABEL_FONT,
          "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 13, 13],
          "text-padding": 2,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": ["case", SHEETS_VECTORIZED, c.sheets.vectorized, c.sheets.label] as unknown as ExpressionSpecification,
          "text-halo-color": mapColors.halo,
          "text-halo-width": 1.4,
        },
      });
      map.addLayer({
        id: "corregimientos-label",
        type: "symbol",
        source: "corregimientos-labels",
        minzoom: 9.5,
        maxzoom: 15,
        layout: {
          "text-field": ["get", "nombre"],
          "text-font": LABEL_FONT,
          "text-size": ["interpolate", ["linear"], ["zoom"], 9.5, 10, 11, 11, 14, 14],
          "text-transform": "uppercase",
          "text-letter-spacing": 0.08,
          "text-max-width": 9,
          "text-padding": 6,
        },
        paint: { "text-color": c.corregimientos.label, "text-halo-color": mapColors.halo, "text-halo-width": 1.6 },
      });
      map.addLayer({ id: "infra-line", type: "line", source: "infrastructure", paint: { "line-color": mapColors.processing, "line-width": 2, "line-dasharray": [2, 2] } });
      map.addSource("draft", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "draft-fill", type: "fill", source: "draft", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": dim, "fill-opacity": 0.18 } });
      map.addLayer({ id: "draft-line", type: "line", source: "draft", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": dim, "line-width": 2.5, "line-dasharray": [2, 1] } });
      map.addLayer({ id: "draft-vertex", type: "circle", source: "draft", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": mapColors.white, "circle-stroke-color": dim, "circle-stroke-width": 2.5 } });
      map.addSource("search-point", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "search-point-halo", type: "circle", source: "search-point", paint: { "circle-radius": 13, "circle-color": brand, "circle-opacity": 0.18 } });
      map.addLayer({ id: "search-point", type: "circle", source: "search-point", paint: { "circle-radius": 6, "circle-color": brand, "circle-stroke-color": mapColors.white, "circle-stroke-width": 2.5 } });
      map.addLayer({ id: "projects-circle", type: "circle", source: "projects", paint: { "circle-radius": 6, "circle-color": brand, "circle-stroke-color": mapColors.white, "circle-stroke-width": 2 } });

      const hitLayers = (layers: string[]) => layers.filter((l) => map.getLayer(l) && map.getLayoutProperty(l, "visibility") !== "none");
      map.on("click", (e: MapMouseEvent) => {
        if (drawingRef.current) {
          drawingRef.current.onAddPoint([e.lngLat.lng, e.lngLat.lat]);
          return;
        }
        const parcel = map.queryRenderedFeatures(e.point, { layers: hitLayers(["parcel-fill"]) })[0];
        const parcelId = parcel?.properties?.id;
        if (typeof parcelId === "string" && onSelectRef.current) {
          onSelectRef.current(parcelId);
          return;
        }
        if (onSelectZoneRef.current) {
          const zone = map.queryRenderedFeatures(e.point, { layers: hitLayers(["zoning-fill"]) })[0];
          const zoneId = zone?.properties?.id;
          if (typeof zoneId === "string") {
            onSelectZoneRef.current(zoneId);
            return;
          }
        }
        onSelectLocationRef.current?.([e.lngLat.lng, e.lngLat.lat]);
      });
      map.on("mousemove", (e: MapMouseEvent) => {
        if (drawingRef.current) {
          map.getCanvas().style.cursor = "crosshair";
          return;
        }
        const layers = hitLayers([
          ...(onSelectRef.current ? ["parcel-fill"] : []),
          ...(onSelectZoneRef.current ? ["zoning-fill"] : []),
          // A escala de barrio la grilla no invita al clic; el clic sigue abriendo la hoja si no hay zona.
          ...(onSelectLocationRef.current && map.getZoom() < SHEETS_DETAIL_MAXZOOM ? ["sheets-fill"] : []),
        ]);
        const hit = layers.length > 0 && map.queryRenderedFeatures(e.point, { layers }).length > 0;
        map.getCanvas().style.cursor = hit ? "pointer" : "";
      });
      // La atribución compacta arranca plegada (botón «i»); se despliega al pulsarla.
      map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      addBasemap(map, basemapAbort.signal)
        .then((ids) => {
          basemapIdsRef.current = ids;
          ids.forEach((l) => map.setLayoutProperty(l, "visibility", basemapOnRef.current ? "visible" : "none"));
        })
        .catch(() => {
          // Sin mapa base: queda el fondo de papel.
        });
      readyRef.current = true;
      pendingRef.current.forEach((fn) => fn());
      pendingRef.current.clear();
      emitViewport();
    });
    return () => {
      clearTimeout(viewportTimer);
      basemapAbort.abort();
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // El mapa se crea una sola vez; center/zoom solo son el encuadre inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Ejecuta `fn` cuando el estilo esté cargado; la última versión por clave gana. */
  const whenReady = (key: string, fn: (map: MlMap) => void) => {
    const map = mapRef.current;
    if (!map) return;
    if (readyRef.current) fn(map);
    else pendingRef.current.set(key, () => fn(map));
  };
  const setData = (source: string, data: GeoJSON.FeatureCollection) =>
    whenReady(`data:${source}`, (map) => (map.getSource(source) as GeoJSONSource | undefined)?.setData(data));

  // Una fuente por efecto: la zonificación (≈1 MB) solo se reenvía al worker cuando cambia.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setData("zoning", zoning), [zoning]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setData("projects", projects), [projects]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setData("ocean", ocean), [ocean]);
  useEffect(() => {
    setData("district", district);
    setData("district-mask", outsideMask(district));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district]);
  useEffect(() => {
    setData("corregimientos", corregimientos);
    setData("corregimientos-labels", labelPoints(corregimientos));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corregimientos]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setData("rivers", rivers), [rivers]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setData("sheets", sheets), [sheets]);
  const [bw, bs, be, bn] = initialBounds ?? [];
  useEffect(() => {
    if (bw === undefined || bs === undefined || be === undefined || bn === undefined || fittedRef.current) return;
    whenReady("fit", (map) => {
      fittedRef.current = true;
      map.fitBounds([[bw, bs], [be, bn]], { padding: 24, duration: 0 });
    });
  }, [bw, bs, be, bn]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setData("infrastructure", infrastructure), [infrastructure]);
  useEffect(() => {
    whenReady("data:parcels", (map) => {
      (map.getSource("parcels") as GeoJSONSource | undefined)?.setData(parcels);
      // Encuadre inicial en los lotes cuando no se indicó un centro ni hay lote seleccionado.
      if (!centeredRef.current && parcels.features.length > 0) {
        centeredRef.current = true;
        const b = collectionBounds(parcels);
        if (b && !selectedParcelId) map.jumpTo({ center: [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2], zoom });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcels]);

  const {
    basemap = true,
    boundary,
    corregimientos: corregimientosOn,
    rivers: riversOn,
    sheets: sheetsOn,
    zoning: zoningOn,
    landUse,
    parcels: parcelsOn = true,
    projects: projectsOn,
    infrastructure: infraOn,
  } = visibleLayers;
  useEffect(() => {
    whenReady("visibility", (map) => {
      const set = (layers: string[], on: boolean | undefined) => layers.forEach((l) => map.setLayoutProperty(l, "visibility", on ? "visible" : "none"));
      basemapOnRef.current = basemap;
      set(basemapIdsRef.current, basemap);
      set(["ocean-fill", "district-mask", "district-line-halo", "district-line"], boundary);
      set(["corregimientos-line", "corregimientos-label"], corregimientosOn);
      set(["rivers-line"], riversOn);
      set(["sheets-fill", "sheets-hatch", "sheets-line", "sheets-line-pending", "sheets-label", "sheet-selected"], sheetsOn);
      set(["zoning-fill", "zoning-line", "zoning-line-unlabeled", "zoning-line-conflict", "zoning-label", "zone-selected"], zoningOn);
      set(["landuse-fill"], landUse);
      set(["parcel-fill", "parcel-line"], parcelsOn);
      set(["projects-circle"], projectsOn);
      set(["infra-line"], infraOn);
    });
  }, [basemap, boundary, corregimientosOn, riversOn, sheetsOn, zoningOn, landUse, parcelsOn, projectsOn, infraOn]);

  useEffect(() => {
    whenReady("selection", (map) => {
      map.setFilter("parcel-selected", ["==", ["get", "id"], selectedParcelId ?? ""]);
      map.setFilter("parcel-selected-fill", ["==", ["get", "id"], selectedParcelId ?? ""]);
      map.setFilter("zone-selected", ["==", ["get", "id"], selectedZoneId ?? ""]);
      map.setFilter("sheet-selected", ["==", ["get", "hoja"], selectedSheet ?? ""]);
    });
  }, [selectedParcelId, selectedZoneId, selectedSheet]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedParcelId) return;
    const feature = parcels.features.find((f) => f.properties?.id === selectedParcelId);
    if (!feature) return;
    const b = collectionBounds({ type: "FeatureCollection", features: [feature] });
    if (b) map.fitBounds(b, { padding: 140, maxZoom: 17.6, duration: 400 });
  }, [selectedParcelId, parcels]);

  const draftKey = drawing ? JSON.stringify(drawing.points) : "";
  useEffect(() => {
    drawingRef.current = drawing;
  });
  const dibujando = Boolean(drawing);
  useEffect(() => {
    // El doble clic acercaría el mapa y agregaría dos vértices iguales.
    whenReady("draft-zoom", (map) => (dibujando ? map.doubleClickZoom.disable() : map.doubleClickZoom.enable()));
  }, [dibujando]);
  useEffect(() => {
    const points = drawing?.points ?? [];
    whenReady("draft", (map) => {
      if (!points.length) map.getCanvas().style.cursor = "";
      (map.getSource("draft") as GeoJSONSource | undefined)?.setData(draftCollection(points));
    });
    // Solo cuando cambian los vértices (la clave los resume).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const focusKey = focus?.key;
  useEffect(() => {
    const { bbox, point, zoom: z } = focus ?? {};
    whenReady("focus", (map) => {
      (map.getSource("search-point") as GeoJSONSource | undefined)?.setData(
        point ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: point }, properties: {} }] } : EMPTY,
      );
      if (bbox) map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 48, maxZoom: 16, duration: 600 });
      else if (point) map.flyTo({ center: point, zoom: z ?? 17, duration: 800 });
    });
    // Solo al cambiar la clave: el mismo encuadre no se repite en cada render. Sin foco, se quita el marcador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  return (
    <div className={cn("relative min-h-map-sm overflow-hidden rounded-md border bg-plan-paper", className)}>
      {/* Estilo en línea: maplibre-gl.css fija .maplibregl-map { position: relative } fuera de las capas de
          Tailwind y anularía la utilidad `absolute`, dejando el mapa con altura 0. */}
      <div ref={containerRef} role="region" aria-label={ariaLabel} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
