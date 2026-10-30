import type { ComplianceResult } from "@/types";
import { paginasDeEvidencia } from "@/lib/dictamen";

export { DatosLeidos } from "./datos-leidos";
export { ConclusionDictamen, DecisionDictamenDetalle } from "./dictamen";
export { QueSeSupuso } from "./supuestos";
export { EnlaceDocumento, MiniaturasExpediente, VisorPaginasExpediente } from "./paginas-expediente";

/** Primera página citada en la fuente de un resultado («…plano.pdf, p. 2 (vision…)» → 2), o null. */
export function paginaCitada(fuente: string | undefined | null): number | null {
  const m = fuente ? /(?:^|[\s,(])p\. ?(\d{1,3})\b/.exec(fuente) : null;
  return m ? Number(m[1]) : null;
}

/** Página que se abre al elegir una regla: la primera de la evidencia del dictamen o, si no hay, la de la fuente. */
export function paginaDeResultado(result: Pick<ComplianceResult, "dictamen" | "source" | "marcas"> | undefined | null): number | null {
  if (!result) return null;
  // Con marcas, se abre la página de la primera (lo que la IA ubicó); si no, la primera de la evidencia o de la fuente.
  return result.marcas?.[0]?.pagina ?? paginasDeEvidencia(result)[0] ?? paginaCitada(result.source);
}
