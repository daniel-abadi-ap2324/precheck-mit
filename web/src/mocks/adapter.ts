import type { ApiClient } from "@/services/api/contract";
import { ApiError } from "@/services/api/contract";
import { detalleExpediente, esIdDeExpediente, esPrecheckDeExpediente, listarExpedientes } from "@/services/expedientes/cliente";
import { geocodeViaApi } from "@/services/geocoding/cliente";
import { catalogoDeReglas } from "@/services/reglas/cliente";
import { corregirDatos, ejemplosDePlanos, estadoDelPlano, subirPlano, usarEjemplo, type EstadoPlanoServidor } from "@/services/planos/cliente";
import { esPreCheckReal, iniciarPreCheckReal, leerPreCheckReciente, leerPreCheckServidor, progresoReal } from "@/services/prechecks/cliente";
import { actualizarProyectoWeb, crearProyectoWeb, eliminarProyectoWeb, esProyectoWeb, leerProyectoWeb, listarProyectosWeb, type ProyectoServidor } from "@/services/proyectos/cliente";
import type { ComplianceRule, Corregimiento, NormaZona, Parcel, Plan, PreCheck, PreCheckProgress, Project, Property, SheetCell, ZoningIndex, ZonePolygon } from "@/types";
import { featureAtPoint } from "@/lib/gis/geo";
import { anilloCerrado, areaM2, limpiarVertices, validarLote } from "@/lib/gis/lote-dibujado";
import { MUESTRAS_MINIMAS, puntoInterior, zonasDelLote } from "@/lib/gis/zonas-del-lote";
import { isDualLabel, zoneNorm } from "@/lib/gis/zona";
import rulesJson from "./data/rules.json";
import { aplicarAlLote, indiceDeCumplimiento, resumen } from "./aplicabilidad";
import precheckJson from "./data/precheck-betania.json";
import { zonings } from "./data/zoning";
import { PIPELINE } from "@/lib/pipeline";
import { esCorridaDePrueba } from "@/lib/corridas-prueba";
import { parcels } from "./data/parcels";
import { currentUser, notifications, plans, projects, reviewers } from "./data/projects";

/**
 * Adaptador de datos de prueba. Latencia corta para ver los estados de carga sin hacer esperar.
 * `rules` son las reglas de la demostración (data/rules.json): el catálogo que se muestra es el real
 * (GET /api/reglas); estas solo quedan de respaldo para los resultados de Betania y si la ruta no responde.
 */
const rules = rulesJson as ComplianceRule[];
const demoPrecheck = precheckJson as PreCheck;
const LATENCY_MS = Number(process.env.NEXT_PUBLIC_MOCK_LATENCY ?? 250);
const wait = <T,>(value: T, ms = LATENCY_MS): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(value)), ms));

const store = {
  projects: [...projects],
  plans: [...plans],
  runs: new Map<string, { start: number; projectId: string }>(),
  /** Lotes dibujados por el profesional en esta sesión. */
  declared: [] as Parcel[],
};
const allParcels = () => [...parcels, ...store.declared];

/**
 * Ficha del Anexo 4 para el código del lote. Con el polígono del Documento Gráfico se decide como en el mapa
 * (zoneNorm): nunca una ficha del PLOT para una zona del MIVIOT ni para un polígono sin código único. Sin ficha
 * cargada, `zoning` queda en null: no se sustituye por otra ficha.
 */
