"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ComplianceBadge, FueraDeCatalogoTag } from "@/components/status";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { cambiosDeLaIa, type DetalleRegla } from "../lib/clasificacion";
import { ClasificacionTag, type ClasificacionVisible } from "./clasificacion-tag";

type Vista = "todas" | "cambios" | "ia" | "motor";

/** Una celda de estado: el badge, o un guion con la razón de que no haya. */
const Estado = ({ estado, vacio }: { estado: DetalleRegla["motor"]; vacio: string }) =>
  estado ? <ComplianceBadge status={estado} size="sm" /> : <span className="text-xs text-muted-foreground">{vacio}</span>;

/**
 * Panel con lo que hizo cada parte en una corrida, regla por regla: lo que determinó el motor, lo que decidió la IA y
 * su justificación. Se abre desde la tarjeta de cada corrida en «Comparar corridas lado a lado».
 */
export function DetalleCorrida({
  abierto,
  onCerrar,
  proyectoId,
  nombre,
  modelo,
  clasificacion,
  filas,
}: {
  abierto: boolean;
  onCerrar: () => void;
  proyectoId: string;
  nombre: string;
  modelo: string;
  clasificacion?: ClasificacionVisible;
  filas: DetalleRegla[];
}) {
  const [vista, setVista] = useState<Vista>("todas");
  const cambios = cambiosDeLaIa(filas);
  const visibles = useMemo(
    () =>
      filas.filter((f) => {
        if (vista === "cambios") return f.motor !== null && f.ia !== null && f.motor !== f.ia;
        if (vista === "ia") return f.ia !== null;
        if (vista === "motor") return f.ia === null;
        return true;
      }),
    [filas, vista],
  );
  const opciones: { id: Vista; texto: string }[] = [
    { id: "todas", texto: `Todas (${filas.length})` },
    { id: "cambios", texto: `La IA cambió al motor (${cambios})` },
    { id: "ia", texto: `Decididas por la IA (${filas.filter((f) => f.ia !== null).length})` },
    { id: "motor", texto: `Solo el motor (${filas.filter((f) => f.ia === null).length})` },
  ];

  return (
    <Sheet open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-3xl" data-testid="detalle-corrida">
        <SheetHeader className="gap-1 border-b p-4">
          <SheetTitle className="text-base">{nombre}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            <span>Modelo: {modelo}</span>
            {clasificacion ? <ClasificacionTag clasificacion={clasificacion} /> : null}
            <Link href={`/projects/${proyectoId}/precheck`} className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2">
              Abrir el proyecto <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </SheetDescription>
          {clasificacion?.motivos.length ? (
            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
              {clasificacion.motivos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
        </SheetHeader>

        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Motor</strong>: lo que determinó el motor de reglas con los datos del plano. <strong className="text-foreground">IA</strong>: lo que decidió la revisión con IA, con su justificación. Donde la IA no decidió, vale lo del motor.
          </p>
          <div role="group" aria-label="Qué reglas ver" className="flex flex-wrap gap-1.5">
            {opciones.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={vista === o.id}
                onClick={() => setVista(o.id)}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium", vista === o.id ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted")}
              >
                {o.texto}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">Motor frente a IA, regla por regla</caption>
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th scope="col" className="p-2.5 font-medium">
                    Regla u hallazgo
                  </th>
                  <th scope="col" className="p-2.5 font-medium">
                    Motor
                  </th>
                  <th scope="col" className="p-2.5 font-medium">
                    IA
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => {
                  const cambia = f.motor !== null && f.ia !== null && f.motor !== f.ia;
                  return (
                    <tr key={f.ruleId} className={cn("border-b align-top last:border-0", cambia && "bg-warning-soft/50")} data-testid="fila-detalle">
                      <th scope="row" className="p-2.5 text-left font-normal">
                        {f.titulo}
                        <span className="block font-mono text-2xs text-muted-foreground">{f.ruleId}</span>
                        {f.fueraDeCatalogo ? <FueraDeCatalogoTag className="mt-1 block w-fit" /> : null}
                        {f.justificacion ? (
                          <details className="mt-1.5">
                            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Ver qué dijo la IA</summary>
                            <div className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
                              <p>{f.justificacion}</p>
                              {f.valorLeido || f.limite ? (
                                <p>
                                  {f.valorLeido ? <>Valor leído: <strong className="text-foreground">{f.valorLeido}</strong>. </> : null}
                                  {f.limite ? <>Límite: <strong className="text-foreground">{f.limite}</strong>.</> : null}
                                </p>
                              ) : null}
                              {f.subsanar ? <p>Qué corregir: {f.subsanar}</p> : null}
                            </div>
                          </details>
                        ) : null}
                        {f.motorMotivo && f.ia !== null ? <p className="mt-1 text-xs text-muted-foreground">Motor: {f.motorMotivo}</p> : null}
                      </th>
                      <td className="p-2.5">
                        <Estado estado={f.motor} vacio="no la evaluó" />
                      </td>
                      <td className="p-2.5">
                        <Estado estado={f.ia} vacio="no la decidió" />
                        {cambia ? <span className="mt-1 block text-xs font-medium text-warning">cambió al motor</span> : null}
                      </td>
                    </tr>
                  );
                })}
                {visibles.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-sm text-muted-foreground">
                      Ninguna regla en esta vista.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
