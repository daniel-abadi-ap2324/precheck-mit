"use client";

import { useState } from "react";
import { ErrorState, SkeletonRows } from "@/components/common";
import { useProjects } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import { esPreCheckReal } from "@/services/prechecks/cliente";
import { ConclusionesModelos } from "./conclusiones-modelos";
import { Explorador } from "./explorador";
import { ModelComparison } from "./model-comparison";

const VISTAS = [
  { id: "explorar", label: "Estabilidad por ronda" },
  { id: "conclusiones", label: "Conclusión de cada modelo" },
  { id: "comparar", label: "Comparar corridas lado a lado" },
] as const;

/**
 * Comparar modelos: por defecto, lo que concluyó cada modelo (una corrida por modelo, rápido de leer y de cargar). La
 * comparación detallada, que lee todas las corridas del plano, solo se monta al elegirla.
 */
export function CompararPagina({ inicial }: { inicial: string[] }) {
  const [vista, setVista] = useState<(typeof VISTAS)[number]["id"]>(inicial.length ? "comparar" : "explorar");
  const [ids, setIds] = useState(inicial);
  const lista = useProjects({ pruebas: "incluir" });
  const proyectos = (lista.data?.items ?? []).filter((p) => p.precheckId && esPreCheckReal(p.precheckId) && p.status === "REVIEW_REQUIRED");

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Qué quiere ver" className="flex w-fit flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {VISTAS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={vista === v.id}
            onClick={() => setVista(v.id)}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", vista === v.id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {v.label}
          </button>
        ))}
      </div>
      {vista === "explorar" ? (
        <Explorador
          onComparar={(elegidos) => {
            setIds(elegidos);
            setVista("comparar");
          }}
        />
      ) : vista === "comparar" ? (
        <ModelComparison inicial={ids} />
      ) : lista.error ? (
        <ErrorState error={lista.error} onRetry={() => void lista.refetch()} />
      ) : lista.isPending ? (
        <SkeletonRows rows={4} />
      ) : (
        <ConclusionesModelos proyectos={proyectos} />
      )}
    </div>
  );
}