export function resolverFicha(
  parcel: Pick<Parcel, "zoningCode" | "zoningSource" | "normaZona">,
  zone: ZonePolygon | null,
): Pick<Property, "zoning" | "normaZona"> {
  const code = parcel.zoningCode;
  // Lote declarado: la norma se fijó al declararlo, con el polígono completo.
  if (parcel.normaZona) {
    const zoning = parcel.normaZona === "ficha" ? (zonings.find((z) => normalizeCode(z.code) === normalizeCode(code)) ?? null) : null;
    return { zoning, normaZona: zoning ? "ficha" : parcel.normaZona === "ficha" ? "ficha_no_cargada" : parcel.normaZona };
  }
  // Con polígono de origen ilegible no se busca por código: un RM1 del MIVIOT no es el RM-1 del PLOT.
  if (parcel.zoningSource && !zone) return { zoning: null, normaZona: "revision" };
  if (zone) {
    if (isDualLabel(zone)) return { zoning: null, normaZona: "revision" };
    const norm = zoneNorm(zone, zonings);
    return { zoning: norm.kind === "ficha" ? norm.zoning : null, normaZona: norm.kind };
  }
  const zoning = zonings.find((z) => normalizeCode(z.code) === normalizeCode(code)) ?? null;
  return { zoning, normaZona: zoning ? "ficha" : "ficha_no_cargada" };
}
const normalizeCode = (code: string) => code.toUpperCase().replace(/[\s-]/g, "");
let declaredSeq = 0;

/** Estado del servidor (queued/processing/ready/failed) → estado del plano en la interfaz. */
function planDesdeServidor(base: Plan, srv: EstadoPlanoServidor): Plan {
  if (srv.status === "ready") return { ...base, status: "ready", progress: 100, extraction: srv.extraccion ?? null, error: undefined };
  if (srv.status === "failed") return { ...base, status: "failed", progress: 100, extraction: null, error: srv.error ?? "No se pudo leer el plano." };
  return { ...base, status: "processing", progress: 100, extraction: null };
}

function agregarPlanDelServidor(projectId: string, srv: EstadoPlanoServidor, sizeBytes: number): Plan {
  const base: Plan = { id: srv.id, projectId, fileName: srv.fileName, format: "PDF", sizeBytes, status: "processing", progress: 100, sheets: [] };
  const plan = planDesdeServidor(base, srv);
  store.plans = [...store.plans, plan];
  return plan;
}

/**
 * Proyecto creado en la web (guardado en el servidor): su lote dibujado vuelve al store para que la ficha del lote
 * funcione tras recargar.
 */
function registrarProyectoWeb(p: ProyectoServidor): Project {
  if (p.loteDibujado && !store.declared.some((d) => d.id === p.loteDibujado?.id)) store.declared = [...store.declared, p.loteDibujado];
  return p.project;
}

/** Planos de un proyecto web con su estado actual en el servidor. */
async function planosDelProyectoWeb(projectId: string): Promise<Plan[]> {
  const { planes } = await leerProyectoWeb(projectId);
  const planos = await Promise.all(
    planes.map(async (x) => {
      const base: Plan = { id: x.id, projectId, fileName: x.fileName, format: x.format, sizeBytes: x.sizeBytes, status: "uploaded", progress: 100, sheets: [] };
      if (x.format !== "PDF") return base;
      const srv = await estadoDelPlano(x.id).catch(() => ({ id: x.id, status: "failed" as const, fileName: x.fileName, error: "El plano ya no está en el servidor." }));
      return planDesdeServidor(base, srv);
    }),
  );
  const ids = new Set(planos.map((p) => p.id));
  store.plans = [...store.plans.filter((p) => !ids.has(p.id)), ...planos];
  return planos;
}

/** Un plano nuevo de un proyecto web queda anotado en el servidor (si falla, el plano sigue en esta sesión). */
async function anotarPlano(plan: Plan): Promise<Plan> {
  if (esProyectoWeb(plan.projectId)) {
    const agregarPlan = { id: plan.id, fileName: plan.fileName, format: plan.format, sizeBytes: plan.sizeBytes };
    await actualizarProyectoWeb(plan.projectId, { agregarPlan }).catch(() => undefined);
  }
  return plan;
}

