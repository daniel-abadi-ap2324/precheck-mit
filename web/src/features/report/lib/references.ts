import type { RuleResult } from "@/hooks/use-rule-results";

export interface NormReference {
  norma: string;
  articles: string[];
  pages: number[];
  rules: number;
  demo: boolean;
}

/** Normas únicas citadas por las reglas evaluadas, con sus artículos y páginas. */
export function buildReferences(items: RuleResult[]): NormReference[] {
  const map = new Map<string, { articles: Set<string>; pages: Set<number>; rules: number; demo: boolean }>();
  for (const { rule } of items) {
    const { norma, article, sourcePage } = rule.regulation;
    const entry = map.get(norma) ?? { articles: new Set<string>(), pages: new Set<number>(), rules: 0, demo: Boolean(rule.demo) };
    if (article && article !== "—") entry.articles.add(article);
    if (sourcePage) entry.pages.add(sourcePage);
    entry.rules += 1;
    map.set(norma, entry);
  }
  return [...map]
    .map(([norma, e]) => ({
      norma,
      articles: [...e.articles].sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
      pages: [...e.pages].sort((a, b) => a - b),
      rules: e.rules,
      demo: e.demo,
    }))
    .sort((a, b) => Number(a.demo) - Number(b.demo) || a.norma.localeCompare(b.norma, "es"));
}
