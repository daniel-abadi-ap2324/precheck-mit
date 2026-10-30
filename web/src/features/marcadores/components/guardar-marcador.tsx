"use client";

import { useState } from "react";
import { Bookmark, CircleAlert, Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MAX_NOTA_MARCADOR, type FotoMarcador, type Marcador, type TipoMarcador } from "@/services/marcadores/tipos";
import { useCambiarMarcadores, useMarcadores } from "../hooks/use-marcadores";
import { TIPOS_MARCADOR } from "../lib/marcadores";
import { useContextoMarcador, type ContextoMarcador } from "./marcador-contexto";

/** Icono y color de cada tipo: siempre icono + color + texto. */
export const META_TIPO: Record<TipoMarcador, { icono: typeof Star; clase: string }> = {
  interesante: { icono: Star, clase: "text-info" },
  equivocada: { icono: CircleAlert, clase: "text-fail" },
};

/**
 * «Guardar» una conclusión de la revisión como interesante o equivocada, con una nota opcional (ADR-0015). Con
 * `ruleId` null guarda la conclusión del dictamen entero. `foto` se calcula al guardar: es lo que el usuario está viendo.
 */
export function GuardarMarcador(props: { ruleId: string | null; foto: (proyecto: string) => FotoMarcador; className?: string }) {
  const contexto = useContextoMarcador();
  // Fuera de un proyecto (informe, demostración sin PreCheck) no hay nada que guardar ni que consultar.
  return contexto ? <ConContexto {...props} contexto={contexto} /> : null;
}

function ConContexto({ ruleId, foto, className, contexto }: { ruleId: string | null; foto: (proyecto: string) => FotoMarcador; className?: string; contexto: ContextoMarcador }) {
  const lista = useMarcadores(contexto.projectId);
  const guardado = lista.data?.find((m) => m.precheckId === contexto.precheckId && m.ruleId === ruleId);
  // La clave reinicia el formulario cuando cambia de regla o llega lo guardado.
  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="guardar-marcador">
      <Formulario key={`${ruleId ?? "conclusion"}|${guardado?.updatedAt ?? ""}`} ruleId={ruleId} foto={foto} guardado={guardado} cargando={lista.isPending} />
    </div>
  );
}

function Formulario({ ruleId, foto, guardado, cargando }: { ruleId: string | null; foto: (proyecto: string) => FotoMarcador; guardado?: Marcador; cargando: boolean }) {
  const contexto = useContextoMarcador();
  const { guardar, quitar } = useCambiarMarcadores();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoMarcador>(guardado?.tipo ?? "interesante");
  const [nota, setNota] = useState(guardado?.nota ?? "");
  if (!contexto) return null;
  const notaId = `nota-marcador-${ruleId ?? "conclusion"}`;

  if (!abierto) {
    if (!guardado) {
      return (
        <Button variant="outline" size="sm" className="self-start" disabled={cargando} onClick={() => setAbierto(true)}>
          <Bookmark aria-hidden />
          Guardar
        </Button>
      );
    }
    const { icono: Icono, clase } = META_TIPO[guardado.tipo];
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 text-sm font-medium", clase)}>
            <Icono aria-hidden className="size-4" />
            Guardada: {TIPOS_MARCADOR[guardado.tipo].etiqueta}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setAbierto(true)}>
            <Pencil aria-hidden />
            Editar
          </Button>
          <Button variant="ghost" size="sm" disabled={quitar.isPending} onClick={() => quitar.mutate(guardado.id)}>
            <Trash2 aria-hidden />
            Quitar
          </Button>
        </div>
        {guardado.nota ? <p className="text-sm text-ink-muted">{guardado.nota}</p> : null}
      </div>
    );
  }

  const enviar = () =>
    guardar.mutate(
      { projectId: contexto.projectId, precheckId: contexto.precheckId, ruleId, tipo, nota: nota.trim(), foto: foto(contexto.proyecto) },
      { onSuccess: () => setAbierto(false) },
    );
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs text-ink-muted">Esta conclusión me parece…</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(META_TIPO) as TipoMarcador[]).map((t) => {
            const { icono: Icono, clase } = META_TIPO[t];
            return (
              <Button key={t} variant="outline" size="sm" aria-pressed={tipo === t} onClick={() => setTipo(t)} className={cn(tipo === t && "border-brand bg-brand-soft")}>
                <Icono aria-hidden className={clase} />
                {TIPOS_MARCADOR[t].etiqueta}
              </Button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={notaId} className="text-xs text-ink-muted">
          Nota (opcional) · {nota.length}/{MAX_NOTA_MARCADOR}
        </Label>
        <Textarea id={notaId} value={nota} maxLength={MAX_NOTA_MARCADOR} rows={2} placeholder="Por qué (p. ej. «el retiro está acotado en la lámina A-102»)" onChange={(e) => setNota(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={guardar.isPending} onClick={enviar}>
          <Bookmark aria-hidden />
          Guardar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** Indicador en la tarjeta de la regla si tiene un marcador (una sola petición por proyecto, compartida por todas). */
export function MarcaDeRegla({ ruleId }: { ruleId: string }) {
  const contexto = useContextoMarcador();
  return contexto ? <MarcaConContexto ruleId={ruleId} contexto={contexto} /> : null;
}

function MarcaConContexto({ ruleId, contexto }: { ruleId: string; contexto: ContextoMarcador }) {
  const { data } = useMarcadores(contexto.projectId);
  const m = data?.find((x) => x.precheckId === contexto.precheckId && x.ruleId === ruleId);
  return m ? <MarcaMarcador tipo={m.tipo} /> : null;
}

/** Indicador corto del tipo de marcador. */
export function MarcaMarcador({ tipo }: { tipo: TipoMarcador }) {
  const { icono: Icono, clase } = META_TIPO[tipo];
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs", clase)} title={`Marcador: ${TIPOS_MARCADOR[tipo].etiqueta}`}>
      <Icono aria-hidden className="size-3" />
      {TIPOS_MARCADOR[tipo].etiqueta}
    </span>
  );
}
