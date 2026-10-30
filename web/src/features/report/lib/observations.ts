import type { RuleResult } from "@/hooks/use-rule-results";
import { formatMeasure } from "@/lib/format";
import { isOfficialResult } from "@/lib/official";
import type { ComplianceResult, ComplianceRule } from "@/types";

/** Observación redactada al estilo del informe PreCheck: qué, dónde, por qué (cita literal) y qué hacer. */
export interface Observation {
  ruleId: string;
  title: string;
  status: "FAIL" | "WARNING";
  blocking: boolean;
  official: boolean;
  /** Hallazgo que propone la IA fuera del catálogo: pendiente de validar por un revisor. */
  fueraDeCatalogo?: boolean;
  que: string;
  donde: string;
  porque: { norma: string; article: string; sourcePage?: number; quote: string | null };
  queHacer: string;
  /** true si «queHacer» es el «Qué subsanar» del dictamen del arquitecto revisor. */
  subsanar?: boolean;
  /** true si falta la indicación al profesional (la escribe el Revisor DOYC). */
  indicationPending: boolean;
  /** Nota cuando la regla depende de una zona tomada sin CEUS (AC-10). */
  zoneNote?: string;
}

const LIMIT_WORD: Partial<Record<ComplianceRule["operator"], string>> = { ">=": "como mínimo", "<=": "como máximo", "=": "" };

const defined = (n: number | null | undefined): n is number => n !== null && n !== undefined;

function describeWhat(rule: ComplianceRule, r: ComplianceResult): string {
  const d = r.dictamen;
  if (d) {
    const valores = [d.valorLeido ? `valor leído: ${d.valorLeido}` : null, d.limite ? `límite: ${d.limite}` : null].filter(Boolean).join("; ");
    return `${rule.title}${valores ? ` (${valores})` : ""}. ${d.justificacion}`;
  }
  const unit = r.unit ?? rule.unit ?? undefined;
  const required = defined(r.requiredValue) ? r.requiredValue : defined(rule.value) ? rule.value : undefined;
  const word = LIMIT_WORD[rule.operator];
  const limit = required !== undefined && word !== undefined ? `la norma exige ${word ? `${word} ` : ""}${formatMeasure(required, unit)}` : null;
  if (defined(r.detectedValue) && limit) return `${rule.title}: el valor declarado es ${formatMeasure(r.detectedValue, unit)}; ${limit}.`;
  if (!defined(r.detectedValue) && limit) return `${rule.title}: falta el dato declarado para verificarla; ${limit}.`;
  const detail = r.explanation && r.explanation !== rule.title ? ` ${r.explanation}` : "";
  return `${rule.title}.${detail || ` Requisito citado: ${rule.regulation.quote || rule.description}`}`;
}

function describeWhere(r: ComplianceResult): string {
  const evidencia = r.dictamen?.evidencia ?? [];
  if (evidencia.length) return evidencia.map((e) => [e.pagina !== null ? `p. ${e.pagina}` : null, e.detalle || null].filter(Boolean).join(": ")).join("; ") + ".";
  const geometry = r.geometry ?? [];
  if (geometry.length === 0) return "Ubicación no consta en los datos declarados.";
  const bySheet = new Map<string, string[]>();
  for (const g of geometry) bySheet.set(g.sheetId, [...(bySheet.get(g.sheetId) ?? []), ...(g.label ? [g.label] : [])]);
  return [...bySheet].map(([sheet, labels]) => `Hoja ${sheet}${labels.length ? `: ${labels.join("; ")}` : ""}`).join(". ") + ".";
}

export function composeObservation(item: RuleResult, zoneWithoutCeus: string | null): Observation {
  const { rule, result } = item;
  const indicationPending = !result.recommendedAction;
  return {
    ruleId: rule.id,
    title: rule.title,
    status: result.status === "FAIL" ? "FAIL" : "WARNING",
    blocking: result.status === "FAIL",
    official: isOfficialResult(item),
    ...(result.fueraDeCatalogo ? { fueraDeCatalogo: true } : {}),
    que: describeWhat(rule, result),
    donde: describeWhere(result),
    porque: {
      norma: rule.regulation.norma,
      article: rule.regulation.article,
      sourcePage: rule.regulation.sourcePage,
      quote: rule.demo || !rule.regulation.quote ? null : rule.regulation.quote,
    },
    queHacer: result.recommendedAction ?? "Indicación al profesional pendiente: la redacta el Revisor DOYC antes de emitir.",
    indicationPending,
    ...(result.dictamen?.subsanar ? { subsanar: true } : {}),
    zoneNote:
      rule.zoning && zoneWithoutCeus
        ? `La zona ${zoneWithoutCeus} se tomó del Documento Gráfico sin certificación de uso de suelo (CEUS).`
        : undefined,
  };
}

/** Bloqueantes primero, después las no bloqueantes (spec informe-precheck, AC-08). */
export function composeObservations(items: RuleResult[], zoneWithoutCeus: string | null): Observation[] {
  return items
    .filter(({ result }) => result.status === "FAIL" || result.status === "WARNING")
    .map((item) => composeObservation(item, zoneWithoutCeus))
    .sort((a, b) => Number(b.blocking) - Number(a.blocking));
}
