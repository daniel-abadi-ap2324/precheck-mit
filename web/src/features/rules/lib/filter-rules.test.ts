import { describe, expect, it } from "vitest";
import type { ComplianceRule } from "@/types";
import { DEFAULT_RULE_FILTERS, filterRules, zoningOptions } from "./filter-rules";
import { ruleSource } from "./rule-meta";

const base = { version: 1, description: "", operator: "<=" as const, severity: "bloqueante" as const, state: "borrador" as const };
const rules: ComplianceRule[] = [
  { ...base, id: "PLOT-RM-2-RETIROS", title: "RM-2: retiros", category: "setbacks", zoning: "RM-2", regulation: { id: "x", norma: "Anexo 4 PLOT (Acuerdo N°61 de 30-03-2021)", article: "Ficha RM-2", quote: "Lo establecido ó 5m" } },
  { ...base, id: "A110-CERCA", title: "Cerca temporal", category: "other", regulation: { id: "y", norma: "Acuerdo N°110 de 22-04-2025", article: "123.a", quote: "2.40 m" } },
  { ...base, id: "DEMO-EST", title: "Estacionamientos", category: "parking", zoning: "RM-2", demo: true, state: "aprobada", regulation: { id: "z", norma: "Demo", article: "—", quote: "" } },
];
const ids = (r: ComplianceRule[]) => r.map((x) => x.id);

describe("filterRules", () => {
  it("sin filtros devuelve todo", () => expect(filterRules(rules, DEFAULT_RULE_FILTERS)).toHaveLength(3));
  it("busca por texto en id, título y cita", () => {
    expect(ids(filterRules(rules, { ...DEFAULT_RULE_FILTERS, q: "5m" }))).toEqual(["PLOT-RM-2-RETIROS"]);
    expect(ids(filterRules(rules, { ...DEFAULT_RULE_FILTERS, q: "cerca temporal" }))).toEqual(["A110-CERCA"]);
  });
  it("filtra por zona, general, estado y origen", () => {
    expect(ids(filterRules(rules, { ...DEFAULT_RULE_FILTERS, zoning: "RM-2" }))).toEqual(["PLOT-RM-2-RETIROS", "DEMO-EST"]);
    expect(ids(filterRules(rules, { ...DEFAULT_RULE_FILTERS, zoning: "general" }))).toEqual(["A110-CERCA"]);
    expect(ids(filterRules(rules, { ...DEFAULT_RULE_FILTERS, state: "aprobada" }))).toEqual(["DEMO-EST"]);
    expect(ids(filterRules(rules, { ...DEFAULT_RULE_FILTERS, origin: "real" }))).toEqual(["PLOT-RM-2-RETIROS", "A110-CERCA"]);
    expect(ids(filterRules(rules, { ...DEFAULT_RULE_FILTERS, category: "parking" }))).toEqual(["DEMO-EST"]);
  });
  it("lista zonas y compone la fuente", () => {
    expect(zoningOptions(rules)).toEqual(["RM-2"]);
    expect(ruleSource(rules[0])).toBe("Anexo 4 PLOT · Ficha RM-2");
    expect(ruleSource(rules[1])).toBe("Acuerdo 110 · Art. 123.a");
    expect(ruleSource(rules[2])).toBe("Demostración");
  });
});
