"use client";

import { useMemo } from "react";
import { useProject } from "@/hooks/use-api";
import { useRuleResults } from "@/hooks/use-rule-results";
import { resumenPorZona, separarPorZona } from "@/lib/agrupar-zona";
import { isOfficialResult } from "@/lib/official";
import { countByStatus, preliminaryIndex, toResultRow } from "../lib/results-model";

/** Proyecto → PreCheck → filas de resultados, conteos e índice preliminar. */
export function useResultsData(projectId: string) {
  const project = useProject(projectId);
  const precheckId = project.data?.precheckId;
  const ruleResults = useRuleResults(precheckId);

  // Las reglas de otras zonas por confirmar cuentan en «Requiere revisión» pero van en una sola línea (como en el informe).
  const { detalle, porZona } = useMemo(() => separarPorZona(ruleResults.items), [ruleResults.items]);
  const rows = useMemo(() => detalle.map(toResultRow), [detalle]);
  const counts = useMemo(() => countByStatus(ruleResults.items.map((i) => i.result.status)), [ruleResults.items]);
  const agrupadas = porZona.length;
  const lineaAgrupadas = useMemo(() => resumenPorZona(porZona), [porZona]);

  return {
    project: project.data,
    rows,
    /** Reglas agrupadas por zona sin confirmar (no están en `rows`). */
    agrupadas,
    /** Texto y estado de la línea de las agrupadas. */
    lineaAgrupadas,
    /** Todas las reglas evaluadas, incluidas las agrupadas. */
    total: ruleResults.items.length,
    unofficial: ruleResults.items.filter((i) => !isOfficialResult(i)).length,
    /** Hallazgos que propone la IA y que no son reglas del catálogo. */
    fueraDeCatalogo: ruleResults.items.filter((i) => i.result.fueraDeCatalogo).length,
    counts,
    index: preliminaryIndex(counts),
    hasPrecheck: Boolean(precheckId),
    isLoading: project.isLoading || (Boolean(precheckId) && ruleResults.isLoading),
    error: project.error ?? ruleResults.error,
    refetch: () => {
      void project.refetch();
      ruleResults.refetch();
    },
  };
}
