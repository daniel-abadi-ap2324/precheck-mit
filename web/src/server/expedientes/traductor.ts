import { z } from "zod";
import { GRUPO_ZONA } from "@/lib/agrupar-zona";
import { categoriaDeRegla } from "@/lib/categoria-regla";
import { ESTADO_DE_DECISION, FUENTE_DICTAMEN, FUENTE_RESPALDO } from "@/lib/dictamen";
import { marcaDeBbox, marcasDeEvidencia } from "@/lib/marcas";
import type {
  ComplianceResult,
  MarcaPlano,
  ComplianceRule,
  ComplianceStatus,
  DatoExpediente,
  DecisionRegla,
  DictamenInfo,
  HojaExpediente,
  PreCheck,
  PreCheckSummary,
  Project,
  ReglasVigentesInfo,
  SupuestoDictamen,
  SupuestoMotor,
  ZonaTrabajoInfo,
} from "@/types";

/**
 * Traduce la salida del agente revisor-planos (expedientes/<caso>/resultado.json y hechos.json) al modelo de la
 * web (Project + PreCheck). Función pura: no lee archivos (eso lo hace almacen.ts).
 *
 * Principios: ningún dato se inventa (lo que falta queda sin valor); ante la duda, «Requiere revisión»; el
 * resultado nunca es oficial (Acuerdo 110, Art. 3).
 *
 * Si la carpeta trae dictamen.json (el dictamen del arquitecto revisor, paso 6 de .claude/agents/revisor-planos.md),
 * el estado que se muestra de cada regla decidida sale del dictamen; el del motor se conserva en motorStatus y
 * motorReason. Un dictamen inválido se ignora (con un aviso) y todo queda con el resultado del motor.
 */

const fuenteSchema = z
  .object({ documento: z.string().nullish(), pagina: z.number().nullish(), metodo: z.string().nullish(), detalle: z.string().nullish() })
  .partial()
  .loose();

const hechoSchema = z.object({ valor: z.unknown(), confianza: z.number().nullish(), fuente: fuenteSchema.nullish() }).loose();

const resultadoReglaSchema = z
  .object({
    regla_id: z.string().min(1),
    regla_version: z.number().nullish(),
    fuente_norma: z
      .object({ norma: z.string().nullish(), articulo: z.string().nullish(), pagina_pdf: z.number().nullish(), cita_textual: z.string().nullish() })
      .loose()
      .nullish(),
    severidad: z.string().nullish(),
    resultado: z.string(),
    motivo: z.string().nullish(),
    valores_usados: z.record(z.string(), hechoSchema.nullish()).nullish(),
    titulo: z.string().nullish(),
    norma: z.string().nullish(),
    /** Tipo de la regla (documental, cuantitativa, criterio). Los resultados anteriores al 19-oct no lo traen. */
    tipo: z.string().nullish(),
    // Campos agregados por ADR-0012 (opcionales: los resultados anteriores no los traen).
    grupo: z.string().nullish(),
    motivo_tipo: z.string().nullish(),
    si_se_confirma_zona: z
      .object({ declarado: z.record(z.string(), z.unknown()).nullish(), resultado: z.string().nullish(), motivo: z.string().nullish() })
      .loose()
      .nullish(),
    // ADR-0016: decisión de respaldo del motor para la regla que dejó en revisión (vale si la IA no decide).
    decision_motor: z
      .object({ resultado: z.string(), motivo: z.string().nullish(), con_supuesto: z.array(z.string()).nullish(), mensaje: z.string().nullish() })
      .loose()
      .nullish()
      .catch(null),
  })
  .loose();

const descartadaSchema = z.object({ codigo: z.string(), norma: z.string().nullish(), motivo: z.string().nullish(), total_distintas: z.number().nullish() }).loose();
const zonaTrabajoSchema = z
  .object({
    codigo: z.string().nullish(),
    norma: z.string().nullish(),
    procedencia: z.string().nullish(),
    firme: z.boolean().nullish(),
    explicacion: z.string().nullish(),
    falta: z.string().nullish(),
    descartadas: z.array(descartadaSchema).nullish().catch(null),
  })
  .loose();
const supuestoMotorSchema = z
  .object({
    id: z.string(),
    tipo: z.string(),
    campo: z.string().nullish(),
    valor: z.unknown().optional(),
    confianza: z.number().nullish(),
    fuente: fuenteSchema.nullish().catch(null),
    explicacion: z.string().nullish(),
    accion: z.string().nullish(),
    reglas: z.array(z.string()).nullish(),
  })
  .loose();

const grupoZonaSchema = z.object({ total: z.number(), motivo: z.string().nullish() }).loose();

export const resultadoSchema = z
  .object({
    fecha_presentacion: z.string().nullish(),
    norma_aplicable: z.string().nullish(),
    codigo_zona: z.string().nullish(),
    umbral: z.number().nullish(),
    oficial: z.boolean().nullish(),
    resumen: z.record(z.string(), z.number()).nullish(),
    avisos: z.array(z.unknown()).nullish(),
    resultados: z.array(resultadoReglaSchema),
    no_aplican: z.union([z.number(), z.array(z.unknown())]).nullish(),
    documento: z.string().nullish(),
    agrupadas: z.object({ zona_por_confirmar: grupoZonaSchema.nullish() }).loose().nullish(),
    // ADR-0016 (opcionales: los resultados anteriores no los traen; uno malformado se ignora).
    zona_trabajo: zonaTrabajoSchema.nullish().catch(null),
    supuestos: z.array(supuestoMotorSchema).nullish().catch(null),
  })
  .loose();

const textoLibre = z.union([z.string(), z.number(), z.boolean()]);

const decisionSchema = z
  .object({
    regla_id: z.string().min(1),
    decision: z.enum(["CUMPLE", "NO_CUMPLE", "OBSERVACION", "NO_APLICA"]),
    valor_leido: textoLibre.nullish(),
    limite: textoLibre.nullish(),
    justificacion: z.string().trim().min(1),
    evidencia: z.array(z.object({ pagina: z.number().int().positive().nullish(), detalle: z.string().nullish(), marcas: z.unknown().optional() }).loose()).nullish(),
    subsanar: z.string().nullish(),
    // «INFORMACION_REQUERIDA» cuando falta un documento o dato externo; cualquier otro valor se ignora.
    estado: z.string().nullish(),
    confianza: z.number().nullish(),
    // Solo en hallazgos sin regla en el catálogo (p. ej. un requisito de presentación): título y cita del arquitecto.
    titulo: z.string().nullish(),
    cita: z.string().nullish(),
  })
  .loose();

