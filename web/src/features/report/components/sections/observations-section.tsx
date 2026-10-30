import { CircleX, TriangleAlert } from "lucide-react";
import { FueraDeCatalogoTag, UnofficialTag } from "@/components/status";
import { cn } from "@/lib/utils";
import type { Observation } from "../../lib/observations";
import type { ReportModel } from "../../lib/report-model";
import { Muted } from "../report-section";

function ObservationItem({ o, n, showUnofficial }: { o: Observation; n: number; showUnofficial: boolean }) {
  const Icon = o.blocking ? CircleX : TriangleAlert;
  return (
    <li className="break-inside-avoid rounded-md border p-3 print:rounded-none">
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <span className="tabular">{n}.</span>
        {o.title}
        <span className={cn("inline-flex items-center gap-1 text-xs font-medium", o.blocking ? "text-fail" : "text-warning")}>
          <Icon aria-hidden className="size-3.5" />
          {o.blocking ? "Bloqueante" : "No bloqueante"}
        </span>
        {showUnofficial && !o.official ? <UnofficialTag /> : null}
        {o.fueraDeCatalogo ? <FueraDeCatalogoTag /> : null}
      </h3>
      <dl className="mt-2 grid gap-1.5 text-sm sm:grid-cols-[6rem_1fr]">
        <dt className="font-medium">Qué</dt>
        <dd>{o.que}</dd>
        <dt className="font-medium">Dónde</dt>
        <dd>{o.donde}</dd>
        <dt className="font-medium">Por qué</dt>
        <dd>
          {o.porque.norma}
          {o.porque.article !== "—" ? `, ${o.porque.article}` : ""}
          {o.porque.sourcePage ? `, pág. ${o.porque.sourcePage}` : ""}
          {o.porque.quote ? <q className="mt-1 block border-l-2 border-brand pl-2 italic">{o.porque.quote}</q> : <span className="block text-ink-muted">Sin cita literal: regla de demostración.</span>}
        </dd>
        <dt className="font-medium">{o.subsanar ? "Qué subsanar" : "Qué hacer"}</dt>
        <dd className={o.indicationPending ? "text-ink-muted italic" : undefined}>{o.queHacer}</dd>
      </dl>
      {o.zoneNote ? <p className="mt-2 text-xs text-ink-muted">{o.zoneNote}</p> : null}
    </li>
  );
}

/** Observaciones redactadas al estilo del informe PreCheck; bloqueantes primero. */
export function ObservationsSection({ model }: { model: ReportModel }) {
  if (model.observations.length === 0) return <Muted>No hay observaciones. Esto no significa que el proyecto cumpla en forma global: vea el alcance.</Muted>;
  return (
    <ol className="flex flex-col gap-3">
      {model.observations.map((o, i) => (
        <ObservationItem key={o.ruleId} o={o} n={i + 1} showUnofficial={model.version === "revisor"} />
      ))}
    </ol>
  );
}
