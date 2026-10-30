import { FileLock2 } from "lucide-react";
import { PreliminaryNotice } from "@/components/common";
import { ExpedienteTag } from "@/components/status";
import { brand } from "@/config/brand";
import { BrandIcon } from "@/components/shell/brand-icon";
import { headerFields } from "../../lib/report-fields";
import type { ReportModel } from "../../lib/report-model";
import { sectionHeadingId } from "../../lib/sections";
import { FieldList } from "../report-section";

/** Primera página: título, nota preliminar (Art. 3) y datos del expediente. */
export function HeaderSection({ model }: { model: ReportModel }) {
  const revisor = model.version === "revisor";
  return (
    <section id="encabezado" aria-labelledby={sectionHeadingId("encabezado")} className="scroll-mt-24 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <BrandIcon tone="line" className="size-11" />
          <div>
          <p className="text-sm text-ink-muted">
            {brand.entity} · {brand.unit}
          </p>
          <h1 id={sectionHeadingId("encabezado")} className="text-2xl font-semibold tracking-tight">
            {brand.productName} — Informe preliminar
          </h1>
          </div>
        </div>
        <span className="rounded border border-dashed border-input px-2 py-0.5 text-xs text-ink-muted">{revisor ? "Uso interno" : "Vista previa — no emitida"}</span>
      </div>
      {model.project.origen === "expediente" ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <ExpedienteTag />
          <span className="text-ink-muted">
            {model.precheck.fuenteResultado
              ? `Estados según el ${model.precheck.fuenteResultado.charAt(0).toLowerCase()}${model.precheck.fuenteResultado.slice(1)} sobre este expediente; ninguno es oficial.`
              : "Resultados reales del agente revisor-planos sobre este expediente; ninguno es oficial."}
          </span>
        </p>
      ) : null}
      <PreliminaryNotice />
      <p className="text-sm text-ink-muted">
        Este informe no es la lista de observaciones del dictamen técnico de la DOYC; el dictamen puede incluir otras. La vigencia de un informe se verifica con la DOYC. El informe no
        constituye aprobación del expediente.
      </p>
      <FieldList fields={headerFields(model)} />
      {revisor ? (
        <div className="rounded-md border border-manual/30 bg-manual-soft p-3 text-sm">
          <p className="font-medium text-manual">Pendiente de revisión humana. Falta:</p>
          <ul className="mt-1 list-disc pl-5">
            {model.pendingReview.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-md border border-dashed border-input p-3 text-sm text-ink-muted">
          <FileLock2 aria-hidden className="mt-0.5 size-4 shrink-0" />
          La versión del profesional solo se emite con el expediente revisado. Esta es una vista previa: no se registra ni tiene huella.
        </p>
      )}
    </section>
  );
}