export const dictamenSchema = z
  .object({
    version: z.number().nullish(),
    fecha: z.string().nullish(),
    revisor: z.string().nullish(),
    supuestos: z.array(z.object({ hecho: z.string().min(1), valor: z.unknown(), fundamento: z.string().nullish() }).loose()).nullish(),
    decisiones: z.array(decisionSchema),
    conclusion: z.string().nullish(),
    // Paso 3: discrepancias entre las regiones del plano y lo declarado que revisó la IA. Opcional y tolerante: un
    // campo malformado se descarta sin invalidar el dictamen.
    regiones_discrepantes: z
      .array(
        z
          .object({ region_id: z.string().nullish(), dato: z.string().nullish(), detalle: z.string().trim().min(1) })
          .loose()
          .refine((x) => Boolean(x.region_id || x.dato), "falta region_id o dato"),
      )
      .nullish()
      .catch(null),
    modelo: z.string().nullish(),
    costo_usd: z.number().nullish(),
    // Contrato C-OBJECIONES: la IA cree que el motor o una regla del catálogo se equivocan con datos bien leídos. No
    // cambian ningún estado; se muestran junto a la regla. Tolerante: una objeción malformada se descarta.
    objeciones: z
      .array(z.object({ regla_id: z.string().min(1), motivo: z.string().trim().min(1), cita: z.string().nullish() }).loose())
      .nullish()
      .catch(null),
  })
  .loose();

export type Dictamen = z.infer<typeof dictamenSchema>;
export type ResultadoExpediente = z.infer<typeof resultadoSchema>;
export type ResultadoRegla = z.infer<typeof resultadoReglaSchema>;
type Hecho = z.infer<typeof hechoSchema>;

export interface EntradaExpediente {
  /** Slug estable del nombre de la carpeta. */
  slug: string;
  /** Nombre de la carpeta (p. ej. «Ancón  -  RLA-0000-11»). */
  carpeta: string;
  /** Contenido de resultado.json (sin validar). */
  resultado: unknown;
  /** Contenido de hechos.json o, si falta, de lote.json (sin validar). */
  hechos?: unknown;
  /** Contenido de extraccion.json (solo se usa el número de páginas). */
  extraccion?: unknown;
  /** Texto de informe.md, si existe. */
  informe?: string | null;
  /** Fecha (ISO) de resultado.json: fecha de la evaluación. */
  fecha: string;
  /** Contenido de dictamen.json (sin validar), si existe. */
  dictamen?: unknown;
}

export interface ExpedienteTraducido {
  project: Project;
  precheck: PreCheck;
  /** Avisos para el registro del servidor (p. ej. dictamen.json inválido). No se muestran en la web. */
  avisos?: string[];
}

export const ID_PREFIJO = "exp-";
export const idDeProyecto = (slug: string) => `${ID_PREFIJO}${slug}`;
export const idDePrecheck = (projectId: string) => `pc-${projectId}`;

/** Slug estable del nombre de la carpeta: sin tildes, en minúsculas, solo [a-z0-9-]. */
export function slugDeCarpeta(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

/** «Ancón  -  RLA-0000-11» → «Ancón · RLA-0000-11». */
export function nombreDeCarpeta(carpeta: string): string {
  return carpeta
    .split(/\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" · ");
}

/**
 * El estado final según la severidad y el tipo de la regla, decida el motor o la IA: un NO_CUMPLE de severidad
 * «observacion» (tamaño de lote, casos de criterio) se muestra como observación, y el de un requisito de contenido del
 * plano (tipo documental) como «No cumple · falta en el plano», que se subsana completando el plano.
 */
export function segunRegla(result: ComplianceResult, r: Pick<ResultadoRegla, "severidad" | "tipo">): ComplianceResult {
  const resto = { ...result };
  delete resto.faltaEnPlano;
  if (resto.status !== "FAIL") return resto;
  if (r.severidad === "observacion") return { ...resto, status: "WARNING" };
  return r.tipo === "documental" ? { ...resto, faltaEnPlano: true } : resto;
}

/** Resultado del motor → estado de la web. Lo desconocido va a revisión (principio 2). */
export function estadoDeResultado(resultado: string, severidad?: string | null): ComplianceStatus {
  switch (resultado) {
    case "CUMPLE":
      return "PASS";
    case "NO_CUMPLE":
      return severidad === "observacion" ? "WARNING" : "FAIL";
    case "NO_APLICA":
      return "NOT_APPLICABLE";
    default:
      return "MANUAL_REVIEW";
  }
}

/** Unidad a partir del sufijo de la clave del hecho (area_m2 → m², altura_m → m, _pct → %). */
export function unidadDeClave(clave: string): string | undefined {
  if (/_m2$/.test(clave)) return "m²";
  if (/_m$/.test(clave)) return "m";
  if (/_pct$/.test(clave)) return "%";
  if (/_pers_ha$/.test(clave)) return "pers/ha";
  return undefined;
}

/** Hechos de contexto que no son el valor medido de la regla. */
// Datos de contexto, no medidas: la unidad territorial (un número) no es el valor detectado de la regla.
const CONTEXTO = new Set(["tramite", "lote.norma_aplicable", "expediente.fecha_presentacion", "lote.codigo_zona", "lote.sf_sector", "lote.sf_unidad_territorial"]);

function fuenteTexto(h: Hecho): string | undefined {
  const f = h.fuente;
  if (!f) return undefined;
  const partes = [f.documento, typeof f.pagina === "number" ? `p. ${f.pagina}` : null].filter(Boolean).join(", ");
  const metodo = [f.metodo, f.detalle].filter(Boolean).join(": ");
  const texto = [partes, metodo ? `(${metodo})` : ""].filter(Boolean).join(" ");
  return texto || undefined;
}

function valorTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number" || typeof v === "string") return String(v);
  return JSON.stringify(v);
}

/** «Provisional: si se confirma codigo_zona MP-C2, CUMPLE.» Indicativo; el estado sigue siendo el del motor. */
function provisionalTexto(r: ResultadoRegla): string | null {
  const p = r.si_se_confirma_zona;
  if (!p?.resultado) return null;
  const declarado = Object.entries(p.declarado ?? {})
    .map(([k, v]) => `${k.split(".").pop()} ${valorTexto(v)}`)
    .join(", ");
  return `Provisional: si se confirma ${declarado || "la zona declarada"}, ${p.resultado}.`;
}

