"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { RuleResult } from "@/hooks/use-rule-results";
import { useWorkspaceStore } from "@/stores/workspace";
import { defaultRuleId } from "../lib/filter-results";

/**
 * Enlace profundo `?rule=<id>` ⇄ regla seleccionada en el store.
 * Prioridad al entrar: la regla de la URL, luego la selección previa si existe en este PreCheck,
 * y por último la primera regla que no cumple.
 */
export function useRuleSelectionSync(items: RuleResult[]) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const paramRule = searchParams.get("rule");
  const selected = useWorkspaceStore((s) => s.selectedRuleId);

  // URL → store (sin cambiar el panel móvil: no es una acción del usuario).
  useEffect(() => {
    if (items.length === 0) return;
    const ids = new Set(items.map((i) => i.rule.id));
    const current = useWorkspaceStore.getState().selectedRuleId;
    const next = paramRule && ids.has(paramRule) ? paramRule : current && ids.has(current) ? current : defaultRuleId(items);
    if (next !== current) useWorkspaceStore.setState({ selectedRuleId: next });
  }, [items, paramRule]);

  // Store → URL. Se lee el store en el momento para no pisar la selección que acaba de tomar la URL.
  useEffect(() => {
    const current = useWorkspaceStore.getState().selectedRuleId;
    if (!current || current === paramRule) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("rule", current);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [selected, paramRule, pathname, router, searchParams]);
}
