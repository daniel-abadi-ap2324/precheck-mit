"use client";

import { useMemo } from "react";
import { FilePlus2 } from "lucide-react";
import { separarPorZona } from "@/lib/agrupar-zona";
import { useProject } from "@/hooks/use-api";
import { useRuleResults } from "@/hooks/use-rule-results";
import { EmptyState, ErrorState, LinkButton } from "@/components/common";
import { AiReviewPanel } from "@/features/ia/components/ai-review-panel";
import { MarcadorProvider } from "@/features/marcadores/components/marcador-contexto";
import { esPreCheckReal } from "@/services/prechecks/cliente";
import { useWorkspaceLayout } from "../hooks/use-workspace-layout";
import { useRuleSelectionSync } from "../hooks/use-rule-selection-sync";
import { useSelectedItem } from "../hooks/use-rules-view";
import { WorkspaceSkeleton } from "./workspace-skeleton";
import { ResizableWorkspace } from "./layout/resizable-workspace";
import { TabletWorkspace } from "./layout/tablet-workspace";
import { MobileWorkspace } from "./layout/mobile-workspace";

const LAYOUTS = { desktop: ResizableWorkspace, tablet: TabletWorkspace, mobile: MobileWorkspace } as const;

/** Workspace de revisión: reglas, plano y detalle. Datos: proyecto → PreCheck → resultados unidos a sus reglas. */
export function PreCheckWorkspace({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const precheckId = project.data?.precheckId;
  const results = useRuleResults(precheckId);
  // Las reglas de otras zonas por confirmar se listan en una sola línea (como en el informe) y no se seleccionan.
  const { detalle, porZona } = useMemo(() => separarPorZona(results.items), [results.items]);
  const selected = useSelectedItem(detalle);
  const layout = useWorkspaceLayout();
  useRuleSelectionSync(detalle);
  // Expediente del agente o PreCheck real de la web: su documento reemplaza al plano de demostración.
  const info = project.data?.origen === "expediente" || (precheckId && esPreCheckReal(precheckId)) ? project.data?.expediente : undefined;
  const fuente = project.data?.origen === "expediente" ? projectId : precheckId;
  const expediente = useMemo(() => (info && fuente ? { projectId: fuente, info } : undefined), [info, fuente]);
  const nombre = project.data?.name;
  const marcador = useMemo(() => (precheckId && nombre ? { projectId, precheckId, proyecto: nombre } : null), [projectId, precheckId, nombre]);

  if (project.error) return <ErrorState className="m-6" error={project.error} onRetry={() => void project.refetch()} />;
  if (project.isLoading) return <WorkspaceSkeleton />;
  if (!precheckId) {
    return (
      <EmptyState
        className="m-6"
        icon={FilePlus2}
        title="Este proyecto aún no tiene un PreCheck"
        body="Cargue los planos y ejecute un PreCheck para revisar los resultados regla por regla."
        action={<LinkButton href="/projects/new" size="sm">Nuevo PreCheck</LinkButton>}
      />
    );
  }
  if (results.error) return <ErrorState className="m-6" error={results.error} onRetry={results.refetch} />;
  if (results.isLoading) return <WorkspaceSkeleton />;
  if (results.items.length === 0) {
    return <EmptyState className="m-6" title="El PreCheck no tiene resultados" body="La ejecución terminó sin reglas evaluadas. Vuelva a ejecutarlo o contacte a la DOYC." />;
  }

  const Layout = LAYOUTS[layout];
  return (
    <MarcadorProvider value={marcador}>
      {esPreCheckReal(precheckId) ? <AiReviewPanel precheckId={precheckId} /> : null}
      <div className="flex h-[calc(100dvh-12rem)] min-h-map-lg flex-col md:min-h-map-lg">
        <Layout items={detalle} agrupadas={porZona} selected={selected} precheckId={precheckId} expediente={expediente} />
      </div>
    </MarcadorProvider>
  );
}
