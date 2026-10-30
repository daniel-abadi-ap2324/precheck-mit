"use client";

import { useState } from "react";
import { Check, Pencil, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { CambioDato } from "@/services/planos/cliente";
import { DATOS_EDITABLES, valorEscrito } from "../lib/datos-motor";

export type Corregir = (cambios: Record<string, CambioDato>) => Promise<unknown>;

interface Props {
  clave: string;
  etiqueta: string;
  /** Valor leído como texto para precargar el campo ("" si el lector no lo encontró). */
  actual: string;
  corregido: boolean;
  /** La persona ya lo confirmó tal como se leyó. */
  confirmado?: boolean;
  /** Se ofrece «Confirmar» (el lector lo leyó con un solo valor y nadie lo revisó). */
  confirmable?: boolean;
  onCorregir: Corregir;
}

/** Botones «Confirmar» / «Corregir» / «Deshacer» de un dato leído, con su campo para escribir el valor correcto. */
export function DatoEditable({ clave, etiqueta, actual, corregido, confirmado = false, confirmable = false, onCorregir }: Props) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(actual);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function enviar(cambio: CambioDato) {
    setGuardando(true);
    setError(null);
    try {
      await onCorregir({ [clave]: cambio });
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
    } finally {
      setGuardando(false);
    }
  }

  function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    const v = valorEscrito(clave, texto);
    if ("error" in v) return setError(v.error);
    void enviar(v.valor);
  }

  if (!editando) {
    return (
      <span className="flex flex-wrap items-center gap-1">
        {confirmable ? (
          <Button type="button" variant="outline" size="xs" loading={guardando} onClick={() => void enviar({ confirmar: true })} aria-label={`Confirmar ${etiqueta}`}>
            <Check aria-hidden /> Confirmar
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="xs" onClick={() => { setTexto(actual); setError(null); setEditando(true); }} aria-label={`Corregir ${etiqueta}`}>
          <Pencil aria-hidden /> Corregir
        </Button>
        {corregido || confirmado ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            loading={guardando}
            onClick={() => void enviar(null)}
            aria-label={corregido ? `Deshacer la corrección de ${etiqueta}` : `Deshacer la confirmación de ${etiqueta}`}
          >
            <Undo2 aria-hidden /> Deshacer
          </Button>
        ) : null}
        {error ? <span role="alert" className="text-2xs text-fail">{error}</span> : null}
      </span>
    );
  }
  return (
    <form onSubmit={guardar} className="flex flex-wrap items-center gap-2">
      <Input aria-label={`Valor de ${etiqueta}`} value={texto} onChange={(e) => setTexto(e.target.value)} className="h-7 w-40" autoFocus inputMode="decimal" />
      <Button type="submit" size="sm" loading={guardando}>
        Guardar
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>
        Cancelar
      </Button>
      {error ? <span role="alert" className="text-2xs text-fail">{error}</span> : null}
    </form>
  );
}

/** Agrega un dato que el lector no trae pero que piden las reglas (p. ej. la altura o los retiros). */
export function AgregarDato({ presentes, onCorregir }: { presentes: Set<string>; onCorregir: Corregir }) {
  const opciones = DATOS_EDITABLES.filter((d) => !presentes.has(d.clave));
  const [clave, setClave] = useState("");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  if (!opciones.length) return null;

  async function agregar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!clave) return setError("Elija el dato que va a agregar.");
    const v = valorEscrito(clave, texto);
    if ("error" in v) return setError(v.error);
    setGuardando(true);
    setError(null);
    try {
      await onCorregir({ [clave]: v.valor });
      setClave("");
      setTexto("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el dato.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={agregar} className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3" aria-label="Agregar un dato">
      <NativeSelect aria-label="Dato que se agrega" value={clave} onChange={(e) => setClave(e.target.value)} className="w-56">
        <option value="">Agregar un dato…</option>
        {opciones.map((d) => (
          <option key={d.clave} value={d.clave}>
            {d.unidad ? `${d.etiqueta} (${d.unidad})` : d.etiqueta}
          </option>
        ))}
      </NativeSelect>
      <Input aria-label="Valor del dato que se agrega" value={texto} onChange={(e) => setTexto(e.target.value)} className="h-8 w-32" inputMode="decimal" />
      <Button type="submit" size="sm" variant="outline" loading={guardando}>
        Agregar
      </Button>
      {error ? <span role="alert" className="text-2xs text-fail">{error}</span> : null}
    </form>
  );
}