/** Resultado de una regla del expediente → resultado y regla de la web. */
export function traducirResultado(r: ResultadoRegla, ruleId = r.regla_id): { result: ComplianceResult; rule: ComplianceRule } {
  const fn = r.fuente_norma ?? {};
  const norma = fn.norma ?? r.norma ?? "Norma no indicada";
  const articulo = fn.articulo ?? "—";
  const cita = fn.cita_textual ?? "";
  const titulo = r.titulo?.trim() || r.regla_id;
  const status = estadoDeResultado(r.resultado, r.severidad);

  const hechos = Object.entries(r.valores_usados ?? {}).filter((e): e is [string, Hecho] => Boolean(e[1]));
  const medidos = hechos.filter(([k]) => !CONTEXTO.has(k));
  const numericos = medidos.filter(([, h]) => typeof h.valor === "number");
  const confianzas = hechos.map(([, h]) => h.confianza).filter((c): c is number => typeof c === "number");
  const fuentes = medidos
    .map(([k, h]) => {
      const t = fuenteTexto(h);
      return t ? `${k}: ${t}` : null;
    })
    .filter((x): x is string => Boolean(x));

  const motivo = r.motivo?.trim();
  const explanation = [motivo ? `${motivo.charAt(0).toUpperCase()}${motivo.slice(1)}.` : null, provisionalTexto(r), cita ? `Cita (${norma}, ${articulo}): «${cita}»` : null]
    .filter(Boolean)
    .join(" ");

  const result: ComplianceResult = {
    ruleId,
    status,
    official: false,
    regulationReference: `${norma}, ${articulo}`,
    ...(explanation ? { explanation } : {}),
    ...(confianzas.length ? { confidence: Math.min(...confianzas) } : {}),
    ...(fuentes.length ? { source: fuentes.join("; ") } : {}),
    ...(r.grupo === GRUPO_ZONA ? { group: GRUPO_ZONA } : {}),
    ...(status === "FAIL" && r.tipo === "documental" ? { faltaEnPlano: true } : {}),
  };
  // Valor detectado solo si la regla usó un único dato numérico: con varios, no se elige uno.
  if (numericos.length === 1) {
    const [clave, hecho] = numericos[0];
    result.detectedValue = hecho.valor as number;
    const unidad = unidadDeClave(clave);
    if (unidad) result.unit = unidad;
  }

  const rule: ComplianceRule = {
    id: ruleId,
    version: r.regla_version ?? 1,
    title: titulo,
    category: categoriaDeRegla(r.regla_id, r.titulo),
    zoning: null,
    description: titulo,
    operator: "criterio",
    value: null,
    unit: null,
    regulation: { id: r.regla_id, norma, article: articulo, quote: cita, ...(typeof fn.pagina_pdf === "number" ? { sourcePage: fn.pagina_pdf } : {}) },
    // Las reglas del catálogo real están todas en borrador (CLAUDE.md, «Riesgos abiertos»).
    state: "borrador",
    severity: r.severidad === "observacion" ? "observacion" : "bloqueante",
  };
  return { result, rule };
}

const ETIQUETAS: Record<string, string> = {
  "lote.area_m2": "Área del lote",
  "lote.finca": "Finca",
  "lote.corregimiento": "Corregimiento",
  "lote.norma_aplicable": "Norma aplicable",
  "lote.codigo_zona": "Código de zona",
  "lote.frente_m": "Frente del lote",
  "lote.fondo_m": "Fondo del lote",
  "lote.area_geometrica_m2": "Área geométrica del lote",
  "lote.fincas": "Fincas",
  "lote.cantidad_fincas": "Cantidad de fincas",
  "lote.orden_conservacion": "Orden de conservación",
  "lote.sf_sector": "Sector (San Francisco)",
  "plano.anexo_iv.cuadro_de_areas": "Anexo IV: cuadro de áreas en el plano",
  "plano.anexo_iv.escala": "Anexo IV: escala en el plano",
  "plano.anexo_iv.fecha": "Anexo IV: fecha en el plano",
  "plano.anexo_iv.localizacion_regional": "Anexo IV: localización regional",
  "plano.anexo_iv.numero_de_hoja": "Anexo IV: número de hoja",
  "plano.anexo_iv.profesional_responsable": "Anexo IV: consta el profesional responsable",
  "plano.anexo_iv.propietario": "Anexo IV: consta el propietario",
  "plano.finca": "Finca (según el plano)",
  "plano.area_lote_m2": "Área del lote (según el plano)",
  "plano.zonificacion_declarada": "Zonificación declarada en el plano",
  "plano.intervalo_curvas_nivel_m": "Intervalo de curvas de nivel",
  "proyecto.uso_propuesto": "Uso propuesto",
  "proyecto.unidades_vivienda": "Unidades de vivienda",
  "proyecto.pisos_totales": "Pisos",
  "proyecto.altura_m": "Altura",
  "proyecto.retiro_frontal_m": "Retiro frontal",
  "proyecto.retiro_lateral_m": "Retiro lateral",
  "proyecto.retiro_posterior_m": "Retiro posterior",
  "proyecto.ocupacion_pct": "Ocupación",
  "proyecto.area_libre_pct": "Área libre",
  "proyecto.densidad_pers_ha": "Densidad",
};

/** Recorre hechos.json / lote.json y devuelve cada hecho ({valor, confianza, fuente}) con su clave con puntos. */
export function aplanarHechos(obj: unknown, prefijo = ""): DatoExpediente[] {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  const o = obj as Record<string, unknown>;
  if ("valor" in o && ("confianza" in o || "fuente" in o)) {
    const h = hechoSchema.safeParse(o);
    if (!h.success) return [];
    const unidad = unidadDeClave(prefijo);
    const valor = valorTexto(h.data.valor);
    return [
      {
        clave: prefijo,
        etiqueta: ETIQUETAS[prefijo] ?? prefijo,
        valor: valor && unidad && typeof h.data.valor === "number" ? `${valor} ${unidad}` : valor,
        ...(typeof h.data.confianza === "number" ? { confianza: h.data.confianza } : {}),
        ...(fuenteTexto(h.data) ? { fuente: fuenteTexto(h.data) } : {}),
        ...(typeof h.data.fuente?.pagina === "number" && h.data.fuente.pagina > 0 ? { pagina: h.data.fuente.pagina } : {}),
        ...(h.data.fuente?.metodo ? { metodo: h.data.fuente.metodo } : {}),
        ...(h.data.fuente?.detalle?.trim() ? { detalle: h.data.fuente.detalle.trim() } : {}),
      },
    ];
  }
  return Object.entries(o).flatMap(([k, v]) => aplanarHechos(v, prefijo ? `${prefijo}.${k}` : k));
}

