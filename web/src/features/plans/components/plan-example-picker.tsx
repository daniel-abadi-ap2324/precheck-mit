"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { formatBytes } from "@/lib/format";
import type { LectorOcr } from "@/lib/lector-ocr";
import type { Plan } from "@/types";
import { useAddPlanExample, usePlanExamples } from "../hooks/use-plan-examples";

/** «Probar con un anteproyecto de ejemplo»: los PDF de muestra que el servidor tiene a mano. Sin ejemplos, no se muestra. */
/** `onAdded` recibe el plano creado (el asistente lo agrega a su lista de archivos). */
export function PlanExamplePicker({ projectId, onAdded, asegurar, ocr }: { projectId: string | null; onAdded?: (plan: Plan) => void; asegurar?: (nombre: string) => Promise<string>; ocr?: LectorOcr }) {
  const id = useId();
  const { data } = usePlanExamples();
  const agregar = useAddPlanExample(projectId, asegurar, ocr);
  const [nombre, setNombre] = useState("");
  if (!data?.length) return null;
  const elegido = nombre || data[0].nombre;
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor={id} className="text-sm font-medium">
          Plano de ejemplo
        </label>
        <p className="text-2xs text-muted-foreground">Anteproyectos reales de la DOYC para probar la lectura sin cargar un archivo.</p>
        <NativeSelect id={id} value={elegido} onChange={(e) => setNombre(e.target.value)}>
          {data.map((e) => (
            <option key={e.nombre} value={e.nombre}>
              {`${e.nombre} (${formatBytes(e.sizeBytes)})`}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button size="sm" loading={agregar.isPending} onClick={() => agregar.mutate(elegido, { onSuccess: (plan) => onAdded?.(plan) })}>
        Cargar y leer el ejemplo
      </Button>
      {agregar.error ? (
        <p role="alert" className="text-sm text-fail">
          {agregar.error.message}
        </p>
      ) : null}
    </div>
  );
}
