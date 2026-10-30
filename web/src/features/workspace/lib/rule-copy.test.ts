import { describe, expect, it } from "vitest";
import type { RuleResult } from "@/hooks/use-rule-results";
import { measurementView, recommendedAction, requiredText } from "./rule-copy";

const base: RuleResult = {
  rule: { id: "R", version: 1, title: "Rampa", category: "parking", description: "", operator: ">=", value: 6, unit: "m", regulation: { id: "R", norma: "N", article: "A", quote: "6.00m libres" }, state: "borrador", severity: "bloqueante" },
  result: { ruleId: "R", status: "FAIL", official: false, detectedValue: 5.5, requiredValue: 6, unit: "m", difference: -0.5 },
};

describe("rule-copy", () => {
  it("muestra lo requerido con operador", () => {
    expect(requiredText(base)).toBe("≥ 6 m");
  });
  it("remite a la cita en reglas de criterio sin valor", () => {
    const item: RuleResult = { ...base, rule: { ...base.rule, operator: "criterio", value: undefined }, result: { ...base.result, requiredValue: undefined } };
    expect(requiredText(item)).toBe("Según la norma: «6.00m libres»");
  });
  it("describe la diferencia con signo y texto", () => {
    const v = measurementView(base);
    expect(v.difference).toBe("−0.5 m");
    expect(v.differenceNote).toBe("por debajo del mínimo");
    expect(v.differenceTone).toBe("fail");
  });
  it("usa una acción por estado cuando el resultado no trae una", () => {
    expect(recommendedAction(base)).toMatch(/Corrija el plano/);
  });
});