const textoOpcional = (v: unknown): string | undefined => {
  const t = valorTexto(v).trim();
  return t || undefined;
};

/** Decisión validada del dictamen → la de la web. */
function decisionDe(d: Dictamen["decisiones"][number]): DecisionRegla {
  const valorLeido = textoOpcional(d.valor_leido);
  const limite = textoOpcional(d.limite);
  const subsanar = d.subsanar?.trim();
  return {
    decision: d.decision,
    ...(valorLeido ? { valorLeido } : {}),
    ...(limite ? { limite } : {}),
    justificacion: d.justificacion.trim(),
    evidencia: (d.evidencia ?? []).map((e) => ({ pagina: e.pagina ?? null, detalle: e.detalle?.trim() ?? "" })),
    ...(marcasDeEvidencia(d.evidencia).length ? { marcas: marcasDeEvidencia(d.evidencia) } : {}),
    ...(subsanar ? { subsanar } : {}),
    ...(d.estado === "INFORMACION_REQUERIDA" ? { estado: "INFORMACION_REQUERIDA" as const } : {}),
    ...(typeof d.confianza === "number" ? { confianza: d.confianza } : {}),
    origen: "ia",
  };
}

const DECISION_MOTOR: Record<string, DecisionRegla["decision"]> = { CUMPLE: "CUMPLE", NO_CUMPLE: "NO_CUMPLE", NO_APLICA: "NO_APLICA", OBSERVACION: "OBSERVACION", INFORMACION_REQUERIDA: "OBSERVACION" };

/**
 * Decisión de respaldo del motor (ADR-0016) → la de la web, con `origen: "motor"`. INFORMACION_REQUERIDA se muestra
 * como observación con el estado (igual que en el dictamen). Null si la regla no la trae o el resultado es desconocido.
 */
export function decisionDelMotor(r: Pick<ResultadoRegla, "decision_motor">): DecisionRegla | null {
  const dm = r.decision_motor;
  const decision = dm ? DECISION_MOTOR[dm.resultado] : undefined;
  if (!dm || !decision) return null;
  const motivo = dm.motivo?.trim() || "decisión del motor";
  const mensaje = dm.mensaje?.trim();
  return {
    decision,
    justificacion: `${motivo.charAt(0).toUpperCase()}${motivo.slice(1)}.`,
    evidencia: [],
    ...(mensaje ? { subsanar: mensaje } : {}),
    ...(dm.resultado === "INFORMACION_REQUERIDA" ? { estado: "INFORMACION_REQUERIDA" as const } : {}),
    origen: "motor",
    ...(dm.con_supuesto?.length ? { supuestos: dm.con_supuesto } : {}),
  };
}

/** La decisión es de la IA (las anteriores a ADR-0016 no traen origen y son todas de la IA). */
export const esDecisionDeIa = (d: DecisionRegla | undefined): d is DecisionRegla => Boolean(d) && d?.origen !== "motor";

/** Confianza mínima del motor cuando resultado.json no la trae. */
const UMBRAL_POR_DEFECTO = 0.85;
const DECIDIDO_POR_EL_MOTOR = new Set(["CUMPLE", "NO_CUMPLE", "NO_APLICA"]);

/**
 * Lo que la web hace con una decisión antes de aplicarla (principio 2: ante la duda, revisión; el motor es conservador
 * y la IA decide lo que él deja en REQUIERE_REVISION):
 * - una regla que el motor ya decidió con los datos no la cambia la IA: si la decisión difiere, prevalece el motor y la
 *   decisión queda anotada con `reserva.motivo = "motor"` (la IA corrige datos, no decisiones);
 * - un NO_CUMPLE cuya confianza declarada está bajo el umbral no bloquea: se muestra como observación con
 *   `reserva.motivo = "confianza"` hasta que una persona lo confirme. (La confianza del dato leído no cuenta aquí: la IA
 *   decide justamente lo que el lector dejó con confianza baja, p. ej. «sin curvas de nivel» escrito como 0 con 0.5.)
 */
export function reservaDeDecision(r: Pick<ResultadoRegla, "resultado">, d: DecisionRegla, umbral = UMBRAL_POR_DEFECTO): DecisionRegla["reserva"] | undefined {
  if (d.origen === "motor") return undefined;
  if (DECIDIDO_POR_EL_MOTOR.has(r.resultado) && r.resultado !== d.decision) {
    return { motivo: "motor", detalle: `La IA propuso ${d.decision}, pero el motor ya había decidido ${r.resultado} con los datos del expediente; prevalece el motor. Si el dato está mal, corríjalo en el lector y vuelva a evaluar.` };
  }
  // Solo sobre lo que el motor dejó en revisión: si el motor ya dio NO_CUMPLE y la IA coincide con confianza baja, el
  // NO_CUMPLE es del motor y no se rebaja.
  if (d.decision === "NO_CUMPLE" && !DECIDIDO_POR_EL_MOTOR.has(r.resultado) && typeof d.confianza === "number" && d.confianza < umbral) {
    return { motivo: "confianza", detalle: `La IA dio el NO_CUMPLE con confianza ${d.confianza}, bajo el umbral ${umbral}: se muestra como observación hasta que una persona confirme el hallazgo en el plano.` };
  }
  return undefined;
}

/**
 * Aplica la decisión del dictamen a un resultado: el estado sale del dictamen y el del motor queda en motorStatus y
 * motorReason. La explicación pasa a ser la justificación del arquitecto, y «Qué subsanar» la acción recomendada.
 */
type Dims = Map<number, { ancho_mm: number; alto_mm: number }>;