async function refrescarPlano(planId: string): Promise<Plan> {
  let actual = store.plans.find((p) => p.id === planId);
  // Tras recargar la página el plano ya no está en memoria, pero el servidor sí lo tiene.
  if (!actual && /^plan-[0-9a-f-]{36}$/.test(planId)) {
    const srv = await estadoDelPlano(planId);
    actual = { id: planId, projectId: "", fileName: srv.fileName, format: "PDF", sizeBytes: srv.sizeBytes ?? 0, status: "processing", progress: 100, sheets: [] };
    store.plans = [...store.plans, actual];
  }
  if (!actual) throw new ApiError("plan.inexistente", "El plano no existe.", { planId });
  if (actual.format !== "PDF" || actual.status === "ready" || actual.status === "failed" || actual.status === "uploaded") return actual;
  const nuevo = planDesdeServidor(actual, await estadoDelPlano(planId));
  store.plans = store.plans.map((p) => (p.id === planId ? nuevo : p));
  return nuevo;
}

/**
 * Resultados de demostración aplicados al lote del proyecto: fuera de la ficha RM-2 para la que se calcularon,
 * los de reglas de zona van a revisión (aplicabilidad.ts). El proyecto original los conserva tal cual.
 */
async function resultadosDelProyecto(projectId: string) {
  const project = store.projects.find((p) => p.id === projectId);
  const parcel = project?.parcelId ? allParcels().find((p) => p.id === project.parcelId) : undefined;
  if (!parcel) return { results: demoPrecheck.results, summary: demoPrecheck.summary };
  const zone = parcel.zoningSource ? await findZonePolygon(parcel.zoningSource.hoja, parcel.zoningSource.poligono) : null;
  const { zoning, normaZona } = resolverFicha(parcel, zone);
  const results = aplicarAlLote(demoPrecheck.results, rules, { id: parcel.id, zoningCode: zoning?.code ?? parcel.zoningCode, normaZona });
  return { results, summary: resumen(results) };
}

const RUN_MS = 7_000;

function progressAt(elapsed: number): PreCheckProgress {
  const percent = Math.min(100, Math.round((elapsed / RUN_MS) * 100));
  const ruleTotal = demoPrecheck.summary.checked;
  if (percent >= 100) return { stage: "done", percent: 100, ruleIndex: ruleTotal, ruleTotal };
  const idx = Math.min(PIPELINE.length - 1, Math.floor((percent / 100) * PIPELINE.length));
  const checksStart = (6 / PIPELINE.length) * 100;
  const checksEnd = (7 / PIPELINE.length) * 100;
  const ruleIndex = percent < checksStart ? 0 : percent >= checksEnd ? ruleTotal : Math.round(((percent - checksStart) / (checksEnd - checksStart)) * ruleTotal);
  return { stage: PIPELINE[idx].stage, percent, ruleIndex, ruleTotal };
}

function findProject(id: string): Project {
  const p = store.projects.find((x) => x.id === id);
  if (!p) throw new ApiError("proyecto.inexistente", "El proyecto no existe.", { id });
  return p;
}

/** Carga JSON de public/ una sola vez por sesión; si falla, se olvida la promesa para reintentar. */
function cachedJson<T>(cache: Map<string, Promise<T>>, url: string, fail: () => ApiError): Promise<T> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((res) => {
        if (!res.ok) throw fail();
        return res.json() as Promise<T>;
      })
      .catch((err: unknown) => {
        cache.delete(url);
        throw err instanceof ApiError ? err : fail();
      });
    cache.set(url, p);
  }
  return p;
}

/**
 * Capas base del índice del Documento Gráfico (carpeta Zonificacion_MUPA de la DPU, WGS84), generadas por
 * scripts/preparar-capas-base.py.
 */
export const BASE_LAYER_URLS = {
  ocean: "/data/base/oceano.geojson",
  district: "/data/base/distrito.geojson",
  corregimientos: "/data/base/corregimientos.geojson",
  rivers: "/data/base/rios.geojson",
  sheets: "/data/base/mosaico.geojson",
} as const;
type BaseLayer = keyof typeof BASE_LAYER_URLS;
const isBaseLayer = (layer: string): layer is BaseLayer => layer in BASE_LAYER_URLS;

