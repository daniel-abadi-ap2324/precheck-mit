import { ComplianceBadge, UnofficialTag } from "@/components/status";
import { SettingsSection } from "./settings-section";

const STEPS = [
  "Cree un Nuevo PreCheck: datos del proyecto, ubique el lote en el mapa y cargue los planos.",
  "Ejecute la verificación: el motor lee los planos, obtiene la zonificación del lote y evalúa cada regla.",
  "Revise en la pestaña Revisión: cada resultado muestra la regla, el valor medido, la norma y la cita literal, y se resalta en el plano.",
  "Consulte los resultados y genere el informe. La decisión final siempre la toma personal municipal autorizado.",
];

export function HelpSection() {
  return (
    <SettingsSection id="ayuda" title="Ayuda" description="Guía breve del flujo y términos clave.">
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
        {STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <h3 className="mt-5 mb-2 text-sm font-semibold">Glosario</h3>
      <dl className="flex flex-col gap-2.5 text-sm">
        <div className="flex flex-wrap items-baseline gap-2">
          <dt><ComplianceBadge status="PASS" size="sm" /></dt>
          <dd>El valor medido satisface la regla. No equivale a una aprobación del proyecto.</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <dt><ComplianceBadge status="FAIL" size="sm" /></dt>
          <dd>Incumplimiento bloqueante de la regla: hay que cambiar el proyecto.</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <dt><ComplianceBadge status="FAIL" faltaEnPlano size="sm" /></dt>
          <dd>Falta un requisito de contenido del plano (Anexos III y IV del Acuerdo 110): el plano no se registra así, pero se subsana completándolo, sin cambiar el proyecto.</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <dt><ComplianceBadge status="WARNING" size="sm" /></dt>
          <dd>Incumplimiento no bloqueante que decide la DOYC (p. ej. un lote ya inscrito menor que el mínimo), o medición en el borde de la tolerancia.</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <dt><ComplianceBadge status="MANUAL_REVIEW" size="sm" /></dt>
          <dd>El sistema no puede decidir (dato ausente, criterio o lote en dos zonas): lo decide un revisor.</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <dt><UnofficialTag /></dt>
          <dd>El resultado viene de una regla aún no aprobada: es indicativo.</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <dt className="font-medium">Índice preliminar</dt>
          <dd>Proporción de reglas evaluadas que cumplen. Nunca es un «cumple» global ni una aprobación municipal.</dd>
        </div>
      </dl>
    </SettingsSection>
  );
}