/** Tamaño (mm) de cada página según extraccion.json. */
function dimsDe(paginas: unknown): Dims {
  const dims: Dims = new Map();
  if (!Array.isArray(paginas)) return dims;
  for (const p of paginas as { numero?: unknown; ancho_mm?: unknown; alto_mm?: unknown }[]) {
    if (typeof p?.numero === "number" && typeof p.ancho_mm === "number" && typeof p.alto_mm === "number") dims.set(p.numero, { ancho_mm: p.ancho_mm, alto_mm: p.alto_mm });
  }
  return dims;
}

/** Recuadro de cada dato medido que usó la regla y que el lector halló con su posición (bbox) en una página. */
function marcasDelLector(r: ResultadoRegla, dims: Dims): MarcaPlano[] {
  const salida: MarcaPlano[] = [];
  for (const [clave, h] of Object.entries(r.valores_usados ?? {})) {
    const f = h?.fuente as { pagina?: unknown; bbox?: unknown; metodo?: unknown } | null | undefined;
    if (!h || CONTEXTO.has(clave) || !f || typeof f.pagina !== "number" || f.metodo === "humano") continue;
    const m = marcaDeBbox(f.bbox, f.pagina, dims.get(f.pagina), clave);
    if (m) salida.push(m);
  }
  return salida;
}

function aplicarDecision(result: ComplianceResult, d: DecisionRegla, motorDecidio = false): ComplianceResult {
  // Prevalece el motor: el estado y la explicación siguen siendo los suyos; la decisión queda visible con su reserva.
  if (d.reserva?.motivo === "motor") return { ...result, dictamen: d, official: false };
  const { explanation, ...resto } = result;
  return {
    ...resto,
    // Si el motor ya había decidido lo mismo, se conserva su estado (p. ej. NO_CUMPLE de severidad observación).
    status: d.reserva?.motivo === "confianza" ? "WARNING" : motorDecidio ? result.status : ESTADO_DE_DECISION[d.decision],
    motorStatus: result.status,
    ...(explanation ? { motorReason: explanation } : {}),
    explanation: d.justificacion,
    ...(d.subsanar ? { recommendedAction: d.subsanar } : {}),
    dictamen: d,
    // Nunca oficial: las reglas siguen en borrador y el visto bueno es del Revisor DOYC.
    official: false,
  };
}

const vigentesSchema = z
  .object({
    total: z.number(),
    sin_determinar: z.number().nullish(),
    exceptuadas: z.number().nullish(),
    propuestas: z.number().nullish(),
    generales: z.number().nullish(),
    zonificacion: z.number().nullish(),
    alcance_ia: z.object({ presente: z.boolean().nullish(), aplicado: z.array(z.string()).nullish(), errores: z.array(z.string()).nullish() }).loose().nullish(),
  })
  .loose();
const permisoSchema = z
  .object({
    id: z.string(),
    tipo: z.string().nullish(),
    titulo: z.string().nullish(),
    fuente: z.object({ documento: z.string().nullish(), pagina: z.number().nullish(), cita: z.string().nullish() }).loose().nullish(),
    efecto: z.array(z.object({ regla_id: z.string(), accion: z.enum(["exceptua", "condiciona"]) }).loose()).nullish(),
  })
  .loose();

/**
 * Reglas vigentes de la corrida (paso 1): el resumen que escribe el motor en resultado.json (`reglas_vigentes` y
 * `permisos`). Null si la evaluación es anterior al paso 1 o el resumen no se puede leer.
 */
export function vigentesDe(res: ResultadoExpediente): ReglasVigentesInfo | null {
  const v = vigentesSchema.safeParse((res as { reglas_vigentes?: unknown }).reglas_vigentes);
  if (!v.success) return null;
  const permisos = z.array(permisoSchema).safeParse((res as { permisos?: unknown }).permisos ?? []);
  return {
    norma: res.norma_aplicable ?? null,
    // Sin zona de trabajo (ADR-0016), el código declarado no es la zona con que se evaluó.
    zona: res.zona_trabajo && !res.zona_trabajo.codigo ? null : (res.codigo_zona ?? null),
    total: v.data.total,
    sinDeterminar: v.data.sin_determinar ?? 0,
    exceptuadas: v.data.exceptuadas ?? 0,
    alcanceIa: { presente: Boolean(v.data.alcance_ia?.presente), aplicado: v.data.alcance_ia?.aplicado ?? [], errores: v.data.alcance_ia?.errores ?? [] },
    permisos: (permisos.success ? permisos.data : []).map((p) => ({
      id: p.id,
      tipo: p.tipo ?? "otro",
      titulo: p.titulo ?? "",
      cita: p.fuente?.cita ?? "",
      documento: p.fuente?.documento ?? null,
      pagina: p.fuente?.pagina ?? null,
      efecto: (p.efecto ?? []).map((e) => ({ reglaId: e.regla_id, accion: e.accion })),
    })),
    propuestas: v.data.propuestas ?? 0,
    ...(typeof v.data.generales === "number" ? { generales: v.data.generales } : {}),
    ...(typeof v.data.zonificacion === "number" ? { zonificacion: v.data.zonificacion } : {}),
    ...(res.zona_trabajo?.codigo && res.zona_trabajo.procedencia ? { procedenciaZona: textoProcedencia(res.zona_trabajo) } : {}),
    ...(res.zona_trabajo && !res.zona_trabajo.codigo ? { procedenciaZona: `sin zona de trabajo: falta ${res.zona_trabajo.falta ?? "la CEUS"}` } : {}),
  };
}

const PROCEDENCIA: Record<string, string> = {
  oficial: "según un documento oficial del expediente",
  arquitecto: "la que definió el arquitecto",
  documento_grafico: "leída en el Documento Gráfico con las coordenadas del lote",
  plano: "la que declara el plano",
  usuario: "la que se indicó al crear el PreCheck",
  ia: "la que leyó la IA",
  familia: "supuesta por la familia de zona",
};

/** «firme, según un documento oficial del expediente» o «supuesta, la que declara el plano». */
function textoProcedencia(z: NonNullable<ResultadoExpediente["zona_trabajo"]>): string {
  const de = PROCEDENCIA[z.procedencia ?? ""] ?? z.procedencia ?? "";
  return `${z.firme ? "firme" : "supuesta"}${de ? `, ${de}` : ""}`;
}

