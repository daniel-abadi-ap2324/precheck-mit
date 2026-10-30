import type { PlanFact } from "@/types";
import { UMBRAL_COMPROBADO } from "./barrera-precheck";

/**
 * Documentos complementarios del expediente (memoria descriptiva, cuadro de áreas, cartas, certificaciones): se leen
 * igual que un plano y sus datos completan los del plano cuando el plano no los trae o los trae dudosos. Lo que una
 * persona confirmó o corrigió en el plano no se toca, y un dato comprobado del plano gana siempre.
 */
export interface DocumentoLeido {
  nombre: string;
  hechos: PlanFact[];
}

const usable = (h: PlanFact | undefined): h is PlanFact => Boolean(h && h.valor !== null && h.valor !== "");
const firme = (h: PlanFact | undefined) => Boolean(usable(h) && (h.corregido || h.confirmado || (h.estado === "ok" && h.confianza >= UMBRAL_COMPROBADO)));
/** Mejor que otro: revisado por la persona, o leído claro con más confianza. */
const peso = (h: PlanFact) => (h.corregido || h.confirmado ? 2 : h.estado === "ok" ? 1 + h.confianza / 10 : h.confianza / 10);

export function completarConDocumentos(hechos: PlanFact[], documentos: DocumentoLeido[]): PlanFact[] {
  if (!documentos.length) return hechos;
  const salida = [...hechos];
  const claves = new Set(documentos.flatMap((d) => d.hechos.map((h) => h.hecho)));
  for (const clave of claves) {
    const i = salida.findIndex((h) => h.hecho === clave);
    const delPlano = i >= 0 ? salida[i] : undefined;
    if (firme(delPlano)) continue;
    const candidatos = documentos.flatMap((d) => d.hechos.filter((h) => h.hecho === clave && usable(h)).map((h) => ({ h, nombre: d.nombre })));
    const mejor = candidatos.filter((c) => c.h.estado === "ok" || c.h.corregido || c.h.confirmado).sort((a, b) => peso(b.h) - peso(a.h))[0];
    if (!mejor) continue;
    if (delPlano && usable(delPlano) && peso(delPlano) >= peso(mejor.h)) continue;
    const nota = `Tomado del documento complementario «${mejor.nombre}»${delPlano && usable(delPlano) ? ` (el plano decía ${delPlano.valor})` : ""}.`;
    const nuevo: PlanFact = { ...mejor.h, documento: mejor.nombre, nota: mejor.h.nota ? `${nota} ${mejor.h.nota}` : nota };
    if (i >= 0) salida[i] = nuevo;
    else salida.push(nuevo);
  }
  return salida;
}
