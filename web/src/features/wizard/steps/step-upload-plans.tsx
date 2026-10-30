"use client";

import { useId } from "react";
import { CalloutBlock } from "@/components/common";
import { FileUploader } from "@/components/uploader";
import { PlanExamplePicker } from "@/features/plans";
import { DESCRIPCION_OCR, LECTORES_OCR, type LectorOcr } from "@/lib/lector-ocr";
import { useWizardStore } from "@/stores/wizard";
import { AiRequirementNotice } from "@/features/ia/components/ai-requirement-notice";
import { useEnsureProject } from "../hooks/use-ensure-project";
import { COTAS_A_DECLARAR } from "../lib/cotas-a-declarar";
import { usePlanUploads } from "../hooks/use-plan-uploads";
import { hasUploadedFiles } from "../lib/steps";
import { WizardFooter } from "../wizard-footer";

/** Una sola creación aunque se suelten varios archivos a la vez. */
let creando: Promise<string> | null = null;

/** Paso 1: solo se sube el PDF (no se pide ningún dato). El proyecto se crea con el nombre del primer archivo. */
export function StepUploadPlans({ onNext }: { onNext: () => void }) {
  const projectId = useWizardStore((s) => s.projectId);
  const ocr = useWizardStore((s) => s.ocr);
  const setOcr = useWizardStore((s) => s.setOcr);
  const upsertFile = useWizardStore((s) => s.upsertFile);
  const ensure = useEnsureProject();
  const asegurar = (nombre: string) => {
    creando ??= ensure.mutateAsync(nombre).finally(() => {
      creando = null;
    });
    return creando;
  };
  const uploads = usePlanUploads(projectId || null, asegurar);
  const planos = uploads.files.filter((f) => !f.complementario);
  const documentos = uploads.files.filter((f) => f.complementario);
  const busy = uploads.files.some((f) => f.status === "uploading" || f.status === "queued");
  const ready = hasUploadedFiles(planos);
  const hint = busy ? "Espere a que terminen las cargas." : ready ? undefined : "Cargue el plano en PDF para continuar.";

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Cargue el anteproyecto en PDF. El sistema lee el membrete y el recuadro de datos (finca, área, zona, proyecto y profesional) y en el paso siguiente
        solo le pregunta lo que no pudo comprobar.
      </p>
      <AvisoCotas />
      <SelectorOcr valor={ocr} onChange={setOcr} bloqueado={uploads.files.length > 0} />
      <PlanExamplePicker
        projectId={projectId || null}
        asegurar={asegurar}
        ocr={ocr}
        onAdded={(plan) => upsertFile({ id: `ej-${plan.id}`, name: plan.fileName, size: plan.sizeBytes, format: "PDF", progress: 100, status: "uploaded", planId: plan.id })}
      />
      <FileUploader items={planos} onAdd={(a) => uploads.add(a)} onRemove={uploads.remove} onReplace={uploads.replace} announcement={uploads.announcement} />
      <section aria-labelledby="docs-complementarios" className="flex flex-col gap-2">
        <h3 id="docs-complementarios" className="text-sm font-medium">
          Documentos complementarios <span className="font-normal text-muted-foreground">(opcional)</span>
        </h3>
        <p className="max-w-2xl text-2xs text-muted-foreground">
          Memoria descriptiva, cuadro de áreas, cartas o certificaciones en PDF. Se leen igual que el plano: si un dato no está en el plano o salió dudoso,
          se toma de aquí, y la revisión con IA también los lee.
        </p>
        <FileUploader
          compacta
          items={documentos}
          onAdd={(a) => uploads.add(a, true)}
          onRemove={uploads.remove}
          onReplace={uploads.replace}
          textos={{ etiqueta: "Elegir documentos complementarios", titulo: "Arrastre aquí los documentos complementarios", lista: "Documentos complementarios cargados" }}
        />
      </section>
      <WizardFooter onNext={onNext} nextDisabled={!ready} hint={hint} />
    </div>
  );
}

/** Pide acotar las distancias en el plano: la IA lee la cota escrita en vez de medir a escala. */
function AvisoCotas() {
  return (
    <CalloutBlock tone="info" title="Acote en el plano todas las distancias" className="max-w-2xl">
      <p>La revisión con IA lee las cotas escritas; medir a escala es la principal fuente de error. Declare cada medida con su cota en metros (y las cantidades, áreas y porcentajes con su valor):</p>
      <ul aria-label="Cotas a declarar" className="list-disc pl-5 text-2xs">
        {COTAS_A_DECLARAR.map((c) => (
          <li key={c.etiqueta}>{c.etiqueta}</li>
        ))}
      </ul>
      <p className="text-2xs text-muted-foreground">
        Si lo prefiere, puede ponerlas en un documento adjunto (por ejemplo, la memoria descriptiva o un cuadro de datos) en «Documentos complementarios», o
        escribirlas en «Variables definidas» en el paso siguiente.
      </p>
    </CalloutBlock>
  );
}

/** Qué lector relee las hojas escaneadas. Se elige antes de cargar: cada plano se lee con el que había al cargarlo. */
function SelectorOcr({ valor, onChange, bloqueado }: { valor: LectorOcr; onChange: (v: LectorOcr) => void; bloqueado: boolean }) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={`${id}-nota`}>
      <legend className="text-sm font-medium">Lector para hojas escaneadas</legend>
      <div className="grid gap-2 md:grid-cols-3">
        {LECTORES_OCR.map((l) => (
          <label key={l} className="flex cursor-pointer gap-2 rounded-md border p-3 has-checked:border-brand has-checked:bg-brand/5 has-disabled:cursor-not-allowed has-disabled:opacity-70">
            <input type="radio" name={`${id}-ocr`} value={l} checked={valor === l} disabled={bloqueado} onChange={() => onChange(l)} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{DESCRIPCION_OCR[l].titulo}</span>
              <span className="text-2xs text-muted-foreground">{DESCRIPCION_OCR[l].detalle}</span>
            </span>
          </label>
        ))}
      </div>
      {valor === "claude" ? <AiRequirementNotice que="El lector Claude" /> : null}
      <p id={`${id}-nota`} className="text-2xs text-muted-foreground">
        {bloqueado ? "Para cambiar de lector, quite los planos cargados y súbalos de nuevo." : "Los PDF vectoriales traen el texto: el lector solo se usa en hojas escaneadas."}
      </p>
    </fieldset>
  );
}
