"use client";

import { pdfDeLaDpu } from "@/lib/safe-url";
import { CheckCircle2, CircleDashed, ExternalLink, Info } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { FactList, SidePanel, type FactRow } from "@/components/common";
import type { Corregimiento, SheetCell, ZoningSheetEntry } from "@/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const MSG_SHEET_REFERENCIAL =
  "La hoja es referencial: la DPU la publica «sólo a manera de referencia». Si el expediente trae certificación de uso de suelo (CEUS) de la DPUOT, esta prevalece.";

interface SheetInfoPanelProps {
  /** Hoja del mosaico bajo el punto; null si el punto cae fuera del índice de hojas. */
  hoja: string | null;
  /** Celda del mosaico (escala y PDF); null si el mosaico no ha cargado. */
  cell: SheetCell | null;
  /** Entrada del índice de hojas vectorizadas; null = hoja pendiente de vectorizar. */
  entry: ZoningSheetEntry | null;
  /** Corregimiento bajo el punto (capa distrito8v4), si lo hay. */
  corregimiento?: Corregimiento | null;
  onClose: () => void;
  closeOnEscape?: boolean;
}

function CorregimientoRows({ c }: { c: Corregimiento }) {
  return (
    <div className="flex flex-col gap-2">
      <FactList
        label="Corregimiento"
        labelWidth="fluid"
        tabular
        rows={[
          { label: "Corregimiento", value: c.nombre, tone: "strong" },
          { label: "Área", value: `${formatNumber(c.area_ha)} ha` },
          { label: "Código", value: c.id },
          ...(c.cabecera ? [{ label: "Cabecera de distrito", value: c.cabecera }] : []),
        ]}
      />
      <p className="text-xs text-muted-foreground">Fuente: capa distrito8v4, corregimientos del distrito de Panamá (08-08).</p>
    </div>
  );
}

/** Información de una hoja del Documento Gráfico: escala, fecha, cobertura vectorial y enlace al PDF oficial. */
export function SheetInfoPanel({ hoja, cell, entry, corregimiento = null, onClose, closeOnEscape = true }: SheetInfoPanelProps) {
  const pdf = pdfDeLaDpu(entry?.pdf ?? cell?.pdf);
  const rows: FactRow[] = [
    { label: "Hoja", value: hoja },
    { label: "Escala", value: entry?.escala ?? cell?.escala },
    { label: "Fecha de la hoja", value: entry?.fecha_hoja ?? "No disponible (sin vectorizar)" },
    {
      label: "Vectorizada",
      value: entry ? (
        <span className="inline-flex items-center gap-1.5 text-pass">
          <CheckCircle2 aria-hidden className="size-4" />
          Sí
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <CircleDashed aria-hidden className="size-4" />
          No, pendiente
        </span>
      ),
    },
  ];

  return (
    <SidePanel
      titleId="sheet-info-title"
      title={hoja ? "Hoja del Documento Gráfico" : "Ubicación seleccionada"}
      subtitle={hoja ?? corregimiento?.nombre ?? "Fuera del distrito"}
      onClose={onClose}
      closeLabel="Cerrar información de la hoja"
      closeOnEscape={closeOnEscape}
    >

      {corregimiento ? <CorregimientoRows c={corregimiento} /> : null}

      {hoja ? (
        <div className={cn("flex flex-col gap-4", corregimiento && "border-t pt-3")}>
          <FactList label="Datos de la hoja" labelWidth="fluid" tabular rows={rows} />

          {entry ? (
            <div className="flex flex-col gap-2 border-t pt-3">
              <p className="text-sm font-medium">{formatNumber(entry.poligonos)} {entry.poligonos === 1 ? "polígono" : "polígonos"} de zona</p>
              <FactList
                label="Polígonos por estado"
                valueAlign="end"
                rows={[
                  { label: "Código único", value: formatNumber(entry.por_estado.ok ?? 0) },
                  { label: "Sin código", value: formatNumber(entry.por_estado.sin_etiqueta ?? 0) },
                  { label: "Más de un código", value: formatNumber(entry.por_estado.conflicto ?? 0) },
                ]}
              />
              <p className="text-xs text-muted-foreground">Solo los polígonos con código único alimentan reglas; los demás van a revisión.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Esta hoja aún no se ha vectorizado: su zonificación no está disponible en el mapa. Consulte el PDF oficial.
            </p>
          )}

          {pdf ? (
            <a href={pdf} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
              <ExternalLink aria-hidden />
              Ver hoja original (PDF, DPU)
              <span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">El punto está fuera del índice de hojas del Documento Gráfico.</p>
      )}

      <p className="flex gap-2 rounded-md border bg-muted px-2.5 py-2 text-xs">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <span>{MSG_SHEET_REFERENCIAL}</span>
      </p>
    </SidePanel>
  );
}
