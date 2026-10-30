/** Modelo de dominio del frontend (docs/features/plataforma-web/plan.md §5). */

export type ComplianceStatus = "PASS" | "FAIL" | "WARNING" | "MANUAL_REVIEW" | "NOT_APPLICABLE";
export type RuleState = "borrador" | "aprobada" | "rechazada" | "retirada" | "suspendida";
export type ProjectStatus = "DRAFT" | "PROCESSING" | "REVIEW_REQUIRED" | "COMPLETED" | "FAILED";
export type RuleCategory =
  | "site"
  | "zoning"
  | "setbacks"
  | "height"
  | "coverage"
  | "density"
  | "parking"
  | "accessibility"
  | "landscaping"
  | "other";
export type PlanFormat = "PDF" | "DWG" | "DXF" | "IFC";
export type RuleOperator = "<=" | ">=" | "=" | "in" | "criterio";
export type LngLat = [number, number];

export interface Project {
  id: string;
  name: string;
  propertyId: string;
  finca: string;
  address: string;
  corregimiento: string;
  projectType: string;
  applicant: string;
  zoningCode: string;
  status: ProjectStatus;
  precheckId?: string;
  parcelId?: string;
  updatedAt: string;
  /** Índice preliminar 0–100 (cumple / evaluadas). Nunca es aprobación municipal. */
  complianceIndex?: number;
  /** Código del trámite (RLA, RDP, PDC…), si se conoce. */
  tramite?: string;
  /** «expediente»: resultado real del agente revisor-planos leído de la carpeta del expediente. Sin valor: demostración. */
  origen?: "demostracion" | "expediente";
  /** Datos del expediente real (solo con origen «expediente»). */
  expediente?: ExpedienteInfo;
  /** Corrida de prueba de modelos (la crea scripts/lote_ia.py): no sale en el panel ni en las listas del usuario. */
  esPrueba?: boolean;
}

/** Dato leído del expediente por el agente revisor-planos, con su confianza y fuente. */
export interface DatoExpediente {
  /** Clave del hecho (p. ej. «lote.area_m2»). */
  clave: string;
  etiqueta: string;
  valor: string;
  confianza?: number;
  fuente?: string;
  /** Lámina (1…n) donde se leyó el dato, si la IA o el lector la anotaron. */
  pagina?: number;
  /** Cómo se obtuvo (vision, texto, medicion, humano…). */
  metodo?: string;
  /** Lo que anotó quien lo leyó: dónde lo vio y cómo lo contó o midió. */
  detalle?: string;
}

/** Resumen de un expediente real revisado por el agente revisor-planos (carpeta expedientes/<caso>/). */
export interface ExpedienteInfo {
  /** Documento (PDF) revisado. */
  documento: string | null;
  paginas: number | null;
  normaAplicable: string | null;
  fechaPresentacion: string | null;
  /** Confianza mínima que usó el motor para aceptar un dato. */
  umbral: number | null;
  /** Reglas que el motor descartó por no aplicar (no se listan una a una). */
  noAplican: number;
  avisos: string[];
  /** Reglas agrupadas por depender de confirmar la zona: cuántas y por qué (siguen contando como «Requiere revisión»). */
  zonaPorConfirmar?: { total: number; motivo: string } | null;
  /**
   * Conteo de resultados para la lista de informes; «revisar» no incluye las agrupadas por zona. Con dictamen,
   * «observaciones» se cuenta aparte (sin dictamen no viene y «revisar» incluye las observaciones del motor).
   */
  conteo?: { noCumple: number; revisar: number; agrupadas: number; cumple: number; observaciones?: number; informacionRequerida?: number; conSupuesto?: number };
  /** ADR-0016: zona de trabajo, supuestos y reglas vigentes de la corrida (con o sin dictamen). */
  zonaTrabajo?: ZonaTrabajoInfo | null;
  supuestos?: SupuestoMotor[];
  vigentes?: ReglasVigentesInfo | null;
  /** La revisión con IA falló o no terminó. */
  iaFallida?: IaFallidaInfo | null;
  /** Dictamen del arquitecto revisor (dictamen.json), si existe y es válido. Decide los estados que se muestran. */
  dictamen?: DictamenInfo | null;
  /** Hechos del lote y del plano (lote.*, plano.*). */
  lote: DatoExpediente[];
  /** Hechos del proyecto (proyecto.*). */
  proyecto: DatoExpediente[];
  /** Otros hechos escritos (profesional.*, rampa.*, acceso_vehicular.*…): no se muestran en el expediente, pero cuentan como datos escritos en la comparación. */
  otros?: DatoExpediente[];
  /** Páginas del documento según la extracción (número, tipo y código de lámina si se leyó). */
  hojas?: HojaExpediente[];
  /** Páginas con miniatura (p<N>.png) en la carpeta del expediente; se sirven en /api/expedientes/[id]/paginas/[n]. */
  miniaturas?: number[];
  /** El PDF original está en la carpeta de anteproyectos y se puede abrir en /api/expedientes/[id]/documento. */
  documentoDisponible?: boolean;
}

