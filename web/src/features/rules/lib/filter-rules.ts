import type { ComplianceRule, RuleCategory, RuleState } from "@/types";
import { categoryLabels } from "@/lib/status";

export interface RuleFilters {
  q: string;
  category: RuleCategory | "all";
  /** Código de zona, «general» (reglas sin zona) o «all». */
  zoning: string;
  state: RuleState | "all";
  origin: "all" | "real" | "demo";
  /** Código de norma (ver normaKey) o «all». */
  norma: string;
}

export const DEFAULT_RULE_FILTERS: RuleFilters = { q: "", category: "all", zoning: "all", state: "all", origin: "all", norma: "all" };

/** Clave de la norma de una regla para el filtro: el código del catálogo, o «demo» / «sin-norma». */
export const normaKey = (r: ComplianceRule): string => r.normaCode ?? (r.demo ? "demo" : "sin-norma");
const normaLabel = (r: ComplianceRule): string => r.normaLabel ?? (r.demo ? "Demostración" : "Sin norma asignada");

export interface NormaOption {
  value: string;
  label: string;
  count: number;
}

/** Primero las normas generales (Acuerdo 110, PLOT, San Francisco); después las zonas exceptuadas por nombre. */
const PRIMERAS = ["A110-2025", "PLOT-A61-2021", "PLOT-A61-2021+A270-2025"];

/** Normas presentes en el catálogo, con cuántas reglas tiene cada una. */
export function normaOptions(rules: ComplianceRule[]): NormaOption[] {
  const map = new Map<string, NormaOption>();
  for (const r of rules) {
    const value = normaKey(r);
    const o = map.get(value) ?? { value, label: normaLabel(r), count: 0 };
    o.count += 1;
    map.set(value, o);
  }
  const rank = (v: string) => (PRIMERAS.includes(v) ? PRIMERAS.indexOf(v) : PRIMERAS.length);
  return [...map.values()].sort((a, b) => rank(a.value) - rank(b.value) || a.label.localeCompare(b.label, "es"));
}

function matchesQuery(rule: ComplianceRule, q: string): boolean {
  if (!q) return true;
  const hay = [rule.id, rule.title, rule.description, rule.zoning ?? "", categoryLabels[rule.category], rule.regulation.norma, rule.regulation.article, rule.regulation.quote]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => hay.includes(term));
}

/** Filtro puro de la biblioteca de reglas (búsqueda + norma + categoría + zona + estado + origen). */
export function filterRules(rules: ComplianceRule[], f: RuleFilters): ComplianceRule[] {
  return rules.filter((r) => {
    if (f.norma !== "all" && normaKey(r) !== f.norma) return false;
    if (f.category !== "all" && r.category !== f.category) return false;
    if (f.zoning === "general" && r.zoning) return false;
    if (f.zoning !== "all" && f.zoning !== "general" && r.zoning !== f.zoning) return false;
    if (f.state !== "all" && r.state !== f.state) return false;
    if (f.origin === "real" && r.demo) return false;
    if (f.origin === "demo" && !r.demo) return false;
    return matchesQuery(r, f.q.trim());
  });
}

export function zoningOptions(rules: ComplianceRule[]): string[] {
  return [...new Set(rules.flatMap((r) => (r.zoning ? [r.zoning] : [])))].sort();
}