/** Zonificación por hoja (scripts/preparar-zonificacion.py): índice + un GeoJSON por hoja vectorizada. */
export const DGZ_INDEX_URL = "/data/dgz/index.json";
export const dgzSheetUrl = (hoja: string) => `/data/dgz/${encodeURIComponent(hoja)}.geojson`;
/** Nombres de hoja del índice: «10-3B», «5-5D»… (evita rutas arbitrarias). */
const SHEET_NAME = /^[0-9A-Za-z][0-9A-Za-z._-]*$/;

const baseCache = new Map<string, Promise<GeoJSON.FeatureCollection>>();
const indexCache = new Map<string, Promise<ZoningIndex>>();
const sheetCache = new Map<string, Promise<GeoJSON.FeatureCollection>>();

function loadBaseLayer(layer: BaseLayer): Promise<GeoJSON.FeatureCollection> {
  return cachedJson(baseCache, BASE_LAYER_URLS[layer], () => new ApiError("gis.capa", "No se pudo cargar una capa del mapa.", { layer }));
}

function loadZoningIndex(): Promise<ZoningIndex> {
  return cachedJson(indexCache, DGZ_INDEX_URL, () => new ApiError("gis.zonificacion", "No se pudo cargar el índice de hojas de zonificación."));
}

function loadZoningSheet(hoja: string): Promise<GeoJSON.FeatureCollection> {
  if (!SHEET_NAME.test(hoja)) return Promise.reject(new ApiError("gis.hoja_no_vectorizada", "La hoja indicada no existe.", { hoja }));
  return cachedJson(sheetCache, dgzSheetUrl(hoja), () => new ApiError("gis.hoja_no_vectorizada", `No se pudo cargar la zonificación de la hoja ${hoja}.`, { hoja }));
}

/** Polígono del Documento Gráfico por id (en su hoja), o null si la hoja no está disponible. */
async function findZonePolygon(hoja: string, id: string): Promise<ZonePolygon | null> {
  try {
    const fc = await loadZoningSheet(hoja);
    const f = fc.features.find((x) => x.properties?.id === id);
    return (f?.properties as ZonePolygon | undefined) ?? null;
  } catch {
    return null;
  }
}

function featureCollection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