/** Decisión del arquitecto revisor sobre una regla (dictamen.json del agente revisor-planos). */
export type DecisionDictamen = "CUMPLE" | "NO_CUMPLE" | "OBSERVACION" | "NO_APLICA";

/** Lugar del documento que sustenta una decisión. */
export interface EvidenciaDictamen {
  /** Página del documento; null si la evidencia no cita página. */
  pagina: number | null;
  detalle: string;
}

/** Rectángulo sobre la lámina, en fracciones 0–1 de la página completa (x, y desde la esquina superior izquierda). */
export interface MarcaPlano {
  pagina: number;
  x: number;
  y: number;
  w: number;
  h: number;
  etiqueta?: string;
  /** «ia»: lo ubicó el agente en el dictamen; «lector»: es el recuadro del dato que leyó el lector de planos. */
  origen: "ia" | "lector";
}

/** Tipos de región del plano (paso 2 del flujo). La tabla de colores y etiquetas está en lib/regiones.ts. */
export type TipoRegion =
  | "lote"
  | "huella"
  | "retiro_frontal"
  | "retiro_lateral"
  | "retiro_posterior"
  | "estacionamiento"
  | "acera"
  | "area_verde"
  | "tinaquera"
  | "acceso_vehicular"
  | "escalera_rampa"
  | "otro";

/** vectorial: polígono del PDF; vision: modelo de visión; humano: dibujada o editada a mano. */
export type OrigenRegion = "vectorial" | "vision" | "humano";

/**
 * Región (polígono) sobre la lámina: puntos en fracciones 0–1 de la página tal como se lee (rotación aplicada; origen
 * arriba a la izquierda), el mismo sistema que las marcas. Es evidencia para la revisión, nunca medida exacta.
 */
export interface RegionPlano {
  id: string;
  pagina: number;
  tipo: TipoRegion;
  /** ≥ 3 vértices, sin repetir el primero al final. */
  puntos: [number, number][];
  origen: OrigenRegion;
  /** Siempre < 0.85: una región sola nunca decide una regla. */
  confianza: number;
  etiqueta: string;
  /** La persona la revisó. */
  confirmada: boolean;
  /** La persona cambió una región propuesta por el sistema. */
  editada: boolean;
}

/** Raster de una página para el editor (≈ 100 ppp, como se lee) y sus medidas. */
export interface PaginaRegiones {
  imagen: string;
  ancho_px: number;
  alto_px: number;
  ancho_mm?: number | null;
  alto_mm?: number | null;
  /** Denominador de la escala si se conoce; null si no. */
  escala?: number | null;
}

/** regiones.json de un plano (web/.data/planos/<id>/regiones.json). */
export interface RegionesPlano {
  version: 1;
  generado: string;
  paginas: Record<string, PaginaRegiones>;
  regiones: RegionPlano[];
}

