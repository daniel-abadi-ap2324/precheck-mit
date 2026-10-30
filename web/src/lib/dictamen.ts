import type { ComplianceResult, ComplianceStatus, DecisionDictamen, DictamenInfo, ExpedienteInfo, ReglasVigentesInfo, SupuestoDictamen } from "@/types";

/**
 * Dictamen del arquitecto revisor (dictamen.json del agente revisor-planos). Decide las reglas que el motor dejó en
 * «Requiere revisión». Sigue siendo preliminar y no oficial: las reglas están en borrador y el visto bueno final es
 * del Revisor DOYC (Acuerdo 110, Art. 3).
 */
export const FUENTE_DICTAMEN = "Dictamen del arquitecto revisor (agente revisor-planos)";

/** Sin dictamen de la IA: los estados de lo que el motor dejó en revisión son su decisión de respaldo (ADR-0016). */
export const FUENTE_RESPALDO = "Motor de reglas, con su decisión de respaldo en lo que no decidió solo (sin revisión con IA)";

/** Decisión del dictamen → estado de la web («Observación» es WARNING). */
export const ESTADO_DE_DECISION: Record<DecisionDictamen, ComplianceStatus> = {
  CUMPLE: "PASS",
  NO_CUMPLE: "FAIL",
  OBSERVACION: "WARNING",
  NO_APLICA: "NOT_APPLICABLE",
};

/** «Zona RMH2 asumida: declarada en el plano; sin CEUS», o «Etiqueta: valor — fundamento». */
export function textoSupuesto(s: SupuestoDictamen): string {
  if (s.hecho === "lote.codigo_zona") return `Zona ${s.valor} asumida${s.fundamento ? `: ${s.fundamento}` : ""}`;
  return `${s.etiqueta}: ${s.valor}${s.fundamento ? ` (${s.fundamento})` : ""}`;
}

/**
 * Sección «Reglas vigentes de esta corrida» (resumen del expediente e informe): con qué norma y zona evaluó el motor,
 * qué fijó la IA en el paso 1 con su fuente, qué rechazó el motor y qué permisos especiales cambian reglas.
 */
export function lineasVigentes(v: ReglasVigentesInfo): { resumen: string; detalle: string[] } {
  const extras = [v.exceptuadas ? `${v.exceptuadas} exceptuada${v.exceptuadas === 1 ? "" : "s"} por permiso` : null, v.sinDeterminar ? `${v.sinDeterminar} sin poder determinar si aplican` : null].filter(Boolean);
  const zona = `zona ${v.zona ?? "sin determinar"}${v.procedenciaZona ? ` (${v.procedenciaZona})` : ""}`;
  // ADR-0016: «N reglas vigentes: G generales del Acuerdo 110 y Z de zonificación de la zona de trabajo».
  const conDesglose = typeof v.generales === "number" && typeof v.zonificacion === "number";
  const n = conDesglose ? (v.generales as number) + (v.zonificacion as number) : v.total;
  const desglose = conDesglose ? `: ${v.generales} generales del Acuerdo 110 y ${v.zonificacion} de zonificación` : "";
  const resumen = conDesglose
    ? `Norma ${v.norma ?? "sin determinar"}, ${zona}. ${n} regla${n === 1 ? "" : "s"} vigente${n === 1 ? "" : "s"}${desglose}${extras.length ? ` (${extras.join("; ")})` : ""}.`
    : `Norma ${v.norma ?? "sin determinar"}, ${zona}: ${v.total} regla${v.total === 1 ? "" : "s"} vigente${v.total === 1 ? "" : "s"}${extras.length ? ` (${extras.join("; ")})` : ""}.`;
  const accion = { exceptua: "exceptúa", condiciona: "condiciona" } as const;
  const detalle = [
    v.alcanceIa.presente
      ? `Alcance fijado por la IA con su fuente: ${v.alcanceIa.aplicado.length ? v.alcanceIa.aplicado.join(", ") : "nada que cambiar"}.`
      : "La IA no fijó el alcance: se evaluó con la norma y la zona indicadas.",
    ...v.alcanceIa.errores.map((e) => `Rechazado por el motor (sin fuente comprobable): ${e}`),
    ...v.permisos.map((p) => {
      const donde = [p.documento, p.pagina ? `p. ${p.pagina}` : null].filter(Boolean).join(", ");
      const efectos = p.efecto.map((e) => `${accion[e.accion]} ${e.reglaId}`).join("; ");
      return `Permiso ${p.id}${p.titulo ? ` — ${p.titulo}` : ""} (${p.tipo}): «${p.cita}»${donde ? ` (${donde})` : ""}${efectos ? `. ${efectos}` : ""}.`;
    }),
    ...(v.propuestas ? [`${v.propuestas} propuesta${v.propuestas === 1 ? "" : "s"} de regla para el equipo (permisos que el catálogo no recoge).`] : []),
  ];
  return { resumen, detalle };
}

