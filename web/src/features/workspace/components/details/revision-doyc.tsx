"use client";

import { useState } from "react";
import { Clock, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import type { AccionRevision, DecisionRevision } from "@/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useGuardarRevision, useRevisionReal } from "../../hooks/use-revision-real";
import { REVISION_META } from "../rules/revision-mark";

/** Lo mismo que acepta el servidor (server/prechecks/revision.ts). */
const MAX_NOTA = 500;

/**
 * Revisión DOYC de una decisión de la IA en un PreCheck real: el revisor la confirma o la contradice con una nota
 * corta y queda guardado en el servidor (revision.json). Principio 3: el PreCheck es preliminar y la última palabra es
 * de una persona.
 */
export function RevisionDoyc({ precheckId, ruleId }: { precheckId: string; ruleId: string }) {
  const { decisiones, query } = useRevisionReal(precheckId);
  if (query.isLoading) return <p className="text-sm text-ink-muted">Cargando la revisión guardada…</p>;
  if (query.error) {
    return (
      <p role="alert" className="text-sm text-fail">
        No se pudo leer la revisión guardada: {query.error.message}{" "}
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => void query.refetch()}>
          Reintentar
        </Button>
      </p>
    );
  }
  const guardada = decisiones[ruleId];
  // La clave reinicia la nota del formulario con lo guardado cuando cambia de regla o llega una respuesta nueva.
  return <FormularioRevision key={`${ruleId}|${guardada?.fecha ?? ""}`} precheckId={precheckId} ruleId={ruleId} guardada={guardada} />;
}

function FormularioRevision({ precheckId, ruleId, guardada }: { precheckId: string; ruleId: string; guardada: DecisionRevision | undefined }) {
  const [nota, setNota] = useState(guardada?.nota ?? "");
  const guardar = useGuardarRevision(precheckId, ruleId);
  const accion = guardada?.accion ?? "pendiente";
  const enviar = (a: AccionRevision) => guardar.mutate({ accion: a, nota: nota.trim() });
  const notaId = `nota-revision-${ruleId}`;

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3" data-testid="revision-doyc">
      <EstadoGuardado guardada={guardada} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={notaId} className="text-xs text-ink-muted">Nota (opcional)</Label>
        <Textarea
          id={notaId}
          value={nota}
          maxLength={MAX_NOTA}
          rows={2}
          placeholder="Por qué confirma o no está de acuerdo (p. ej. «el retiro se mide en la lámina A-102»)"
          onChange={(e) => setNota(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-pressed={accion === "confirmar"}
          disabled={guardar.isPending}
          onClick={() => enviar("confirmar")}
          className={cn(accion === "confirmar" && REVISION_META.confirmar.className)}
        >
          <ThumbsUp aria-hidden />
          Confirmo la decisión de la IA
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={accion === "contradecir"}
          disabled={guardar.isPending}
          onClick={() => enviar("contradecir")}
          className={cn(accion === "contradecir" && REVISION_META.contradecir.className)}
        >
          <ThumbsDown aria-hidden />
          No estoy de acuerdo
        </Button>
        {accion !== "pendiente" ? (
          <Button variant="ghost" size="sm" disabled={guardar.isPending} onClick={() => enviar("pendiente")}>
            <RotateCcw aria-hidden />
            Dejar pendiente
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function EstadoGuardado({ guardada }: { guardada: DecisionRevision | undefined }) {
  if (!guardada || guardada.accion === "pendiente") {
    return (
      <p className="flex items-start gap-1.5 text-sm text-ink-muted" data-testid="estado-revision">
        <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>Pendiente: ninguna persona de la DOYC ha confirmado todavía esta decisión de la IA.</span>
      </p>
    );
  }
  const meta = REVISION_META[guardada.accion];
  const Icon = meta.icon;
  return (
    <div className="flex flex-col gap-1" data-testid="estado-revision">
      <p className={cn("inline-flex w-fit items-center gap-1.5 rounded border px-2 py-0.5 text-sm font-medium", meta.className)}>
        <Icon aria-hidden className="size-4" />
        {meta.label}
      </p>
      <p className="text-xs text-ink-muted">Guardado el {formatDate(guardada.fecha)}</p>
      {guardada.nota ? <p className="text-sm text-ink">Nota: {guardada.nota}</p> : null}
    </div>
  );
}