/** Zona de trabajo de resultado.json (ADR-0016); null en los resultados anteriores. */
export function zonaTrabajoDe(res: ResultadoExpediente): ZonaTrabajoInfo | null {
  const z = res.zona_trabajo;
  if (!z) return null;
  return {
    codigo: z.codigo ?? null,
    norma: z.norma ?? null,
    procedencia: z.procedencia ?? null,
    firme: Boolean(z.firme),
    explicacion: z.explicacion?.trim() ?? "",
    falta: z.falta?.trim() || null,
    descartadas: (z.descartadas ?? []).map((d) => ({ codigo: d.codigo, norma: d.norma ?? null, motivo: d.motivo?.trim() ?? "", reglasDistintas: d.total_distintas ?? 0 })),
  };
}

/** Supuestos del motor en lenguaje llano: qué se supuso, en cuántas reglas y qué hacer para quitarlo. */
export function supuestosDe(res: ResultadoExpediente): SupuestoMotor[] {
  return (res.supuestos ?? []).map((s) => {
    const etiqueta = s.campo ? (ETIQUETAS[s.campo] ?? s.campo) : "";
    const donde = typeof s.fuente?.pagina === "number" ? `, p. ${s.fuente.pagina}` : "";
    const texto =
      s.tipo === "zona" || s.tipo === "sin_zona"
        ? (s.explicacion?.trim() ?? "")
        : s.tipo === "dato_dudoso"
          ? `${etiqueta}: se usó «${valorTexto(s.valor)}» tal como lo dice el plano${donde}, leído con confianza ${typeof s.confianza === "number" ? s.confianza : "baja"}.`
          : s.tipo === "no_indicado"
            ? `${etiqueta}: el plano no lo indica; se supuso que no existe (solo en reglas no bloqueantes).`
            : s.tipo === "borde"
              ? "Medidas en el borde de la tolerancia: se decidió con la medida leída."
              : (s.explicacion?.trim() ?? s.tipo);
    const accion =
      s.accion?.trim() ||
      (s.tipo === "dato_dudoso" ? "Confírmelo en el plano o corríjalo con su fuente." : s.tipo === "no_indicado" ? "Si existe, indíquelo en el plano." : s.tipo === "borde" ? "Confirme la medida con la cota del plano." : null);
    return { id: s.id, tipo: s.tipo, texto, accion, reglas: s.reglas?.length ?? 0 };
  });
}

function supuestoDe(s: NonNullable<Dictamen["supuestos"]>[number]): SupuestoDictamen {
  return { hecho: s.hecho, etiqueta: ETIQUETAS[s.hecho] ?? s.hecho, valor: valorTexto(s.valor) || "no consta", fundamento: s.fundamento?.trim() ?? "" };
}

/**
 * Un NO_CUMPLE descansa en un supuesto (ADR-0016) si la decisión es la de respaldo del motor y lleva supuestos, o si la
 * IA lo decidió en una regla que depende de la zona de trabajo supuesta (la IA no confirma la zona desde el dictamen).
 */
function descansaEnSupuesto(r: ResultadoRegla, d: DecisionRegla | undefined, tipoDeSupuesto: Map<string, string>): boolean {
  const ids = r.decision_motor?.con_supuesto ?? [];
  if (!d || d.reserva?.motivo === "motor") return false;
  return d.origen === "motor" ? ids.length > 0 : ids.some((id) => tipoDeSupuesto.get(id) === "zona");
}

/** Valida dictamen.json. Devuelve null (y un aviso) si no tiene la forma esperada. */
export function leerDictamen(crudo: unknown, avisos: string[]): Dictamen | null {
  if (crudo === undefined || crudo === null) return null;
  const r = dictamenSchema.safeParse(crudo);
  if (r.success) return r.data;
  const primero = r.error.issues[0];
  avisos.push(`dictamen.json inválido; se usa el resultado del motor (${primero ? `${primero.path.join(".") || "raíz"}: ${primero.message}` : "forma inesperada"})`);
  return null;
}

/** Conteos de lo evaluado; las reglas que no aplican al plano (no evaluadas) van aparte para que «no aplica» no sume miles. */
function resumenDe(results: ComplianceResult[], noAplican: number): PreCheckSummary {
  const c = (s: ComplianceStatus) => results.filter((r) => r.status === s).length;
  const notApplicable = c("NOT_APPLICABLE");
  return {
    checked: results.length - notApplicable,
    passed: c("PASS"),
    failed: c("FAIL"),
    warnings: c("WARNING"),
    manualReview: c("MANUAL_REVIEW"),
    notApplicable,
    ...(noAplican ? { noAplican } : {}),
  };
}

const paginaSchema = z
  .object({
    numero: z.number().int().positive(),
    tipo: z.string().nullish(),
    lamina: z.object({ codigo: z.string().nullish() }).loose().nullish(),
  })
  .loose();

/** Páginas de extraccion.json (número, tipo y código de lámina). Las que no tienen la forma esperada se omiten. */
function hojasDe(paginas: unknown): HojaExpediente[] {
  if (!Array.isArray(paginas)) return [];
  return paginas.flatMap((p) => {
    const r = paginaSchema.safeParse(p);
    return r.success ? [{ numero: r.data.numero, tipo: r.data.tipo ?? null, lamina: r.data.lamina?.codigo?.trim() || null }] : [];
  });
}

const textoDeAviso = (a: unknown) => (typeof a === "string" ? a : JSON.stringify(a));

/**
 * Traduce un expediente. Lanza si resultado.json no tiene la forma esperada (la ruta lo omite del listado).
 * Una regla que no esté en el catálogo de la web no se pierde: su título y su fuente salen del propio resultado.
 */
