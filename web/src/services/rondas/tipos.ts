/**
 * Rondas de mejora del pipeline (GET /api/rondas): el catálogo curado (docs/demo/rondas.json: qué cambió, por qué y
 * qué efecto tuvo) unido por número de ronda con las métricas de sus corridas (web/.data/rondas-metricas.json, que
 * genera scripts/analisis/rondas.py). Solo tipos: los comparten la ruta del servidor y la página.
 */
export const ETAPAS_RONDA = ["linea-base", "lectura", "regiones", "dictamen", "deepseek", "comparativa"] as const;
export type EtapaRonda = (typeof ETAPAS_RONDA)[number];

export interface DictamenCorrida {
  /** Decisiones de la IA que contradicen al motor de reglas. */
  contradiceMotor: number;
  informacionRequerida: number;
  externasSinEstado: number;
}

export interface CorridaRonda {
  plano: string;
  modelo: string;
  proveedor: string | null;
  precheckId: string | null;
  projectId: string | null;
  /** 1 para la primera corrida del plano y modelo en la ronda; 2, 3… para las repeticiones («… (2)»). */
  repeticion: number;
  fecha: string | null;
  terminada: boolean;
  error: string | null;
  usd: number | null;
  minutos: number | null;
  decisiones: number | null;
  dictamen: DictamenCorrida | null;
  deepseek: { llamadas: number; tokensEntradaMedia: number } | null;
}

export interface Ronda {
  ronda: number;
  /** Tiene entrada en el catálogo curado (qué cambió, por qué, resultado). */
  documentada: boolean;
  fecha: string | null;
  tanda: string | null;
  titulo: string | null;
  /** Una frase en primera persona: qué se cambió («Añadí …»). */
  cambioCorto: string | null;
  /** Una frase con el efecto medido y cifras («Mejoró …: 81 → 94 %»). */
  efecto: string | null;
  cambio: string | null;
  hipotesis: string | null;
  resultado: string | null;
  modelos: string[];
  planos: string[];
  /** Ruta del informe en el repositorio (docs/demo/…). */
  informe: string | null;
  commits: string[];
  etapa: EtapaRonda | null;
  /** Id del grupo al que pertenece (ver `GrupoRondas`). */
  grupo: string;
  corridas: CorridaRonda[];
}

/**
 * Rondas que repiten la misma configuración y se miden juntas (`grupos` de docs/demo/rondas.json, versión 2). Una
 * ronda que no está en ningún grupo forma uno propio, así que cada ronda pertenece a exactamente un grupo.
 */
export interface GrupoRondas {
  /** «r43-45», o «r59» para una ronda suelta. */
  id: string;
  /** De menor a mayor. */
  rondas: number[];
  /** El del catálogo; si no lo da, el de su primera ronda. */
  titulo: string | null;
  /** Viene del catálogo (varias rondas juntas), no de una ronda suelta. */
  agrupada: boolean;
}

/** Acuerdo y solapamiento promedio sobre unos pares de corridas del mismo plano (0 a 1; null si no hubo con qué medir). */
export interface MedidaPares {
  /** Reglas del catálogo que decidieron las dos corridas del par: en qué parte dicen lo mismo. */
  acuerdoCatalogo: number | null;
  /** Hallazgos fuera del catálogo: de los que propone alguna de las dos, qué parte proponen ambas. */
  solapamientoHallazgos: number | null;
  pares: number;
}

export type ConteoEstados = Record<"PASS" | "FAIL" | "WARNING" | "MANUAL_REVIEW", [number, number]>;

export interface EstabilidadModelo {
  modelo: string;
  corridas: number;
  /** Entre las repeticiones de este modelo (pares de corridas del mismo modelo). */
  entreRepeticiones: MedidaPares;
  /** En qué parte de las reglas y hallazgos dice lo mismo que la mayoría de todas las corridas del plano (0 a 1). */
  acuerdoMayoria: number;
  /** Mínimo y máximo de cada estado entre sus corridas. */
  rango: ConteoEstados;
  /** Mínimo y máximo de los «no cumple» que son contenido que falta en el plano. */
  faltasEnPlano: [number, number];
}

export interface MedidasPlano {
  corridas: number;
  /** Todos los pares de corridas. */
  todas: MedidaPares;
  /** Solo los pares de modelos distintos. */
  entreModelos: MedidaPares;
  modelos: EstabilidadModelo[];
}

/** Clasificación de una corrida frente a las demás del mismo plano (features/compare/lib/clasificacion.ts). */
export type NivelCorrida = "estandar" | "desviante" | "rarisimo" | "sin_clasificar";

export interface CorridaEstable {
  precheckId: string;
  projectId: string | null;
  ronda: number;
  modelo: string;
  repeticion: number;
  nivel: NivelCorrida;
  puntaje: number;
  motivos: string[];
  /** Pocas corridas del plano (menos de 6): la clasificación es orientativa. */
  orientativa: boolean;
  /** La web la marcó como posiblemente superficial (muy pocos hallazgos propios). */
  superficial: boolean;
  /** Hallazgos fuera del catálogo que propuso. */
  hallazgos: number;
  /** Datos que escribió, de los que piden las reglas de su plano. */
  datos: { n: number; total: number };
  noCumple: number;
  faltasEnPlano: number;
}

/** Estabilidad de un plano dentro de un grupo de rondas: todas sus corridas terminadas, de todos los modelos. */
export interface EstabilidadPlano {
  grupo: string;
  plano: string;
  corridas: CorridaEstable[];
  todas: MedidasPlano;
  /** Lo mismo sin las corridas posiblemente superficiales; null si no hubo ninguna (sería igual). */
  sinSuperficiales: MedidasPlano | null;
}

/** web/.data/rondas-estabilidad.json: lo calcula server/rondas/estabilidad.ts al recalcular las métricas. */
export interface EstabilidadRondas {
  generado: string | null;
  planos: EstabilidadPlano[];
  /** Corridas terminadas cuyo PreCheck no se pudo leer (borrado o sin terminar). */
  sinLeer: number;
}

export interface RespuestaRondas {
  /** De la más antigua a la más reciente. */
  rondas: Ronda[];
  /** De la más antigua a la más reciente, por su primera ronda. */
  grupos: GrupoRondas[];
  planos: string[];
  modelos: string[];
  /** Cuándo se generaron las métricas (null si faltan). */
  generado: string | null;
  catalogoGenerado: string | null;
  /** Estabilidad entre corridas por grupo y plano; null si todavía no se calculó (o no se pudo leer, con aviso). */
  estabilidad: EstabilidadRondas | null;
  /** El archivo no existe o no se pudo leer (con aviso en `avisos`). */
  faltantes: { catalogo: boolean; metricas: boolean };
  avisos: string[];
}

export interface ResumenRecalculo {
  generado: string | null;
  rondas: number;
  corridas: number;
  /** Últimas líneas que imprimió el script. */
  salida: string;
  /** Planos medidos y corridas que no se pudieron leer al calcular la estabilidad; null si ese paso falló. */
  estabilidad: { planos: number; sinLeer: number } | null;
  /** Por qué falló el cálculo de la estabilidad (las métricas sí quedaron). */
  aviso?: string;
}
