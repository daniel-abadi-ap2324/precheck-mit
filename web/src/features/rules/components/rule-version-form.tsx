"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ComplianceRule } from "@/types";
import { versionProposalSchema, type VersionProposal } from "../lib/version-proposal";
import { operatorLabels } from "../lib/rule-meta";
import { describedBy, FormField } from "@/components/common/form-field";
import { NativeSelect } from "@/components/ui/native-select";

const today = () => new Date().toISOString().slice(0, 10);

interface RuleVersionFormProps {
  rule: ComplianceRule;
  onDone: () => void;
}

/** Propuesta de nueva versión (no se guarda: el prototipo no tiene backend). */
export function RuleVersionForm({ rule, onDone }: RuleVersionFormProps) {
  const form = useForm<VersionProposal>({
    resolver: zodResolver(versionProposalSchema),
    defaultValues: { description: rule.description, operator: rule.operator, value: rule.value == null ? "" : String(rule.value), unit: rule.unit ?? "", validFrom: today(), reason: "", norma: rule.regulation.norma, article: rule.regulation.article, quote: rule.regulation.quote },
  });
  const { errors } = form.formState;
  const submit = (v: VersionProposal) => {
    toast.success("Propuesta de versión preparada: debe aprobarla un revisor distinto de quien la propone", {
      description: `${rule.id} v${rule.version + 1}, vigente desde ${v.validFrom}. Esta demostración no guarda propuestas.`,
    });
    onDone();
  };

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate aria-label={`Proponer nueva versión de ${rule.id}`} className="flex flex-col gap-4">
      <p className="rounded-md border bg-info-soft px-3 py-2 text-xs">
        Las reglas nunca se editan en sitio. Esta propuesta crea la versión {rule.version + 1} con su fecha de vigencia; la versión {rule.version} sigue rigiendo
        hasta que la apruebe un revisor distinto de usted.
      </p>
      <FormField id="pv-description" label="Descripción" error={errors.description?.message}>
        <Textarea id="pv-description" rows={3} aria-invalid={Boolean(errors.description)} aria-describedby={describedBy("pv-description", { error: errors.description?.message })} {...form.register("description")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="pv-operator" label="Operador" error={errors.operator?.message}>
          <NativeSelect id="pv-operator" aria-invalid={Boolean(errors.operator)} aria-describedby={describedBy("pv-operator", { error: errors.operator?.message })} {...form.register("operator")}>
            {Object.entries(operatorLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="pv-value" label="Valor" error={errors.value?.message}>
          <Input id="pv-value" inputMode="decimal" aria-invalid={Boolean(errors.value)} aria-describedby={describedBy("pv-value", { error: errors.value?.message })} {...form.register("value")} />
        </FormField>
        <FormField id="pv-unit" label="Unidad" error={errors.unit?.message}>
          <Input id="pv-unit" aria-invalid={Boolean(errors.unit)} aria-describedby={describedBy("pv-unit", { error: errors.unit?.message })} {...form.register("unit")} />
        </FormField>
      </div>
      <FormField id="pv-valid-from" label="Vigencia desde" error={errors.validFrom?.message}>
        <Input id="pv-valid-from" type="date" aria-invalid={Boolean(errors.validFrom)} aria-describedby={describedBy("pv-valid-from", { error: errors.validFrom?.message })} {...form.register("validFrom")} />
      </FormField>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-medium">Fuente (obligatoria)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="pv-norma" label="Norma" error={errors.norma?.message}>
            <Input id="pv-norma" aria-required aria-invalid={Boolean(errors.norma)} aria-describedby={describedBy("pv-norma", { error: errors.norma?.message })} {...form.register("norma")} />
          </FormField>
          <FormField id="pv-article" label="Artículo" error={errors.article?.message}>
            <Input id="pv-article" aria-required aria-invalid={Boolean(errors.article)} aria-describedby={describedBy("pv-article", { error: errors.article?.message })} {...form.register("article")} />
          </FormField>
        </div>
        <FormField id="pv-quote" label="Cita literal" hint="Copie el texto de la norma tal como aparece; no lo resuma ni lo escriba de memoria." error={errors.quote?.message}>
          <Textarea id="pv-quote" rows={3} aria-required aria-invalid={Boolean(errors.quote)} aria-describedby={describedBy("pv-quote", { hint: true, error: errors.quote?.message })} {...form.register("quote")} />
        </FormField>
      </fieldset>
      <FormField id="pv-reason" label="Motivo del cambio (obligatorio)" hint="Cite la norma o la instrucción que justifica la nueva versión." error={errors.reason?.message}>
        <Textarea id="pv-reason" rows={3} aria-required aria-invalid={Boolean(errors.reason)} aria-describedby={describedBy("pv-reason", { hint: true, error: errors.reason?.message })} {...form.register("reason")} />
      </FormField>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit">Preparar propuesta</Button>
      </div>
    </form>
  );
}