/** Decisión del dictamen sobre una regla, con lo que la sustenta. */
export interface DecisionRegla {
  decision: DecisionDictamen;
  valorLeido?: string;
  limite?: string;
  justificacion: string;
  evidencia: EvidenciaDictamen[];
  /** Rectángulos que el agente ubicó sobre las láminas (de evidencia[].marcas). */
  marcas?: MarcaPlano[];
  /** Qué debe subsanar el profesional (NO_CUMPLE y OBSERVACION). */
  subsanar?: string;
  /** INFORMACION_REQUERIDA: la decisión es imposible sin un documento o dato externo (CEUS, Registro Público…); se pide en `subsanar`. */
  estado?: "INFORMACION_REQUERIDA";
  /** Confianza que declaró la IA en su decisión, si la dio. */
  confianza?: number;
  /**
   * La web no aplicó la decisión tal cual. `motor`: el motor ya había decidido la regla con los datos (jerarquía motor → IA,
   * principio 2) y la IA propuso otra cosa; prevalece el motor. `confianza`: un NO_CUMPLE que descansa en un dato bajo el
   * umbral del motor no bloquea; se muestra como observación hasta que una persona lo confirme.
   */
  reserva?: { motivo: "motor" | "confianza"; detalle: string };
  /**
   * Quién tomó la decisión. «ia»: el dictamen de la IA. «motor»: la decisión de respaldo que el motor deja en cada regla
   * en revisión (ADR-0016), que vale mientras la IA no decida. Sin el campo (resultados anteriores), es de la IA. Las
   * métricas de estabilidad comparan solo las decisiones de la IA.
   */
  origen?: "ia" | "motor";
  /** Supuestos de la corrida (S1, S2…) en los que descansa la decisión del motor. */
  supuestos?: string[];
}

/** Hecho que el arquitecto revisor asumió para decidir (p. ej. la zona sin CEUS). */
export interface SupuestoDictamen {
  hecho: string;
  etiqueta: string;
  valor: string;
  fundamento: string;
}

/** Permiso especial (nota DPU, resolución, excepción) que la IA aplicó con su cita, comprobada por el motor. */
export interface PermisoAplicado {
  id: string;
  tipo: string;
  titulo: string;
  cita: string;
  documento: string | null;
  pagina: number | null;
  efecto: { reglaId: string; accion: "exceptua" | "condiciona" }[];
}

/** Reglas vigentes de una corrida (resultado.json → reglas_vigentes y permisos). */
export interface ReglasVigentesInfo {
  norma: string | null;
  zona: string | null;
  total: number;
  /** Reglas cuyo alcance no se pudo determinar (faltan datos de alcance). */
  sinDeterminar: number;
  exceptuadas: number;
  /** Lo que fijó la IA en alcance_ia.json: aplicado y rechazado por el motor. */
  alcanceIa: { presente: boolean; aplicado: string[]; errores: string[] };
  permisos: PermisoAplicado[];
  /** Propuestas de reglas nuevas para el equipo (propuestas_reglas.json). */
  propuestas: number;
  /** ADR-0016: reglas con decisión final que aplican, generales del Acuerdo 110 y de zonificación de la zona de trabajo. */
  generales?: number;
  zonificacion?: number;
  /** Cómo se determinó la zona de trabajo («según la nota DPU…», «supuesta por familia»…). */
  procedenciaZona?: string;
}

/** Zona con que evaluó el motor (ADR-0016): de dónde salió, si es firme y qué candidatas descartó. */
export interface ZonaTrabajoInfo {
  codigo: string | null;
  norma: string | null;
  /** oficial, arquitecto, documento_grafico, plano, usuario, ia o familia. */
  procedencia: string | null;
  /** Firme: por documento oficial o sin conflicto con confianza suficiente. Si no, es un supuesto (S1). */
  firme: boolean;
  explicacion: string;
  /** Lo que falta para tener zona cuando el motor no pudo suponer ninguna (p. ej. «la CEUS o la unidad territorial»). */
  falta: string | null;
  descartadas: { codigo: string; norma: string | null; motivo: string; reglasDistintas: number }[];
}

/** Supuesto de la corrida del motor (ADR-0016): en qué se apoyan las decisiones que no son firmes. */
export interface SupuestoMotor {
  id: string;
  /** zona, sin_zona, dato_dudoso, no_indicado o borde. */
  tipo: string;
  texto: string;
  /** Qué hacer para quitar el supuesto (p. ej. traer la CEUS). */
  accion: string | null;
  /** Reglas que descansan en él. */
  reglas: number;
}

/** La revisión con IA no terminó: el informe se arma con lo que hay (dictamen parcial o motor) y lo dice. */
export interface IaFallidaInfo {
  error: string;
  /** Reglas cuya decisión final es la de respaldo del motor. */
  decididasPorMotor: number;
  /** Se usó un dictamen a medias (dictamen.parcial.json). */
  parcial: boolean;
}

