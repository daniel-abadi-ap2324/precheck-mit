import type { RuleResult } from "@/hooks/use-rule-results";
import type { StatusFilter } from "@/stores/workspace";
import type { ComplianceStatus, RuleCategory } from "@/types";
import { categoryLabels } from "@/lib/status";

export interface ResultFilters {
  status: StatusFilter;
  search: string;
}

export interface CategoryGroup {
  category: RuleCategory;
  label: string;
  items: RuleResult[];
}

export type StatusCounts = Record<ComplianceStatus, number>;

/** Orden fijo de categorías, igual al de la ficha de revisión. */
const CATEGORY_ORDER = Object.keys(categoryLabels) as RuleCategory[];

const normalize = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Filtra por estado y por texto (título o ID de regla, sin distinguir tildes ni mayúsculas). */
export function filterResults(items: RuleResult[], { status, search }: ResultFilters): RuleResult[] {
  const q = normalize(search);
  return items.filter(({ rule, result }) => {
    if (status !== "ALL" && result.status !== status) return false;
    if (!q) return true;
    return normalize(rule.title).includes(q) || normalize(rule.id).includes(q);
  });
}

/** Agrupa por categoría en el orden de `categoryLabels`; omite grupos vacíos. */
export function groupByCategory(items: RuleResult[]): CategoryGroup[] {
  const map = new Map<RuleCategory, RuleResult[]>();
  for (const item of items) {
    const list = map.get(item.rule.category) ?? [];
    list.push(item);
    map.set(item.rule.category, list);
  }
  return CATEGORY_ORDER.filter((c) => map.has(c)).map((category) => ({ category, label: categoryLabels[category], items: map.get(category) ?? [] }));
}

export function countByStatus(items: RuleResult[]): StatusCounts {
  const counts: StatusCounts = { PASS: 0, FAIL: 0, WARNING: 0, MANUAL_REVIEW: 0, NOT_APPLICABLE: 0 };
  for (const { result } of items) counts[result.status] += 1;
  return counts;
}

/** Selección por defecto: la primera regla que no cumple; si no hay, la primera de la lista. */
export function defaultRuleId(items: RuleResult[]): string | null {
  return (items.find((i) => i.result.status === "FAIL") ?? items[0])?.rule.id ?? null;
}

/** IDs de las filas visibles (grupos no colapsados), en orden de pantalla. */
export function visibleRuleIds(groups: CategoryGroup[], collapsed: RuleCategory[]): string[] {
  return groups.filter((g) => !collapsed.includes(g.category)).flatMap((g) => g.items.map((i) => i.rule.id));
}

/** Siguiente ID al mover la selección con las flechas; se detiene en los extremos. */
export function stepSelection(ids: string[], current: string | null, delta: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const idx = current ? ids.indexOf(current) : -1;
  if (idx === -1) return delta === 1 ? ids[0] : ids[ids.length - 1];
  return ids[Math.min(ids.length - 1, Math.max(0, idx + delta))];
}