/** «ML2-RETIRO: el retiro se mide a la línea de propiedad («cita»).» */
export const textoObjecion = (o: { reglaId: string; motivo: string; cita: string | null }) => `${o.reglaId}: ${o.motivo}${o.cita ? ` («${o.cita}»)` : ""}`;

const PROVEEDOR_IA: Record<string, string> = { "claude-code": "Claude Code en el equipo", "anthropic-api": "API de Anthropic", "deepseek-api": "API de DeepSeek" };

/** «Revisó la API de DeepSeek (deepseek-flash), costo 0.62 USD.» Sin proveedor ni modelo, null. */
export function textoRevisionIa(d: Pick<DictamenInfo, "proveedor" | "modelo" | "costoUsd">): string | null {
  const quien = d.proveedor ? (PROVEEDOR_IA[d.proveedor] ?? d.proveedor) : null;
  if (!quien && !d.modelo) return null;
  const con = quien && d.modelo ? `${quien} (${d.modelo})` : (quien ?? d.modelo);
  return `Revisó ${con}${typeof d.costoUsd === "number" ? `, costo ${d.costoUsd.toFixed(2)} USD` : ""}.`;
}

/** Lo que la web no aplicó del dictamen y lo que quedó pendiente de un documento, para el pie del dictamen. */
export function textoReservasDictamen(d: Pick<DictamenInfo, "prevaleceMotor" | "informacionRequerida" | "sinDecision" | "respaldoMotor">): string {
  const partes = [
    d.respaldoMotor ? `${d.respaldoMotor} ${d.respaldoMotor === 1 ? "regla que la IA no decidió quedó" : "reglas que la IA no decidió quedaron"} con la decisión de respaldo del motor.` : null,
    d.prevaleceMotor ? `${d.prevaleceMotor} ${d.prevaleceMotor === 1 ? "decisión no se aplicó" : "decisiones no se aplicaron"} porque el motor ya había decidido esa regla con los datos (prevalece el motor).` : null,
    d.informacionRequerida ? `${d.informacionRequerida} ${d.informacionRequerida === 1 ? "regla depende" : "reglas dependen"} de un documento que falta en el expediente (información requerida).` : null,
    d.sinDecision ? `${d.sinDecision} ${d.sinDecision === 1 ? "regla quedó" : "reglas quedaron"} sin decisión, con el estado del motor.` : null,
  ].filter(Boolean);
  return partes.join(" ");
}

/** Páginas distintas que cita la evidencia de un resultado, en orden. */
export function paginasDeEvidencia(result: Pick<ComplianceResult, "dictamen">): number[] {
  const paginas = (result.dictamen?.evidencia ?? []).map((e) => e.pagina).filter((p): p is number => typeof p === "number");
  return [...new Set(paginas)];
}

/** Ancla de una página en la pestaña Planos de un expediente. */
export const anclaPagina = (n: number) => `pagina-${n}`;
export const enlacePaginaPlanos = (projectId: string, n: number) => `/projects/${projectId}/plans#${anclaPagina(n)}`;

/** «12 (descartadas por el motor; no se listan)» y, con dictamen, las que el arquitecto revisor dio por no aplica. */
export function textoNoAplican(info: ExpedienteInfo): string {
  const motor = `${info.noAplican} descartadas por el motor (no se listan)`;
  return info.dictamen?.noAplica ? `${motor} + ${info.dictamen.noAplica} que el arquitecto revisor dio por «No aplica»` : `${info.noAplican} (descartadas por el motor; no se listan)`;
}