/** Resumen del dictamen de un expediente. */
export interface DictamenInfo {
  fecha: string | null;
  revisor: string | null;
  conclusion: string | null;
  supuestos: SupuestoDictamen[];
  /** Resultados cuyo estado sale de una decisión del dictamen. */
  decididas: number;
  /** Resultados que el motor dejó en revisión y el dictamen no decidió (quedan con el estado del motor). */
  sinDecision: number;
  /** Resultados que el dictamen dio por NO_APLICA. */
  noAplica: number;
  /** Decisiones de la IA sobre reglas que el motor ya había decidido de otra forma: no se aplican (prevalece el motor). */
  prevaleceMotor?: number;
  /** Decisiones en INFORMACION_REQUERIDA (falta un documento o dato externo). */
  informacionRequerida?: number;
  /** Reglas que la IA no decidió y quedaron con la decisión de respaldo del motor (ADR-0016). */
  respaldoMotor?: number;
  /** Discrepancias entre las regiones del plano (polígonos) y lo declarado que la IA revisó (paso 3). */
  regionesDiscrepantes?: { referencia: string; detalle: string }[];
  /** Reglas vigentes de esta corrida (paso 1 de la revisión): con qué norma y zona evaluó el motor, qué fijó la IA y los permisos. */
  vigentes?: ReglasVigentesInfo;
  /** Objeciones de la IA a resultados del motor o del catálogo: no cambian ningún estado. */
  objeciones?: { reglaId: string; motivo: string; cita: string | null }[];
  /** Proveedor y modelo que produjeron el dictamen (estado.json de la revisión), y lo que costó en USD si se sabe. */
  proveedor?: string;
  modelo?: string;
  costoUsd?: number;
}

/** Página del documento de un expediente, según extraccion.json. */
export interface HojaExpediente {
  numero: number;
  /** «vectorial» o «escaneada». */
  tipo: string | null;
  /** Código de la lámina (p. ej. «A-101»), si el lector lo encontró. */
  lamina: string | null;
}

export interface Parcel {
  id: string;
  finca: string;
  areaM2: number;
  zoningCode: string;
  landUse: string;
  centroid: LngLat;
  geometry: GeoJSON.Polygon;
  district: string;
  corregimiento: string;
  address: string;
  /** Polígono del Documento Gráfico del que se tomó zoningCode (hoja y fecha de la hoja). */
  zoningSource?: ZoningSource;
  /** «declarado»: dibujado por el profesional en el mapa (no es el catastro de la ANATI). Sin valor: demostración. */
  origen?: "demostracion" | "declarado";
  /** Norma de la zona, fijada al declarar el lote (no se vuelve a deducir del código). */
  normaZona?: NormaZona;
  /** Zonas del Documento Gráfico que toca el lote declarado, con el % de su área (de mayor a menor). */
  zonasLote?: ZonaLote[];
}

export interface ZonaLote {
  hoja: string;
  poligono: string;
  /** Rótulo en la hoja; null si el polígono no tiene código único. */
  codigo: string | null;
  estado: ZonePolygonState;
  pct: number;
}

/** Procedencia de la zona de un lote en el Documento Gráfico (Anexo 6 del PLOT). */
export interface ZoningSource {
  hoja: string;
  fecha: string;
  poligono: string;
}

/** Familias de zona del Documento Gráfico vectorizado (scripts/preparar-zonificacion.py). */
export type ZoningFamily =
  | "residencial"
  | "residencial_alta"
  | "mixta"
  | "comercial"
  | "espacio_publico"
  | "equipamiento"
  | "proteccion"
  | "urbanizable"
  | "miviot"
  | "otro"
  | "sin_etiqueta"
  | "conflicto";

export type ZonePolygonState = "ok" | "sin_etiqueta" | "conflicto";

/** Propiedades de un polígono de public/data/dgz/<hoja>.geojson. */
export interface ZonePolygon {
  id: string;
  /** Rótulo tal como aparece en la hoja (p. ej. «1RM-2», «1P / 1ZM6», «MP-C2»). */
  codigo: string | null;
  codigos: string[];
  /** Código de ficha sin prefijo de clase; null si el polígono no es «ok». */
  codigo_ficha: string | null;
  familia: ZoningFamily;
  estado: ZonePolygonState;
  hoja: string;
  fecha_hoja: string;
  area_m2: number;
}

/** Conteo de polígonos por estado de una hoja vectorizada. */
export type ZonePolygonCounts = Record<ZonePolygonState, number>;

