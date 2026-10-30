import type { ComplianceResult, ComplianceRule, NormaZona, Parcel, PreCheckSummary } from "@/types";

/**
 * Los resultados de demostración se calcularon para un lote concreto (PAR-081400, ficha RM-2). En otro lote,
 * un resultado de una regla de zona solo vale si el lote tiene esa misma ficha; si no, pasa a revisión, no
 * oficial, con el motivo (CLAUDE.md, principio 2: ante la duda, REQUIERE_REVISION).
 */
export function aplicarAlLote(
  resultados: ComplianceResult[],
  reglas: Pick<ComplianceRule, "id" | "zoning">[],
  lote: Pick<Parcel, "id" | "zoningCode"> & { normaZona: NormaZona },
): ComplianceResult[] {
  const zonaDe = new Map(reglas.map((r) => [r.id, r.zoning ?? null]));
  const otroLote = lote.id !== LOTE_DE_LA_DEMOSTRACION;
  return resultados.map((r) => {
    if (otroLote && LOTE_DEPENDIENTES.includes(r.ruleId)) {
      return {
        ...r,
        status: "MANUAL_REVIEW",
        official: false,
        explanation: `Resultado de demostración calculado con los datos del lote ${LOTE_DE_LA_DEMOSTRACION}; este proyecto está en el lote ${lote.id}: requiere revisión.`,
      };
    }
    const zona = zonaDe.get(r.ruleId);
    if (!zona || (lote.normaZona === "ficha" && lote.zoningCode === zona)) return r;
    const delLote = lote.normaZona === "ficha" ? `la zona de este lote es ${lote.zoningCode}: requiere revisión` : "la zona de este lote requiere revisión";
    return {
      ...r,
      status: "MANUAL_REVIEW",
      official: false,
      explanation: `Resultado de demostración calculado para la zona ${zona}; ${delLote}.`,
    };
  });
}

/** Lote para el que se calcularon los resultados de demostración. */
export const LOTE_DE_LA_DEMOSTRACION = "PAR-081400";

/**
 * Reglas sin zona cuyo resultado depende de los datos del lote (finca y área del Registro, frente del lote):
 * en otro lote no se pueden reutilizar.
 */
export const LOTE_DEPENDIENTES = ["A110-AIV-FINCA-COINCIDE", "A110-AIV-AREA-LOTE", "A110-PDC-ACERA-LONGITUD"];

/** Índice preliminar = cumple / evaluadas, con la misma definición que el informe (no cuenta «no aplica»). */
export function indiceDeCumplimiento(resultados: ComplianceResult[]): number | undefined {
  const evaluadas = resultados.filter((r) => r.status !== "NOT_APPLICABLE");
  if (!evaluadas.length) return undefined;
  return Math.round((100 * evaluadas.filter((r) => r.status === "PASS").length) / evaluadas.length);
}

export function resumen(resultados: ComplianceResult[]): PreCheckSummary {
  const n = (s: ComplianceResult["status"]) => resultados.filter((r) => r.status === s).length;
  return {
    checked: resultados.length,
    passed: n("PASS"),
    failed: n("FAIL"),
    warnings: n("WARNING"),
    manualReview: n("MANUAL_REVIEW"),
    notApplicable: n("NOT_APPLICABLE"),
  };
}
