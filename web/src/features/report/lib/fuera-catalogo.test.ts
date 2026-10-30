import { describe, expect, it } from "vitest";
import type { RuleResult } from "@/hooks/use-rule-results";
import { toResultRow } from "@/features/results/lib/results-model";
import { composeObservation } from "./observations";

const item = (fueraDeCatalogo?: boolean): RuleResult =>
  ({
    rule: { id: "HALLAZGO-3", title: "Acabados generales", version: 1, category: "documentation", operator: "==", regulation: { norma: "Acuerdo 110", article: "Anexo IV, 8", quote: "Acabados" } },
    result: { ruleId: "HALLAZGO-3", status: "FAIL", official: false, explanation: "Falta el cuadro", ...(fueraDeCatalogo ? { fueraDeCatalogo } : {}) },
  }) as unknown as RuleResult;

describe("hallazgo fuera del catálogo", () => {
  it("pasa de la regla a la fila de Resultados y a la observación del Informe", () => {
    expect(toResultRow(item(true)).fueraDeCatalogo).toBe(true);
    expect(composeObservation(item(true), null).fueraDeCatalogo).toBe(true);
  });

  it("una regla del catálogo no lleva la marca", () => {
    expect(toResultRow(item()).fueraDeCatalogo).toBeUndefined();
    expect(composeObservation(item(), null).fueraDeCatalogo).toBeUndefined();
  });
});