/** Entrada de public/data/dgz/index.json: una hoja del Documento Gráfico ya vectorizada. */
export interface ZoningSheetEntry {
  hoja: string;
  /** «1:10.000», «1:5.000»… */
  escala: string | null;
  /** PDF oficial de la hoja en dpu.mupa.gob.pa. */
  pdf: string | null;
  fecha_hoja: string | null;
  /** [minLng, minLat, maxLng, maxLat] en WGS84. */
  bbox: [number, number, number, number] | null;
  poligonos: number;
  por_estado: ZonePolygonCounts;
}

/** Índice de las hojas vectorizadas (crece a medida que se procesan las 78 hojas). */
export interface ZoningIndex {
  generado_desde: string;
  hojas: ZoningSheetEntry[];
}

/** Propiedades de una celda del mosaico (public/data/base/mosaico.geojson): una hoja del índice DPU. */
export interface SheetCell {
  hoja: string;
  escala: string | null;
  serie?: number;
  pdf: string | null;
}

/** Propiedades de un corregimiento (public/data/base/corregimientos.geojson, capa distrito8v4). */
export interface Corregimiento {
  id: string;
  nombre: string;
  distrito: string;
  provincia: string;
  /** Código INEC del corregimiento (COD_CORR, p. ej. «09»). */
  codigo?: string;
  area_ha: number;
  /** «Sí» / «No»: cabecera del distrito, si la capa lo trae. */
  cabecera?: string | null;
  /** Punto interior [lng, lat] para el rótulo. */
  etiqueta: [number, number];
}

export interface Zoning {
  code: string;
  name: string;
  norma: string;
  maxDensity?: string;
  minLotArea?: string;
  minFront?: string;
  maxCoverage?: string;
  maxHeight?: string;
  maxFloors?: number;
  minSidewalk?: string;
  setbacks?: string;
  sourcePage: number;
}

/**
 * Qué norma rige la zona del lote: ficha del Anexo 4 cargada, ficha del PLOT no cargada en la demostración,
 * matriz del Anexo 5, norma del MIVIOT o polígono sin código único (revisión).
 */
export type NormaZona = "ficha" | "ficha_no_cargada" | "anexo5" | "miviot" | "revision";

export interface Property {
  parcel: Parcel;
  /** Ficha del Anexo 4 del PLOT; null si no hay una ficha cargada que corresponda (nunca se sustituye por otra). */
  zoning: Zoning | null;
  normaZona: NormaZona;
  /** Certificación de uso de suelo de la DPUOT; prevalece sobre el Documento Gráfico. */
  ceus: string | null;
  /** Polígono real del Documento Gráfico bajo el lote (referencial: la CEUS prevalece). */
  zoneSource?: ZoningSource & { codigo?: string | null; estado?: ZonePolygonState };
}

export interface PlanSheet {
  id: string;
  name: string;
  /** Dimensiones del lienzo del plano, en metros del terreno. */
  widthM: number;
  heightM: number;
}

export interface Plan {
  id: string;
  projectId: string;
  fileName: string;
  format: PlanFormat;
  sizeBytes: number;
  status: "uploading" | "uploaded" | "processing" | "ready" | "failed";
  progress: number;
  sheets: PlanSheet[];
  /** Lectura del plano (precheck/planos): solo PDF. null mientras se lee o si no se pudo leer. */
  extraction?: PlanExtraction | null;
  /** Mensaje para el usuario si la lectura falló. */
  error?: string;
}

/** Procedencia de un dato leído del plano (mupa-ocr-planos). */
export interface PlanFactSource {
  metodo: "pdf_texto" | "ocr" | "pdf_geometria" | "humano";
  pagina: number;
  bbox: [number, number, number, number];
}

