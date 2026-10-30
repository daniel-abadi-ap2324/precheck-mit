"use client";

import { completarConDocumentos, type DocumentoLeido } from "@/lib/documentos-complementarios";
import { useState } from "react";
import { CheckCheck, CircleCheck, CircleDashed, CircleHelp, CircleX, Info, LoaderCircle, MinusCircle, UserPen, type LucideIcon } from "lucide-react";
import type { Plan, PlanExtraction, PlanPage } from "@/types";
import { Callout, ReviewCallout } from "@/components/common/callout";
import { Button } from "@/components/ui/button";
import { datosSinConfirmar, mensajeSinConfirmar } from "@/lib/barrera-precheck";
import { toneClasses, type Tone } from "@/lib/status";
import { cn } from "@/lib/utils";
import { miniaturaUrl } from "@/services/planos/cliente";
import { REQUISITOS, contrastar, filasDeHechos, resumenPaginas, type Contraste, type RevisionHecho } from "../lib/lectura";
import { AgregarDato, DatoEditable, type Corregir } from "./dato-editable";

export interface ContextoExpediente {
  corregimiento?: string | null;
  zona?: string | null;
  areaM2?: number | null;
}

interface PlanReadingProps {
  plan: Plan;
  /** Datos del expediente para contrastar con lo leído del plano. Sin contexto no se muestra el contraste. */
  contexto?: ContextoExpediente;
  /** Con esta función, cada dato leído se puede corregir y se pueden agregar los que faltan (el PreCheck usa lo corregido). */
  onCorregir?: Corregir;
  className?: string;
  /** Documentos complementarios ya leídos: completan los datos que el plano no trae o trae dudosos. */
  complementos?: DocumentoLeido[];
}

