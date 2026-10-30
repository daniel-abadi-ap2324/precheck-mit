import type { LectorOcr } from "@/lib/lector-ocr";
import type { DatosMotor } from "@/services/prechecks/cliente";
import type { CambioDato } from "@/services/planos/cliente";
import type {
  AddressMatch,
  LngLat,
  ComplianceRule,
  Notification,
  Page,
  Parcel,
  Plan,
  PlanFormat,
  PreCheck,
  PreCheckProgress,
  Project,
  ProjectStatus,
  Property,
  Reviewer,
  Session,
  Zoning,
  ZoningIndex,
  Annotation,
} from "@/types";
import type { ProjectInput } from "@/schemas/project";

/**
 * Contrato del cliente de API (docs/features/plataforma-web/plan.md §7).
 * Lo implementan el adaptador de datos de prueba (src/mocks/adapter.ts) y, más adelante,
 * el cliente HTTP hacia FastAPI (src/services/api/http.ts).
 */
export interface ProjectQuery {
  q?: string;
  status?: ProjectStatus;
  cursor?: string | null;
  /**
   * Corridas de prueba de modelos (lib/corridas-prueba.ts): por defecto «excluir», porque el panel y las listas
   * muestran solo lo que hace el usuario; «incluir» para la comparación de modelos y «solo» para /rondas.
   */
  pruebas?: "excluir" | "incluir" | "solo";
}

/**
 * Capas GIS servidas completas. La zonificación NO está aquí: se sirve por hoja del Documento Gráfico
 * (getZoningIndex + getZoningSheet) porque el conjunto de las 78 hojas es demasiado grande para una sola carga.
 * - district, corregimientos, rivers, ocean, sheets: índice del Documento Gráfico (DPU), WGS84.
 * - parcels, landUse, projects, infrastructure: datos de demostración.
 */
export type GisLayerName = "parcels" | "landUse" | "projects" | "infrastructure" | "district" | "corregimientos" | "rivers" | "ocean" | "sheets";

export interface GisLayerQuery {
  layer: GisLayerName;
}

export interface ApiClient {
  login(email: string, password: string): Promise<Session>;
  listProjects(query?: ProjectQuery): Promise<Page<Project>>;
  getProject(id: string): Promise<Project>;
  createProject(input: ProjectInput): Promise<Project>;
  /** Cambia el nombre de un proyecto creado en la web. Errores `proyecto.nombre_invalido`, `proyecto.solo_lectura` (demostración y expedientes). */
  renameProject(id: string, name: string): Promise<Project>;
  /** Quita un proyecto creado en la web (o de esta sesión). Los expedientes y la demostración no se borran. */
  deleteProject(id: string): Promise<void>;
  searchParcels(q: string): Promise<Parcel[]>;
  /**
   * Lote dibujado por el profesional (no es catastro): calcula área, corregimiento y zona del Documento Gráfico.
   * Errores: `lote.dibujo_invalido`, `lote.fuera_del_distrito`.
   */
  declareParcel(input: DeclareParcelInput): Promise<Parcel>;
  /** Direcciones reales dentro del distrito (geocodificador). Lanza si el servicio no responde. */
  geocodeAddress(q: string): Promise<AddressMatch[]>;
  getProperty(parcelId: string): Promise<Property>;
  getGisLayer(query: GisLayerQuery): Promise<GeoJSON.FeatureCollection>;
  /** Índice de hojas vectorizadas del Documento Gráfico (bbox, fecha, PDF y conteos por estado). */
  getZoningIndex(): Promise<ZoningIndex>;
  /** Polígonos de zonificación de una hoja (propiedades ZonePolygon). Error `gis.hoja_no_vectorizada` si no existe. */
  getZoningSheet(hoja: string): Promise<GeoJSON.FeatureCollection>;
  listPlans(projectId: string): Promise<Plan[]>;
  /**
   * Carga un plano. Con el archivo real y formato PDF, el servidor lo lee (texto del PDF u OCR): el plano queda
   * «processing» hasta que getPlan lo devuelve «ready» con su extracción, o «failed» con el motivo.
   */
  uploadPlan(projectId: string, file: { name: string; size: number; format: PlanFormat; file?: File; ocr?: LectorOcr; complementario?: boolean }, onProgress?: (p: number) => void): Promise<Plan>;
  /** Un plano con su estado de lectura actualizado. Error `plan.inexistente`. */
  getPlan(planId: string): Promise<Plan>;
  /** Planos de ejemplo disponibles (anteproyectos RLA reales, en el servidor). */
  listPlanExamples(): Promise<{ nombre: string; sizeBytes: number }[]>;
  /** Agrega al proyecto un plano de ejemplo y lo manda a leer. */
  addPlanExample(projectId: string, nombre: string, ocr?: LectorOcr): Promise<Plan>;
  deletePlan(planId: string): Promise<void>;
  /**
   * Inicia el PreCheck. Con `datos` y al menos un plano PDF ya leído, corre el motor real del núcleo
   * (POST /api/prechecks); sin `datos` (o con NEXT_PUBLIC_PRECHECK_MODE=demo) devuelve el resultado de demostración.
   */
  startPreCheck(projectId: string, datos?: DatosMotor, planIds?: string[]): Promise<{ precheckId: string }>;
  /** Corrige o agrega datos leídos de un plano PDF (null deshace la corrección) y devuelve el plano con la lectura corregida. */
  correctPlanData(planId: string, cambios: Record<string, CambioDato>): Promise<Plan>;
  getPreCheckProgress(precheckId: string): Promise<PreCheckProgress>;
  getPreCheck(precheckId: string): Promise<PreCheck>;
  listRules(): Promise<ComplianceRule[]>;
  listZonings(): Promise<Zoning[]>;
  listReviewers(): Promise<Reviewer[]>;
  addAnnotation(precheckId: string, annotation: Omit<Annotation, "id" | "createdAt" | "author">): Promise<Annotation>;
  assignReviewer(precheckId: string, reviewerId: string): Promise<void>;
  listNotifications(): Promise<Notification[]>;
}

export interface DeclareParcelInput {
  /** Vértices [lng, lat] en WGS84, sin repetir el primero al final. */
  puntos: LngLat[];
  finca: string;
  address: string;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