export function traducirExpediente(e: EntradaExpediente): ExpedienteTraducido {
  const res = resultadoSchema.parse(e.resultado);
  const id = idDeProyecto(e.slug);
  const precheckId = idDePrecheck(id);

  const avisos: string[] = [];
  const dictamen = leerDictamen(e.dictamen, avisos);
  // Una decisión por regla: si el dictamen repite una regla, vale la primera.
  const decisiones = new Map<string, DecisionRegla>();
  for (const d of dictamen?.decisiones ?? []) {
    if (decisiones.has(d.regla_id)) avisos.push(`dictamen.json repite la regla ${d.regla_id}; se usa la primera decisión`);
    else decisiones.set(d.regla_id, decisionDe(d));
  }
  const evaluadasIds = new Set(res.resultados.map((r) => r.regla_id));
  // Hallazgos del arquitecto sin regla en el catálogo (p. ej. faltan los cortes): se muestran como resultados propios,
  // con la cita que da el arquitecto, para que un NO_CUMPLE de presentación no se pierda de los conteos.
  const hallazgos = (dictamen?.decisiones ?? []).filter((d, i, todas) => !evaluadasIds.has(d.regla_id) && todas.findIndex((x) => x.regla_id === d.regla_id) === i);

  // «zona.otras_zonas_no_aplican»: forma compacta de decir que las reglas de otras zonas o unidades territoriales (las del
  // grupo zona_por_confirmar) no aplican, en vez de listar cientos de decisiones NO_APLICA una por una.
  const otrasZonasNoAplican = (dictamen as { zona?: { otras_zonas_no_aplican?: unknown } | null } | null)?.zona?.otras_zonas_no_aplican === true;
  const dimsDePaginas = dimsDe((e.extraccion as { paginas?: unknown } | undefined)?.paginas);
  const tipoDeSupuesto = new Map((res.supuestos ?? []).map((s) => [s.id, s.tipo]));
  const vistos = new Map<string, number>();
  const pares = res.resultados.map((r) => {
    const n = (vistos.get(r.regla_id) ?? 0) + 1;
    vistos.set(r.regla_id, n);
    const par = traducirResultado(r, n === 1 ? r.regla_id : `${r.regla_id}#${n}`);
    let d = decisiones.get(r.regla_id);
    if (!d && otrasZonasNoAplican && par.result.group === GRUPO_ZONA && par.result.status === "MANUAL_REVIEW") {
      d = decisionDe({ regla_id: r.regla_id, decision: "NO_APLICA", justificacion: "Regla de otra zona o unidad territorial: el dictamen determinó la zona del lote y marcó las demás como no aplicables." });
    }
    // ADR-0016: lo que la IA no decidió queda con la decisión de respaldo del motor (origen «motor»).
    if (!d) d = decisionDelMotor(r) ?? undefined;
    if (d) {
      const reserva = reservaDeDecision(r, d, res.umbral ?? UMBRAL_POR_DEFECTO);
      if (reserva) {
        d = { ...d, reserva };
        avisos.push(`dictamen.json: ${r.regla_id} ${reserva.motivo === "motor" ? `(IA ${d.decision}, motor ${r.resultado}) prevalece el motor` : "NO_CUMPLE con confianza bajo el umbral; se muestra como observación"}`);
      }
    }
    const aplicado = d ? segunRegla(aplicarDecision(par.result, d, DECIDIDO_POR_EL_MOTOR.has(r.resultado)), r) : par.result;
    const resultado = aplicado.status === "FAIL" && descansaEnSupuesto(r, d, tipoDeSupuesto) ? { ...aplicado, conSupuesto: true } : aplicado;
    // Dónde está el hallazgo sobre las láminas: lo que ubicó la IA primero y, después, los recuadros de los datos del lector.
    const marcas = [...(d?.marcas ?? []), ...marcasDelLector(r, dimsDePaginas)].slice(0, 8);
    return { ...par, result: marcas.length ? { ...resultado, marcas } : resultado };
  });
  for (const h of hallazgos) {
    const cita = h.cita?.trim() ?? "";
    const par = traducirResultado({
      regla_id: h.regla_id,
      resultado: "REQUIERE_REVISION",
      titulo: h.titulo?.trim() || `Hallazgo del arquitecto revisor: ${valorTexto(h.limite) || h.regla_id}`,
      fuente_norma: { norma: cita.split(/[:«]/)[0].trim() || "Hallazgo del arquitecto revisor (sin regla en el catálogo)", articulo: "—", cita_textual: cita },
    });
    const d = decisiones.get(h.regla_id) as DecisionRegla;
    const reserva = reservaDeDecision({ resultado: "REQUIERE_REVISION" }, d, res.umbral ?? UMBRAL_POR_DEFECTO);
    pares.push({ ...par, result: { ...aplicarDecision(par.result, reserva ? { ...d, reserva } : d), fueraDeCatalogo: true } });
  }
  const results = pares.map((p) => p.result);
  const noAplican = typeof res.no_aplican === "number" ? res.no_aplican : Array.isArray(res.no_aplican) ? res.no_aplican.length : 0;
  const summary = resumenDe(results, noAplican);

  const hechos = aplanarHechos(e.hechos);
  const dato = (clave: string) => hechos.find((h) => h.clave === clave)?.valor || undefined;
  const partes = e.carpeta.split(/\s+-\s+/).map((p) => p.trim());
  const tramite = dato("tramite") ?? partes.find((p) => /^[A-Z]{2,5}-/.test(p))?.split("-")[0];
  const uso = dato("proyecto.uso_propuesto");
  const paginas = (e.extraccion as { paginas?: unknown } | undefined)?.paginas;
  const hojas = hojasDe(paginas);

  const evaluadas = summary.passed + summary.failed + summary.warnings + summary.manualReview;
  // Agrupadas: reglas de otras zonas que siguen en revisión (con el dictamen, las que no se decidieron) o que solo tienen la
  // decisión de respaldo del motor (información requerida: falta la CEUS o la unidad territorial).
  const agrupadasEnRevision = results.filter((r) => r.group === GRUPO_ZONA && r.status === "MANUAL_REVIEW").length;
  const agrupadasPorMotor = results.filter((r) => r.group === GRUPO_ZONA && r.status !== "MANUAL_REVIEW" && r.status !== "NOT_APPLICABLE" && r.dictamen?.origen === "motor");
  const agrupadas = agrupadasEnRevision + agrupadasPorMotor.length;
  const porMotor = results.filter((r) => r.dictamen?.origen === "motor").length;
  const hayDecisiones = Boolean(dictamen) || porMotor > 0;
  const zona = res.agrupadas?.zona_por_confirmar;
  // Decididas: las que fijan el estado. Las que el motor ya había decidido de otra forma no cuentan (prevalece el motor).
  const aplicadas = results.filter((r) => esDecisionDeIa(r.dictamen) && r.dictamen.reserva?.motivo !== "motor");
  const prevaleceMotor = results.filter((r) => r.dictamen?.reserva?.motivo === "motor").length;
  // Solo las que de verdad quedaron como observación: un CUMPLE o NO_CUMPLE que traiga el estado (regla mixta, hallazgo) no se resta de las observaciones.
  const informacionRequerida = aplicadas.filter((r) => r.dictamen?.estado === "INFORMACION_REQUERIDA" && r.status === "WARNING").length;
  // Para el conteo, también la información requerida de la decisión de respaldo (sin las agrupadas, que van en su línea).
  const informacionRequeridaTotal = results.filter((r) => r.dictamen?.estado === "INFORMACION_REQUERIDA" && r.status === "WARNING" && r.dictamen.reserva?.motivo !== "motor" && r.group !== GRUPO_ZONA).length;
  const observacionesAgrupadas = agrupadasPorMotor.filter((r) => r.status === "WARNING").length;
  const conSupuesto = results.filter((r) => r.conSupuesto).length;
  const vigentes = vigentesDe(res);
  const zonaTrabajo = zonaTrabajoDe(res);
  const dictamenInfo: DictamenInfo | null = dictamen
    ? {
        fecha: dictamen.fecha ?? null,
        revisor: dictamen.revisor ?? null,
        conclusion: dictamen.conclusion?.trim() || null,
        supuestos: (dictamen.supuestos ?? []).map(supuestoDe),
        decididas: aplicadas.length,
        sinDecision: results.filter((r) => (!r.dictamen || r.dictamen.reserva?.motivo === "motor") && r.status === "MANUAL_REVIEW").length,
        ...(porMotor ? { respaldoMotor: porMotor } : {}),
        noAplica: aplicadas.filter((r) => r.dictamen?.decision === "NO_APLICA").length,
        ...(prevaleceMotor ? { prevaleceMotor } : {}),
        ...(informacionRequerida ? { informacionRequerida } : {}),
        ...(dictamen.regiones_discrepantes?.length
          ? { regionesDiscrepantes: dictamen.regiones_discrepantes.map((x) => ({ referencia: (x.region_id || x.dato) as string, detalle: x.detalle.trim() })) }
          : {}),
        ...(vigentes ? { vigentes } : {}),
        ...(dictamen.objeciones?.length ? { objeciones: dictamen.objeciones.map((o) => ({ reglaId: o.regla_id, motivo: o.motivo.trim(), cita: o.cita?.trim() || null })) } : {}),
        // Modelo y costo que dejan la vía API y DeepSeek en el propio dictamen; la de Claude Code los completa traducir.ts.
        ...(typeof dictamen.modelo === "string" && dictamen.modelo ? { modelo: dictamen.modelo } : {}),
        ...(typeof dictamen.costo_usd === "number" ? { costoUsd: dictamen.costo_usd } : {}),
      }
    : null;
  const project: Project = {
    id,
    name: nombreDeCarpeta(e.carpeta) || e.carpeta,
    propertyId: "",
    finca: dato("lote.finca") ?? dato("plano.finca") ?? "",
    address: "",
    corregimiento: dato("lote.corregimiento") ?? partes[0] ?? "",
    projectType: [tramite, uso].filter(Boolean).join(" · "),
    // El propietario y el profesional no se exponen: no son necesarios para el informe preliminar.
    applicant: "",
    zoningCode: res.codigo_zona ?? "",
    // Un resultado automático nunca cierra la revisión: con o sin NO_CUMPLE / REQUIERE_REVISION, lo decide una
    // persona (principio 3). «Revisión cerrada» (COMPLETED) habilitaría emitir la versión del profesional.
    status: "REVIEW_REQUIRED",
    precheckId,
    updatedAt: e.fecha,
    complianceIndex: evaluadas ? Math.round((summary.passed / evaluadas) * 100) : 0,
    origen: "expediente",
    ...(tramite ? { tramite } : {}),
    expediente: {
      documento: res.documento ?? null,
      paginas: Array.isArray(paginas) ? paginas.length : null,
      normaAplicable: res.norma_aplicable ?? null,
      fechaPresentacion: res.fecha_presentacion ?? null,
      umbral: res.umbral ?? null,
      noAplican,
      avisos: (res.avisos ?? []).map(textoDeAviso),
      // Con el dictamen, solo las agrupadas que siguen sin decidir; si todas quedaron NO_APLICA, ya no hay línea.
      zonaPorConfirmar: zona && (!dictamen || agrupadas > 0) ? { total: dictamen ? agrupadas : zona.total, motivo: zonaTrabajo?.falta ? `falta ${zonaTrabajo.falta}` : (zona.motivo ?? "") } : null,
      // Con dictamen, INFORMACION_REQUERIDA se cuenta aparte de las observaciones (falta un documento, no falla el plano).
      // Con decisiones (del dictamen o de respaldo del motor), un NO_CUMPLE con supuesto se cuenta aparte: está por confirmar.
      conteo: hayDecisiones
        ? {
            noCumple: summary.failed - conSupuesto,
            observaciones: summary.warnings - informacionRequeridaTotal - observacionesAgrupadas,
            revisar: summary.manualReview - agrupadasEnRevision,
            agrupadas,
            cumple: summary.passed,
            ...(informacionRequeridaTotal ? { informacionRequerida: informacionRequeridaTotal } : {}),
            ...(conSupuesto ? { conSupuesto } : {}),
          }
        : { noCumple: summary.failed, revisar: summary.warnings + summary.manualReview - agrupadas, agrupadas, cumple: summary.passed },
      dictamen: dictamenInfo,
      ...(zonaTrabajo ? { zonaTrabajo } : {}),
      ...(res.supuestos ? { supuestos: supuestosDe(res) } : {}),
      ...(vigentes ? { vigentes } : {}),
      lote: hechos.filter((h) => h.clave.startsWith("lote.") || h.clave.startsWith("plano.")),
      proyecto: hechos.filter((h) => h.clave.startsWith("proyecto.")),
      otros: hechos.filter((h) => !/^(lote|plano|proyecto|expediente|registro_publico)\./.test(h.clave) && h.clave !== "tramite"),
      ...(hojas.length ? { hojas } : {}),
    },
  };

  const precheck: PreCheck = {
    id: precheckId,
    projectId: id,
    status: "completed",
    startedAt: e.fecha,
    finishedAt: e.fecha,
    engineVersion: "agente revisor-planos",
    results,
    summary,
    rules: pares.map((p) => p.rule),
    informeRevisor: e.informe ?? null,
    ...(dictamen ? { fuenteResultado: FUENTE_DICTAMEN } : porMotor ? { fuenteResultado: FUENTE_RESPALDO } : {}),
  };
  return { project, precheck, ...(avisos.length ? { avisos } : {}) };
}