/** Lo que el lector de planos (precheck/planos) sacó del PDF: láminas, datos con procedencia, contraste y Anexo IV. */
export function PlanReading({ plan: leido, contexto, onCorregir, className, complementos }: PlanReadingProps) {
  const plan = complementos?.length && leido.extraction ? { ...leido, extraction: { ...leido.extraction, hechos: completarConDocumentos(leido.extraction.hechos, complementos) } } : leido;
  if (plan.status === "failed") {
    return (
      <div role="alert" className={className}>
        <Callout tone="fail" title="No se pudo leer el plano">
          {plan.error ?? "Verifique que el PDF no esté dañado ni protegido."}
        </Callout>
      </div>
    );
  }
  if (!plan.extraction) {
    return (
      <p role="status" className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <LoaderCircle aria-hidden className="size-4 animate-spin text-processing motion-reduce:animate-none" />
        Leyendo el plano… Las láminas escaneadas pueden tardar varios minutos.
      </p>
    );
  }
  const ext = plan.extraction;
  return (
    <div className={cn("space-y-5", className)}>
      <Laminas planId={plan.id} ext={ext} />
      <DatosLeidos ext={ext} onCorregir={onCorregir} />
      {contexto ? <ContrasteExpediente filas={contrastar(ext, contexto)} /> : null}
      <AnexoIV ext={ext} />
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}

function detalleLamina(p: PlanPage): string {
  const { hoja, total_hojas, escala } = p.lamina;
  const partes = [
    hoja ? (total_hojas ? `Lámina ${hoja} de ${total_hojas}` : `Lámina ${hoja}`) : `Página ${p.numero}`,
    escala ? `Esc. 1:${escala}` : null,
    p.tipo === "escaneada" ? "escaneada (OCR)" : "texto del PDF",
  ];
  return partes.filter(Boolean).join(" · ");
}

function Laminas({ planId, ext }: { planId: string; ext: PlanExtraction }) {
  return (
    <Seccion titulo="Láminas">
      <p className="text-sm text-muted-foreground">{resumenPaginas(ext)}</p>
      <ul aria-label="Láminas del plano" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {ext.paginas.map((p) => (
          <li key={p.numero} className="min-w-0 overflow-hidden rounded-md border bg-card">
            {/* PNG generado por el lector en el servidor; no pasa por el optimizador de imágenes. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={miniaturaUrl(planId, p.numero)}
              alt={`Página ${p.numero}${p.lamina.titulo ? `: ${p.lamina.titulo}` : ""}`}
              loading="lazy"
              className="aspect-[4/3] w-full bg-plan-paper object-contain"
            />
            <div className="space-y-0.5 p-2 text-2xs">
              <p className="truncate font-medium text-compact">{p.lamina.codigo ?? "Sin código"}</p>
              {p.lamina.titulo ? <p className="truncate">{p.lamina.titulo}</p> : null}
              <p className="text-muted-foreground">{detalleLamina(p)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Seccion>
  );
}

const ICONO_ESTADO = { ok: CircleCheck, revision: CircleHelp, no_encontrado: CircleHelp, informativo: Info } as const;
const TONO_ESTADO: Record<keyof typeof ICONO_ESTADO, Tone> = { ok: "pass", revision: "manual", no_encontrado: "manual", informativo: "info" };

const REVISION: Record<RevisionHecho, { texto: string; tono: Tone; icono: LucideIcon }> = {
  pendiente: { texto: "Pendiente de confirmar", tono: "neutral", icono: CircleDashed },
  comprobado: { texto: "Comprobado en el plano", tono: "pass", icono: CircleCheck },
  confirmado: { texto: "Confirmado", tono: "pass", icono: CircleCheck },
  corregido: { texto: "Corregido", tono: "info", icono: UserPen },
};

/** Estado de la revisión de la persona: icono + color + texto. */
export function EstadoRevision({ revision }: { revision: RevisionHecho }) {
  const r = REVISION[revision];
  const Icon = r.icono;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-medium", toneClasses[r.tono].border, toneClasses[r.tono].bg)}>
      <Icon aria-hidden className={cn("size-3 shrink-0", toneClasses[r.tono].text)} />
      {r.texto}
    </span>
  );
}

function DatosLeidos({ ext, onCorregir }: { ext: PlanExtraction; onCorregir?: Corregir }) {
  const filas = filasDeHechos(ext);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const crudo = (clave: string) => {
    const h = ext.hechos.find((x) => x.hecho === clave);
    return h && h.estado === "ok" && h.valor !== null ? String(h.valor) : "";
  };
  const pendientes = filas.filter((f) => f.confirmable);
  // Sin código de zona a mano aquí: el mensaje ya dice que también vale indicarlo al ejecutar.
  const faltan = datosSinConfirmar(ext.hechos);

  async function confirmarTodos() {
    if (!onCorregir) return;
    setConfirmando(true);
    setError(null);
    try {
      await onCorregir(Object.fromEntries(pendientes.map((f) => [f.hecho, { confirmar: true as const }])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron confirmar los datos.");
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <Seccion titulo="Datos leídos del plano">
      {onCorregir ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Revise lo que leyó el lector: confirme lo que está bien y corrija lo que esté mal o falte. El PreCheck usará lo confirmado o corregido.
          </p>
          {faltan.length ? <Callout tone="manual" title="Antes de ejecutar">{mensajeSinConfirmar(faltan)}</Callout> : null}
          {pendientes.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" loading={confirmando} onClick={() => void confirmarTodos()}>
                {confirmando ? null : <CheckCheck aria-hidden />}
                {`Confirmar todos (${pendientes.length})`}
              </Button>
              <span className="text-2xs text-muted-foreground">Confirma los datos leídos con un solo valor; los dudosos hay que corregirlos.</span>
              {error ? <span role="alert" className="text-2xs text-fail">{error}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <ul aria-label="Datos leídos del plano" className="divide-y rounded-md border">
        {filas.map((f) => {
          const Icon = ICONO_ESTADO[f.estado];
          const tono = toneClasses[TONO_ESTADO[f.estado]];
          return (
            <li key={f.hecho} className="space-y-1.5 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {f.etiqueta}
                  {onCorregir || f.revision !== "pendiente" ? <EstadoRevision revision={f.revision} /> : null}
                </span>
                <span className="flex items-center gap-1.5 text-sm font-medium tabular">
                  <Icon aria-hidden className={cn("size-4 shrink-0", tono.text)} />
                  {f.valor}
                </span>
              </div>
              {f.fuente ? <p className="text-2xs text-muted-foreground">{f.fuente}</p> : null}
              {onCorregir ? (
                <DatoEditable
                  clave={f.hecho}
                  etiqueta={f.etiqueta}
                  actual={crudo(f.hecho)}
                  corregido={f.revision === "corregido"}
                  confirmado={f.revision === "confirmado"}
                  confirmable={f.confirmable}
                  onCorregir={onCorregir}
                />
              ) : null}
              {f.estado !== "ok" ? (
                <ReviewCallout>
                  {f.nota ??
                    (f.estado === "no_encontrado" ? "El lector no lo encontró; puede estar en el plano con otra forma." : "El lector encontró más de un valor posible.")}
                </ReviewCallout>
              ) : f.nota ? (
                <p className="text-2xs text-muted-foreground">{f.nota}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {onCorregir ? <AgregarDato presentes={new Set(ext.hechos.map((h) => h.hecho))} onCorregir={onCorregir} /> : null}
    </Seccion>
  );
}

function textoContraste(c: Contraste): string {
  if (c.coincide === true) return `${c.dato}: coincide (${c.plano})`;
  if (c.coincide === false) return `${c.dato}: el plano dice ${c.plano}; el expediente, ${c.expediente}`;
  return `${c.dato}: ${c.plano == null ? "no se leyó del plano" : "el expediente no lo indica"}`;
}

function ContrasteExpediente({ filas }: { filas: Contraste[] }) {
  return (
    <Seccion titulo="Contraste con el expediente">
      <ul aria-label="Contraste con el expediente" className="space-y-1.5">
        {filas.map((c) => {
          const tone: Tone = c.coincide === true ? "pass" : c.coincide === false ? "warning" : "neutral";
          const Icon = c.coincide === true ? CircleCheck : c.coincide === false ? CircleX : MinusCircle;
          return (
            <li key={c.dato} className="flex gap-2 text-sm">
              <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", toneClasses[tone].text)} />
              <span>{textoContraste(c)}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-2xs text-muted-foreground">Es información para el revisor: una diferencia no es un incumplimiento.</p>
    </Seccion>
  );
}

function AnexoIV({ ext }: { ext: PlanExtraction }) {
  return (
    <Seccion titulo="Requisitos del Anexo IV (Acuerdo 110)">
      <ul aria-label="Requisitos del Anexo IV" className="divide-y rounded-md border text-sm">
        {ext.requisitos_anexo_iv.map((r) => {
          const Icon = r.existe ? CircleCheck : CircleHelp;
          return (
            <li key={r.requisito} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
              <span>{REQUISITOS[r.requisito] ?? r.requisito}</span>
              <span className={cn("flex items-center gap-1.5", r.existe ? "text-foreground" : "text-muted-foreground")}>
                <Icon aria-hidden className={cn("size-4 shrink-0", toneClasses[r.existe ? "pass" : "manual"].text)} />
                {r.existe ? `Encontrado · página ${r.fuente?.pagina ?? "?"}` : "No encontrado · requiere revisión"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-2xs text-muted-foreground">Solo se indica si el plano parece incluir cada elemento; los datos personales no se copian.</p>
    </Seccion>
  );
}
