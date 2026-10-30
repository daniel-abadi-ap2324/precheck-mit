import { CircleAlert, CircleCheck, CircleHelp, Zap, type LucideIcon } from "lucide-react";
import { toneClasses, type Tone } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Clasificacion, NivelClasificacion } from "../lib/clasificacion";

const NIVELES: Record<NivelClasificacion, { etiqueta: string; tono: Tone; icono: LucideIcon; ayuda: string }> = {
  estandar: { etiqueta: "Estándar", tono: "pass", icono: CircleCheck, ayuda: "Se parece a la mayoría de las corridas de su plano." },
  desviante: { etiqueta: "Desviante", tono: "warning", icono: CircleAlert, ayuda: "Se aleja de lo habitual en alguna medida." },
  rarisimo: { etiqueta: "Rarísimo", tono: "fail", icono: Zap, ayuda: "Se aleja mucho de lo habitual: conviene revisarla antes de fiarse de ella." },
  sin_clasificar: { etiqueta: "Sin clasificar", tono: "neutral", icono: CircleHelp, ayuda: "Hacen falta al menos 3 corridas terminadas del plano en el grupo para clasificar." },
};

export const etiquetaDeNivel = (n: NivelClasificacion) => NIVELES[n].etiqueta;
export const metaNivel = (n: NivelClasificacion) => NIVELES[n];
export const ORDEN_NIVELES: NivelClasificacion[] = ["estandar", "desviante", "rarisimo", "sin_clasificar"];

/** Lo que hace falta para mostrar la clasificación (la del servidor o la calculada en la página). */
export type ClasificacionVisible = Pick<Clasificacion, "nivel" | "motivos" | "orientativa">;

/** Etiqueta «Estándar / Desviante / Rarísimo»: icono + color + texto, con el porqué como ayuda. */
export function ClasificacionTag({ clasificacion, className }: { clasificacion: ClasificacionVisible; className?: string }) {
  const n = NIVELES[clasificacion.nivel];
  const t = toneClasses[n.tono];
  const Icono = n.icono;
  return (
    <span
      data-testid="clasificacion"
      data-nivel={clasificacion.nivel}
      title={`${n.ayuda}\n${clasificacion.motivos.join("\n")}${clasificacion.orientativa && clasificacion.nivel !== "sin_clasificar" ? "\n(Orientativa: hay menos de 6 corridas de este plano.)" : ""}`}
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", t.text, t.bg, t.border, className)}
    >
      <Icono aria-hidden className="size-3.5" />
      {n.etiqueta}
    </span>
  );
}