export interface PlanFact {
  /** lote.area_m2, lote.finca, lote.corregimiento, plano.zonificacion_declarada. */
  hecho: string;
  valor: string | number | null;
  confianza: number;
  /** ok = un solo valor claro; revision = ambiguo (ver candidatos); no_encontrado = el plano no lo trae (o no se detectó). */
  /** «informativo»: dato transcrito que no es del proyecto (p. ej. límites de la norma copiados en el plano). */
  estado: "ok" | "revision" | "no_encontrado" | "informativo";
  fuente: PlanFactSource | null;
  candidatos?: (string | number)[];
  colindantes?: string[];
  nota?: string;
  /** El usuario cambió o agregó este dato; `valorOriginal` es lo que leyó el lector (null si no lo había leído). */
  corregido?: boolean;
  valorOriginal?: string | number | null;
  /** El lector no trae este dato: lo agregó el usuario. */
  agregado?: boolean;
  /** El usuario confirmó el valor leído sin cambiarlo (procedencia «humano», confianza 1). */
  confirmado?: boolean;
  /** El dato salió de un documento complementario y no del plano (lib/documentos-complementarios). */
  documento?: string;
}

export interface PlanPage {
  numero: number;
  tipo: "vectorial" | "escaneada";
  ancho_mm: number;
  alto_mm: number;
  lineas: number;
  lamina: { codigo: string | null; titulo: string | null; escala: number | null; hoja: number | null; total_hojas: number | null };
  miniatura: string;
}

export interface PlanRequirement {
  requisito: string;
  existe: boolean;
  confianza: number;
  fuente: PlanFactSource | null;
}

export interface PlanExtraction {
  formato: string;
  documento: string;
  sha256: string;
  paginas: PlanPage[];
  hechos: PlanFact[];
  escalas: number[];
  requisitos_anexo_iv: PlanRequirement[];
}

export interface Regulation {
  id: string;
  norma: string;
  article: string;
  section?: string;
  /** Cita literal verificada contra normativa/ (vacía en reglas de demostración). */
  quote: string;
  sourcePage?: number;
}

