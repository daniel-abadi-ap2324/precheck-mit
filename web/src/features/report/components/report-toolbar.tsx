"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { downloadReportHtml } from "../lib/download-report";
import type { ReportModel, ReportVersion } from "../lib/report-model";

const VERSIONS: { value: ReportVersion; label: string }[] = [
  { value: "revisor", label: "Versión del revisor" },
  { value: "profesional", label: "Versión del profesional" },
];

interface Props {
  model: ReportModel;
  version: ReportVersion;
  onVersionChange: (v: ReportVersion) => void;
}

/** Cambio de versión y acciones (Imprimir, Descargar informe). No se imprime. */
export function ReportToolbar({ model, version, onVersionChange }: Props) {
  return (
    <div className="flex flex-col gap-2 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          aria-label="Versión del informe"
          variant="outline"
          size="sm"
          spacing={0}
          value={[version]}
          onValueChange={(v) => {
            if (v[0] === "revisor" || v[0] === "profesional") onVersionChange(v[0]);
          }}
        >
          {VERSIONS.map((v) => (
            <ToggleGroupItem key={v.value} value={v.value} className="aria-pressed:bg-brand-soft aria-pressed:text-brand">
              {v.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer aria-hidden />
            Imprimir
          </Button>
          <Button size="sm" onClick={() => downloadReportHtml(model)}>
            <Download aria-hidden />
            Descargar informe (HTML)
          </Button>
        </div>
      </div>
      {version === "profesional" && !model.canIssue ? (
        <p className="text-sm text-ink-muted">
          Emisión no disponible: la versión del profesional solo se emite con el expediente revisado. Se muestra como vista previa, sin registro ni huella.
        </p>
      ) : null}
    </div>
  );
}
