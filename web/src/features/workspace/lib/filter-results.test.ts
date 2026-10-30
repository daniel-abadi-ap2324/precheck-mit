import { describe, expect, it } from "vitest";
import type { RuleResult } from "@/hooks/use-rule-results";
import type { ComplianceStatus, RuleCategory } from "@/types";
import { countByStatus, defaultRuleId, filterResults, groupByCategory, stepSelection, visibleRuleIds } from "./filter-results";

const make = (id: string, title: string, category: RuleCategory, status: ComplianceStatus): RuleResult => ({
  rule: { id, version: 1, title, category, description: "", operator: ">=", regulation: { id, norma: "N", article: "A", quote: "" }, state: "borrador", severity: "bloqueante" },
  result: { ruleId: id, status, official: false },
});

const items = [
  make("A-LOTE", "Área mínima de lote", "site", "PASS"),
  make("B-RETIRO", "Retiro frontal", "setbacks", "FAIL"),
  make("C-RAMPA", "Rampa vehicular", "parking", "FAIL"),
  make("D-ARBOL", "Árboles por lote", "landscaping", "WARNING"),
  make("E-OCUP", "Ocupación máxima", "coverage", "MANUAL_REVIEW"),
];

describe("filterResults", () => {
  it("filtra por estado", () => {
    expect(filterResults(items, { status: "FAIL", search: "" }).map((i) => i.rule.id)).toEqual(["B-RETIRO", "C-RAMPA"]);
  });
  it("busca por título sin tildes ni mayúsculas", () => {
    expect(filterResults(items, { status: "ALL", search: "arbol" }).map((i) => i.rule.id)).toEqual(["D-ARBOL"]);
  });
  it("busca por ID de regla", () => {
    expect(filterResults(items, { status: "ALL", search: "c-ram" }).map((i) => i.rule.id)).toEqual(["C-RAMPA"]);
  });
  it("combina estado y búsqueda", () => {
    expect(filterResults(items, { status: "PASS", search: "rampa" })).toHaveLength(0);
  });
});

describe("groupByCategory", () => {
  it("agrupa en el orden de categorías y omite las vacías", () => {
    const groups = groupByCategory(items);
    expect(groups.map((g) => g.label)).toEqual(["Lote", "Retiros", "Ocupación", "Estacionamientos", "Áreas verdes"]);
    expect(groups.every((g) => g.items.length === 1)).toBe(true);
  });
});

describe("contadores y selección", () => {
  it("cuenta por estado", () => {
    expect(countByStatus(items)).toEqual({ PASS: 1, FAIL: 2, WARNING: 1, MANUAL_REVIEW: 1, NOT_APPLICABLE: 0 });
  });
  it("selecciona por defecto la primera regla que no cumple", () => {
    expect(defaultRuleId(items)).toBe("B-RETIRO");
    expect(defaultRuleId([items[0]])).toBe("A-LOTE");
    expect(defaultRuleId([])).toBeNull();
  });
  it("mueve la selección solo entre filas visibles", () => {
    const ids = visibleRuleIds(groupByCategory(items), ["setbacks"]);
    expect(ids).not.toContain("B-RETIRO");
    expect(stepSelection(ids, "A-LOTE", 1)).toBe("E-OCUP");
    expect(stepSelection(ids, "A-LOTE", -1)).toBe("A-LOTE");
    expect(stepSelection(ids, null, -1)).toBe("D-ARBOL");
  });
});