export interface ComplianceRule {
  id: string;
  version: number;
  title: string;
  category: RuleCategory;
  zoning?: string | null;
  description: string;
  operator: RuleOperator;
  value?: number | null;
  unit?: string | null;
  regulation: Regulation;
  state: RuleState;
  severity: "bloqueante" | "observacion";
  /** true = no existe en el catálogo real (reglas/*.json); solo para la demostración. */
  demo?: boolean;
  /** Código de la norma (precheck/reglas/normas.json), p. ej. «MIVIOT-EC-R192-2013». */
  normaCode?: string;
  /** Nombre corto de la norma para filtrar: «Acuerdo 110», «PLOT», «San Francisco», «El Carmen»… */
  normaLabel?: string;
  /** Tipo de regla del motor: cuantitativa, criterio, documental, plazo. */
  kind?: string;
  /** Condición literal del motor (campo «condicion»), cuando la regla es evaluable. */
  condition?: string;
  /** Cuándo aplica la regla (campo «aplica_si»), literal. */
  appliesIf?: string;
  /** Nota del catálogo (interpretación, dudas, vigencia). */
  note?: string;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface GeometryReference {
  sheetId: string;
  kind: "boundary" | "building" | "measurement" | "area" | "point";
  points: LngLat[];
  label?: string;
}

export interface ComplianceResult {
  ruleId: string;
  status: ComplianceStatus;
  /** false si la regla no está aprobada: el estado mostrado es indicativo. */
  official: boolean;
  detectedValue?: number;
  requiredValue?: number;
  unit?: string;
  difference?: number;
  explanation?: string;
  recommendedAction?: string;
  regulationReference?: string;
  geometry?: GeometryReference[];
  /**
   * Hallazgo que propone la IA y que no corresponde a ninguna regla del catálogo (p. ej. un requisito de
   * presentación que el plano no trae): lo valida una persona. No lo evaluó el motor.
   */
  fueraDeCatalogo?: boolean;
  /**
   * NO_CUMPLE de un requisito de contenido del plano (regla documental de los Anexos III y IV del Acuerdo 110): el
   * plano no se registra así, pero se subsana completándolo, sin cambiar el proyecto. Se muestra «No cumple · falta en
   * el plano».
   */
  faltaEnPlano?: boolean;
  /**
   * NO_CUMPLE que descansa en un supuesto de la corrida (zona de trabajo supuesta, dato dudoso del plano…; ADR-0016):
   * se muestra «No cumple · con supuesto» y cuenta como pendiente de confirmar, no como falla firme.
   */
  conSupuesto?: boolean;
  /** Dónde está el hallazgo sobre las láminas del documento (dictamen de la IA y datos del lector). */
  marcas?: MarcaPlano[];
  confidence?: number;
  source?: string;
  /**
   * «zona_por_confirmar»: regla de otra zona de la norma que sigue en revisión solo porque el código de zona (o el
   * sector en San Francisco) tiene confianza baja. Se muestra agrupada en una línea (ADR-0012 de motor-reglas-auditable).
   */
  group?: "zona_por_confirmar";
  /** Con dictamen: estado y motivo que dio el motor (el estado mostrado es el del dictamen). */
  motorStatus?: ComplianceStatus;
  motorReason?: string;
  /** Decisión del arquitecto revisor (dictamen.json) que fija `status`. */
  dictamen?: DecisionRegla;
}

export interface PreCheckSummary {
  checked: number;
  passed: number;
  failed: number;
  warnings: number;
  manualReview: number;
  /** Reglas evaluadas que resultaron NO_APLICA (del motor o del dictamen). */
  notApplicable: number;
  /** Reglas del catálogo que no aplican a este plano (otra zona, otro trámite…) y no se evaluaron; aparte para no inflar «no aplica». */
  noAplican?: number;
}

export interface PreCheck {
  id: string;
  projectId: string;
  status: "queued" | "running" | "completed" | "failed";
  startedAt: string;
  finishedAt?: string;
  engineVersion: string;
  results: ComplianceResult[];
  summary: PreCheckSummary;
  /**
   * Reglas tal como se evaluaron, cuando no todas están en el catálogo de la web (p. ej. las de zonas exceptuadas
   * de un expediente real). Tienen prioridad sobre el catálogo al unir resultado y regla.
   */
  rules?: ComplianceRule[];
  /** Informe narrativo del agente revisor-planos (informe.md), en Markdown. Se muestra como texto, nunca como HTML. */
  informeRevisor?: string | null;
  /** Fuente de los estados cuando no son los del motor (p. ej. «Dictamen del arquitecto revisor (agente revisor-planos)»). */
  fuenteResultado?: string;
}

export interface PreCheckProgress {
  stage: PipelineStage;
  percent: number;
  ruleIndex: number;
  ruleTotal: number;
}

export type PipelineStage =
  | "uploading"
  | "reading"
  | "geometry"
  | "property"
  | "rules"
  | "analyzing"
  | "checks"
  | "report"
  | "done";

export interface Reviewer {
  id: string;
  name: string;
  role: "revisor_doyc" | "aprobador" | "redactor" | "profesional";
}

export interface Annotation {
  id: string;
  resultId?: string;
  sheetId: string;
  author: Reviewer;
  text: string;
  createdAt: string;
  kind: "comment" | "review_flag";
}

export interface Report {
  id: string;
  projectId: string;
  precheckId: string;
  version: "revisor" | "profesional";
  hash?: string;
  generatedAt: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  href?: string;
}

export interface Session {
  user: Reviewer & { email: string };
  token: string;
}

export interface Page<T> {
  items: T[];
  hasNext: boolean;
  nextCursor: string | null;
  /** Elementos que la consulta dejó fuera a propósito (corridas de prueba en las listas del usuario). */
  ocultas?: number;
}

export interface GisLayerId {
  id: "parcels" | "zoning" | "landUse" | "projects" | "infrastructure";
}

/** Dirección encontrada por el geocodificador (OpenStreetMap), dentro del distrito. */
export interface AddressMatch {
  id: string;
  /** Nombre visible: vía, lugar o calle con número. */
  label: string;
  /** Calle y barrio o ciudad. */
  detail: string;
  point: LngLat;
}

/**
 * Revisión DOYC de un PreCheck real (revision.json): lo que el revisor dice de cada decisión de la IA. El PreCheck es
 * preliminar (principio 3): todo NO_CUMPLE lo confirma una persona, y esto es lo que queda guardado de esa persona.
 * «pendiente» deshace una respuesta anterior sin perder la nota ni la fecha del cambio.
 */
export type AccionRevision = "confirmar" | "contradecir" | "pendiente";

export interface DecisionRevision {
  accion: AccionRevision;
  /** Nota corta del revisor (puede quedar vacía). */
  nota: string;
  /** ISO; la pone el servidor al guardar. */
  fecha: string;
}

export interface RevisionPreCheck {
  version: 1;
  /** Por id de regla (el mismo `ruleId` de los resultados). */
  decisiones: Record<string, DecisionRevision>;
}
