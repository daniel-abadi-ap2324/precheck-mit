import type { PipelineStage } from "@/types";

export const PIPELINE: { stage: PipelineStage; label: string }[] = [
  { stage: "uploading", label: "Cargando planos" },
  { stage: "reading", label: "Leyendo documentos" },
  { stage: "geometry", label: "Extrayendo geometría" },
  { stage: "property", label: "Identificando el lote" },
  { stage: "rules", label: "Cargando reglas de zonificación" },
  { stage: "analyzing", label: "Analizando el diseño" },
  { stage: "checks", label: "Verificando cumplimiento" },
  { stage: "report", label: "Generando el informe" },
];
