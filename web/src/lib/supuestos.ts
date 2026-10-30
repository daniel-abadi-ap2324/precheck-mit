import { textoDeAviso } from "@/lib/avisos";
import { lineasVigentes } from "@/lib/dictamen";
import type { ExpedienteInfo } from "@/types";

/**
 * Sección «Qué se supuso en esta revisión» (ADR-0016), arriba del resumen y del informe, con o sin dictamen de la IA:
 * con qué zona se evaluó y de dónde salió, qué zonas se descartaron y cuánto cambiarían, qué datos se supusieron, las
 * reglas vigentes, los avisos del motor en lenguaje llano, si la IA no terminó y el conteo final.
 */
export interface QueSeSupuso {
  zona: { texto: string; firme: boolean; accion: string | null } | null;
  descartadas: string[];
  supuestos: { id: string; texto: string; accion: string | null; reglas: number }[];
  vigentes: { resumen: string; detalle: string[] } | null;
  avisos: string[];
  iaFallida: string | null;
  conteo: string | null;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function textoZona(info: ExpedienteInfo): QueSeSupuso["zona"] {
  const z = info.zonaTrabajo;
  if (!z) return null;
  const sup = (info.supuestos ?? []).find((s) => s.tipo === "zona" || s.tipo === "sin_zona");
  const accion = sup?.accion ?? null;
  if (!z.codigo) return { texto: `Sin zona de trabajo. ${z.explicacion}`.trim(), firme: false, accion };
  const norma = z.norma ? ` (${z.norma})` : "";
  if (z.firme) return { texto: `Zona ${z.codigo}${norma}, firme. ${z.explicacion}`.trim(), firme: true, accion: null };
  return { texto: `Zona de trabajo ${z.codigo}${norma}, supuesta${sup ? ` (${sup.id})` : ""}. ${z.explicacion}`.trim(), firme: false, accion };
}

/** «17 no cumple (3 con supuesto, por confirmar), 12 observaciones… y 0 en revisión.» Null sin conteo. */
export function textoConteoFinal(c: ExpedienteInfo["conteo"]): string | null {
  if (!c) return null;
  const partes = [
    plural(c.cumple, "cumple", "cumplen"),
    `${c.noCumple} no ${c.noCumple === 1 ? "cumple" : "cumplen"}`,
    c.conSupuesto ? `${c.conSupuesto} no ${c.conSupuesto === 1 ? "cumple" : "cumplen"} con supuesto (por confirmar)` : null,
    typeof c.observaciones === "number" ? plural(c.observaciones, "observación", "observaciones") : null,
    c.informacionRequerida ? `${c.informacionRequerida} con información requerida` : null,
    c.agrupadas ? `${c.agrupadas} de otras zonas (en una línea)` : null,
  ].filter(Boolean);
  return `Conteo final: ${partes.join(", ")} y ${c.revisar} en revisión.`;
}

export function queSeSupuso(info: ExpedienteInfo): QueSeSupuso | null {
  const zona = textoZona(info);
  const descartadas = (info.zonaTrabajo?.descartadas ?? []).map(
    (d) =>
      `${d.codigo}${d.norma ? ` (${d.norma})` : ""}: ${d.motivo || "descartada"}. ${d.reglasDistintas ? `Con ella cambiarían ${plural(d.reglasDistintas, "regla", "reglas")}.` : "Con ella no cambiaría ninguna regla."}`,
  );
  const supuestos = (info.supuestos ?? []).filter((s) => s.tipo !== "zona" && s.tipo !== "sin_zona").map((s) => ({ id: s.id, texto: s.texto, accion: s.accion, reglas: s.reglas }));
  const v = info.vigentes ?? info.dictamen?.vigentes ?? null;
  const explicacion = info.zonaTrabajo?.explicacion;
  // El aviso de la zona de trabajo repite la explicación de la zona: no se muestra dos veces.
  const avisos = info.avisos.map(textoDeAviso).filter((a) => !(explicacion && a.startsWith(explicacion)));
  const f = info.iaFallida;
  const iaFallida = f
    ? `La revisión con IA no terminó: ${f.error.replace(/\.$/, "")}. El informe se armó con ${f.parcial ? "las decisiones que alcanzó a dar la IA y " : ""}la decisión de respaldo del motor en ${plural(f.decididasPorMotor, "regla", "reglas")}.`
    : null;
  // El conteo final solo cuando hay decisiones de respaldo del motor (resultados con ADR-0016).
  const conteo = info.zonaTrabajo || info.supuestos ? textoConteoFinal(info.conteo) : null;
  if (!zona && !descartadas.length && !supuestos.length && !v && !avisos.length && !iaFallida) return null;
  return { zona, descartadas, supuestos, vigentes: v ? lineasVigentes(v) : null, avisos, iaFallida, conteo };
}