export const mockClient: ApiClient = {
  async login(email, password) {
    if (!email.endsWith("@example.test") || password.length < 4) {
      throw new ApiError("auth.credenciales", "Use una cuenta de demostración (…@example.test) y una contraseña de 4 caracteres o más.");
    }
    return wait({ user: { ...currentUser, email }, token: "demo-token" });
  },
  async listProjects(query = {}) {
    const q = query.q?.toLowerCase() ?? "";
    // Proyectos de demostración + los creados en la web + expedientes reales del agente revisor-planos.
    const [expedientes, web] = await Promise.all([listarExpedientes(), listarProyectosWeb()]);
    const coinciden = [...store.projects, ...web.map(registrarProyectoWeb), ...expedientes]
      .filter((p) => (!query.status || p.status === query.status) && (!q || `${p.name} ${p.address} ${p.finca}`.toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    // Las corridas de prueba de modelos no son trabajo del usuario: fuera del panel y de las listas salvo que se pidan.
    const pruebas = query.pruebas ?? "excluir";
    const items = pruebas === "incluir" ? coinciden : coinciden.filter((p) => esCorridaDePrueba(p) === (pruebas === "solo"));
    return wait({ items, hasNext: false, nextCursor: null, ocultas: coinciden.length - items.length });
  },
  async getProject(id) {
    if (esIdDeExpediente(id)) return (await detalleExpediente(id)).project;
    if (esProyectoWeb(id)) {
      const project = registrarProyectoWeb(await leerProyectoWeb(id));
      if (!project.precheckId || project.status !== "REVIEW_REQUIRED") return project;
      // Láminas y datos del documento evaluado, para la revisión (en lugar del plano de demostración).
      const real = await leerPreCheckReciente(project.precheckId).catch(() => null);
      return real?.project.expediente ? { ...project, expediente: real.project.expediente } : project;
    }
    return wait(findProject(id));
  },
  async createProject(input) {
    // Se guarda en el servidor: sobrevive a recargas y reinicios (antes vivía solo en la memoria del navegador).
    const loteDibujado = input.parcelId ? store.declared.find((d) => d.id === input.parcelId) : undefined;
    try {
      return registrarProyectoWeb(await crearProyectoWeb(input, loteDibujado));
    } catch (e) {
      // Un error del servidor (con su código) se muestra. Sin la ruta (pruebas, sin red) el proyecto queda en esta sesión.
      if (e instanceof ApiError && e.code !== "proyecto.error") throw e;
      const project: Project = { id: `prj-${Date.now().toString(36)}`, ...input, status: "DRAFT", updatedAt: new Date().toISOString() };
      store.projects = [project, ...store.projects];
      return wait(project);
    }
  },
  async renameProject(id, name) {
    const nuevo = name.trim();
    if (nuevo.length < 3 || nuevo.length > 120) throw new ApiError("proyecto.nombre_invalido", "El nombre debe tener entre 3 y 120 caracteres.");
    if (esProyectoWeb(id)) return registrarProyectoWeb(await actualizarProyectoWeb(id, { name: nuevo }));
    if (id.startsWith("prj-") && !id.startsWith("prj-betania-") && store.projects.some((p) => p.id === id)) {
      store.projects = store.projects.map((p) => (p.id === id ? { ...p, name: nuevo } : p));
      return wait(findProject(id));
    }
    throw new ApiError("proyecto.solo_lectura", "Los proyectos de demostración y los expedientes no se renombran.");
  },
  async deleteProject(id) {
    if (esProyectoWeb(id)) await eliminarProyectoWeb(id);
    else if (id.startsWith("prj-") && !id.startsWith("prj-betania-")) store.projects = store.projects.filter((p) => p.id !== id);
    else throw new ApiError("proyecto.solo_lectura", "Los proyectos de demostración y los expedientes no se eliminan.");
  },
  async searchParcels(q) {
    const s = q.trim().toLowerCase();
    if (!s) return wait([]);
    return wait(allParcels().filter((p) => `${p.id} ${p.finca} ${p.address}`.toLowerCase().includes(s)).slice(0, 8));
  },
  async geocodeAddress(q) {
    // Geocodificador real (Photon, OpenStreetMap) a través de la ruta propia /api/geocodificar.
    return geocodeViaApi(q.trim());
  },
  async declareParcel({ puntos: entrada, finca, address }) {
    const error = validarLote(entrada);
    if (error) throw new ApiError("lote.dibujo_invalido", error);
    const puntos = limpiarVertices(entrada);
    const [corregimientos, mosaico] = await Promise.all([loadBaseLayer("corregimientos"), loadBaseLayer("sheets")]);
    // El lote entero debe quedar en el distrito: basta un vértice fuera para rechazarlo.
    if (puntos.some((p) => !featureAtPoint<Corregimiento>(corregimientos, p))) {
      throw new ApiError("lote.fuera_del_distrito", "El lote queda fuera del distrito de Panamá (al menos un vértice).");
    }
    const interior = puntoInterior(puntos);
    const corregimiento = featureAtPoint<Corregimiento>(corregimientos, interior);
    if (!corregimiento) throw new ApiError("lote.fuera_del_distrito", "El lote queda fuera del distrito de Panamá.");
    // Todas las hojas que toca el lote (puede cruzar el borde de una hoja).
    const celdas = [...new Set(puntos.concat([interior]).map((p) => featureAtPoint<SheetCell>(mosaico, p)?.hoja).filter((h): h is string => Boolean(h)))];
    const hojas = (await Promise.all(celdas.map((h) => loadZoningSheet(h).catch(() => null)))).filter((h): h is GeoJSON.FeatureCollection => Boolean(h));
    const { zonas, muestras } = zonasDelLote(puntos, hojas);
    const principal = zonas[0];
    // Skill GIS: una sola zona con ≥ 99 % del lote y código único; si no, no se elige: va a revisión con todas.
    const unica =
      principal && principal.fraccion >= 0.99 && muestras >= MUESTRAS_MINIMAS && hojas.length === celdas.length ? principal.zona : null;
    const norma: NormaZona = unica ? (isDualLabel(unica) ? "revision" : zoneNorm(unica, zonings).kind) : "revision";
    declaredSeq += 1;
    const parcel: Parcel = {
      id: `DECL-${String(declaredSeq).padStart(4, "0")}`,
      origen: "declarado",
      finca,
      address,
      areaM2: Math.round(areaM2(puntos)),
      // Sin zona determinada, el código queda vacío (no un texto que parezca código); la vista dice «por revisar».
      zoningCode: unica && norma !== "revision" && unica.codigo_ficha ? unica.codigo_ficha : "",
      normaZona: norma,
      zonasLote: zonas.map((z) => ({ hoja: z.hoja, poligono: z.poligono, codigo: z.zona.codigo, estado: z.zona.estado, pct: z.pct })),
      landUse: "No declarado",
      centroid: interior,
      geometry: { type: "Polygon", coordinates: [anilloCerrado(puntos)] },
      district: "Panamá",
      corregimiento: corregimiento.nombre,
      ...(unica ? { zoningSource: { hoja: unica.hoja, fecha: unica.fecha_hoja, poligono: unica.id } } : {}),
    };
    store.declared = [...store.declared, parcel];
    return wait(parcel);
  },
  async getProperty(parcelId) {
    const parcel = allParcels().find((p) => p.id === parcelId);
    if (!parcel) throw new ApiError("parcela.inexistente", "No se encontró la parcela.", { parcelId });
    const zone = parcel.zoningSource ? await findZonePolygon(parcel.zoningSource.hoja, parcel.zoningSource.poligono) : null;
    const property: Property = { parcel, ...resolverFicha(parcel, zone), ceus: null };
    if (parcel.zoningSource) {
      property.zoneSource = { ...parcel.zoningSource, codigo: zone?.codigo ?? null, estado: zone?.estado };
    }
    return wait(property);
  },
  async getGisLayer({ layer }) {
    if (isBaseLayer(layer)) {
      // Sin structuredClone: colecciones grandes y de solo lectura (React Query las cachea).
      return loadBaseLayer(layer);
    }
    if (layer === "parcels" || layer === "landUse") {
      return wait(
        featureCollection(
          allParcels().map((p) => ({
            type: "Feature",
            id: p.id,
            geometry: p.geometry,
            properties: { id: p.id, finca: p.finca, zoning: p.zoningCode, landUse: p.landUse, zoneHoja: p.zoningSource?.hoja ?? null, origen: p.origen ?? "demostracion" },
          })),
        ),
        120,
      );
    }
    if (layer === "projects") {
      return wait(
        featureCollection(
          store.projects.flatMap((pr) => {
            const parcel = allParcels().find((p) => p.id === pr.parcelId);
            return parcel ? [{ type: "Feature" as const, id: pr.id, geometry: { type: "Point" as const, coordinates: parcel.centroid }, properties: { id: pr.id, name: pr.name, status: pr.status } }] : [];
          }),
        ),
        120,
      );
    }
    const [x0, y0] = parcels[0].centroid;
    return wait(featureCollection([
      { type: "Feature", geometry: { type: "LineString", coordinates: [[x0 - 0.0006, y0 + 0.00022], [x0 + 0.0075, y0 + 0.00022]] }, properties: { name: "Red de agua (demostración)" } },
      { type: "Feature", geometry: { type: "LineString", coordinates: [[x0 - 0.0006, y0 - 0.0009], [x0 + 0.0075, y0 - 0.0009]] }, properties: { name: "Alcantarillado (demostración)" } },
    ]), 120);
  },
  async getZoningIndex() {
    return loadZoningIndex();
  },
  async getZoningSheet(hoja) {
    return loadZoningSheet(hoja);
  },
  async listPlans(projectId) {
    // El documento de un expediente real se describe en el propio proyecto (project.expediente).
    if (esIdDeExpediente(projectId)) return [];
    if (esProyectoWeb(projectId)) return planosDelProyectoWeb(projectId);
    const propios = store.plans.filter((p) => p.projectId === projectId);
    // Los que se están leyendo en el servidor se actualizan antes de devolverlos.
    return Promise.all(propios.map((p) => (p.status === "processing" ? refrescarPlano(p.id) : wait(p, 0))));
  },
  async getPlan(planId) {
    return refrescarPlano(planId);
  },
  async uploadPlan(projectId, file, onProgress) {
    if (file.format === "PDF" && file.file) {
      const srv = await subirPlano(file.file, onProgress, file.ocr, file.complementario);
      return anotarPlano(agregarPlanDelServidor(projectId, srv, file.size));
    }
    // DWG, DXF e IFC: se cargan sin lectura (el lector de CAD/BIM del núcleo aún no está conectado a la web).
    for (let p = 10; p <= 100; p += 30) {
      await wait(null, 120);
      onProgress?.(Math.min(p, 100));
    }
    const plan: Plan = { id: `plan-${Date.now().toString(36)}`, projectId, fileName: file.name, format: file.format, sizeBytes: file.size, status: "uploaded", progress: 100, sheets: [] };
    store.plans = [...store.plans, plan];
    return wait(await anotarPlano(plan), 50);
  },
  async listPlanExamples() {
    return ejemplosDePlanos();
  },
  async addPlanExample(projectId, nombre, ocr) {
    const srv = await usarEjemplo(nombre, ocr);
    return anotarPlano(agregarPlanDelServidor(projectId, srv, srv.sizeBytes ?? 0));
  },
  async deletePlan(planId) {
    const plan = store.plans.find((p) => p.id === planId);
    if (plan && esProyectoWeb(plan.projectId)) await actualizarProyectoWeb(plan.projectId, { quitarPlan: planId }).catch(() => undefined);
    store.plans = store.plans.filter((p) => p.id !== planId);
    await wait(null, 80);
  },
  async correctPlanData(planId, cambios) {
    const srv = await corregirDatos(planId, cambios);
    const actual = store.plans.find((p) => p.id === planId) ?? (await refrescarPlano(planId));
    const nuevo = planDesdeServidor(actual, srv);
    store.plans = store.plans.map((p) => (p.id === planId ? nuevo : p));
    return nuevo;
  },
  async startPreCheck(projectId, datos, planIdsDados = []) {
    if (esIdDeExpediente(projectId)) {
      throw new ApiError("expediente.solo_lectura", "El resultado de un expediente real lo produce el agente revisor-planos; no se vuelve a ejecutar desde aquí.");
    }
    if (datos && process.env.NEXT_PUBLIC_PRECHECK_MODE !== "demo") {
      // Motor real. Los planos se toman del servidor (el proyecto web los tiene anotados) o de esta sesión; el
      // servidor decide si ya están leídos y, si no, dice por qué (leyendo, falló).
      if (!esProyectoWeb(projectId)) findProject(projectId);
      const delProyecto = esProyectoWeb(projectId)
        ? (await leerProyectoWeb(projectId)).planes.filter((p) => p.format === "PDF").map((p) => p.id)
        : store.plans.filter((p) => p.projectId === projectId && p.format === "PDF").map((p) => p.id);
      // Los planos que el asistente ya tiene leídos también cuentan (el proyecto puede no haberlos anotado).
      const planIds = [...new Set([...planIdsDados, ...delProyecto])];
      if (esProyectoWeb(projectId)) {
        for (const id of planIdsDados.filter((i) => !delProyecto.includes(i))) {
          const srv = await estadoDelPlano(id).catch(() => null);
          if (srv) await actualizarProyectoWeb(projectId, { agregarPlan: { id, fileName: srv.fileName, format: "PDF", sizeBytes: srv.sizeBytes ?? 0 } }).catch(() => undefined);
        }
      }
      if (!planIds.length) throw new ApiError("precheck.sin_planos", "Cargue al menos un plano PDF y espere a que termine su lectura.");
      const precheckId = await iniciarPreCheckReal(projectId, planIds, datos);
      store.projects = store.projects.map((p) => (p.id === projectId ? { ...p, status: "PROCESSING", precheckId } : p));
      return { precheckId };
    }
    findProject(projectId);
    const precheckId = `run-${projectId}`;
    store.runs.set(precheckId, { start: Date.now(), projectId });
    store.projects = store.projects.map((p) => (p.id === projectId ? { ...p, status: "PROCESSING", precheckId } : p));
    return wait({ precheckId }, 100);
  },
  async getPreCheckProgress(precheckId) {
    if (esPreCheckReal(precheckId)) {
      const progress = await progresoReal(precheckId);
      if (progress.stage === "done") {
        const real = await leerPreCheckServidor(precheckId);
        const index = real.precheck.summary.checked ? Math.round((real.precheck.summary.passed / real.precheck.summary.checked) * 100) : 0;
        store.projects = store.projects.map((p) =>
          p.id === real.precheck.projectId ? { ...p, status: "REVIEW_REQUIRED", precheckId, complianceIndex: index, updatedAt: new Date().toISOString() } : p,
        );
      }
      return progress;
    }
    if (esPrecheckDeExpediente(precheckId)) {
      const { summary } = (await detalleExpediente(precheckId.slice("pc-".length))).precheck;
      return { stage: "done" as const, percent: 100, ruleIndex: summary.checked, ruleTotal: summary.checked };
    }
    const run = store.runs.get(precheckId);
    if (!run) {
      if (precheckId !== demoPrecheck.id) throw new ApiError("precheck.inexistente", "El PreCheck no existe.", { precheckId });
      const total = demoPrecheck.summary.checked;
      return wait({ stage: "done" as const, percent: 100, ruleIndex: total, ruleTotal: total }, 50);
    }
    const progress = progressAt(Date.now() - run.start);
    if (progress.stage === "done") {
      const { results } = await resultadosDelProyecto(run.projectId);
      const complianceIndex = indiceDeCumplimiento(results);
      store.projects = store.projects.map((p) => (p.id === run.projectId ? { ...p, status: "REVIEW_REQUIRED", complianceIndex, updatedAt: new Date().toISOString() } : p));
    }
    return wait(progress, 60);
  },
  async getPreCheck(precheckId) {
    if (esPreCheckReal(precheckId)) return (await leerPreCheckServidor(precheckId)).precheck;
    if (esPrecheckDeExpediente(precheckId)) return (await detalleExpediente(precheckId.slice("pc-".length))).precheck;
    const run = store.runs.get(precheckId);
    if (precheckId !== demoPrecheck.id && !run) throw new ApiError("precheck.inexistente", "El PreCheck no existe.", { precheckId });
    const projectId = run?.projectId ?? demoPrecheck.projectId;
    const [{ results, summary }, catalogo] = await Promise.all([resultadosDelProyecto(projectId), catalogoDeReglas()]);
    // Reglas de la demostración que no están en el catálogo real: viajan con el PreCheck para no perder resultados.
    const reales = new Set((catalogo ?? []).map((r) => r.id));
    const respaldo = catalogo ? rules.filter((r) => !reales.has(r.id) && results.some((x) => x.ruleId === r.id)) : [];
    return wait({ ...demoPrecheck, id: precheckId, projectId, results, summary, ...(respaldo.length ? { rules: respaldo } : {}) });
  },
  async listRules() {
    // Catálogo real (reglas/*.json del motor); las de demostración solo si la ruta no responde.
    return (await catalogoDeReglas()) ?? wait(rules);
  },
  async listZonings() {
    return wait(zonings);
  },
  async listReviewers() {
    return wait(reviewers);
  },
  async addAnnotation(_precheckId, annotation) {
    return wait({ ...annotation, id: `ann-${Date.now().toString(36)}`, createdAt: new Date().toISOString(), author: reviewers[0] });
  },
  async assignReviewer() {
    await wait(null, 150);
  },
  async listNotifications() {
    return wait(notifications);
  },
};

