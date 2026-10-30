"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bookmark, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { EmptyState, ErrorState, PageHeader, PreliminaryNotice, SkeletonRows } from "@/components/common";
import { ComplianceBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useProjects } from "@/hooks/use-api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MAX_NOTA_MARCADOR, type Marcador, type TipoMarcador } from "@/services/marcadores/tipos";
import { useCambiarMarcadores, useMarcadores } from "../hooks/use-marcadores";
import { enlaceDeMarcador, TIPOS_MARCADOR } from "../lib/marcadores";
import { META_TIPO } from "./guardar-marcador";

const TODOS = "";

/** Ronda y repetición de la corrida («ronda 77 · repetición 2»), si es una corrida de prueba. */
export const textoCorrida = (m: Marcador) =>
  [m.foto.modelo, m.foto.ronda ? `ronda ${m.foto.ronda}` : null, m.foto.repeticion && m.foto.repeticion > 1 ? `repetición ${m.foto.repeticion}` : null].filter(Boolean).join(" · ");

/**
 * /marcadores: las conclusiones que el usuario guardó como interesantes o equivocadas, agrupadas por plano. Cada una
 * lleva a la revisión y a la regla (o a la conclusión del dictamen). Muestra lo que se vio al guardarla.
 */
export function MarcadoresPage() {
  const lista = useMarcadores();
  // Para saber si el proyecto sigue existiendo (incluidas las corridas de prueba, que no salen en las listas).
  const proyectos = useProjects({ pruebas: "incluir" });
  const existentes = useMemo(() => (proyectos.data ? new Set(proyectos.data.items.map((p) => p.id)) : null), [proyectos.data]);
  const [tipo, setTipo] = useState<TipoMarcador | typeof TODOS>(TODOS);
  const [plano, setPlano] = useState(TODOS);
  const [modelo, setModelo] = useState(TODOS);

  const todos = useMemo(() => lista.data ?? [], [lista.data]);
  const planos = useMemo(() => [...new Set(todos.map((m) => m.foto.plano))].sort((a, b) => a.localeCompare(b, "es")), [todos]);
  const modelos = useMemo(() => [...new Set(todos.flatMap((m) => (m.foto.modelo ? [m.foto.modelo] : [])))].sort(), [todos]);
  const visibles = todos.filter((m) => (!tipo || m.tipo === tipo) && (!plano || m.foto.plano === plano) && (!modelo || m.foto.modelo === modelo));
  const porPlano = useMemo(() => {
    const g = new Map<string, Marcador[]>();
    for (const m of visibles) g.set(m.foto.plano, [...(g.get(m.foto.plano) ?? []), m]);
    return [...g.entries()];
  }, [visibles]);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader title="Marcadores" description="Conclusiones de las revisiones que guardó por interesantes o equivocadas. Cada una lleva a la revisión y a la regla." />
      <PreliminaryNotice />
      {lista.error ? (
        <ErrorState error={lista.error} onRetry={() => void lista.refetch()} />
      ) : lista.isPending ? (
        <SkeletonRows rows={5} className="rounded-lg border bg-card p-4" />
      ) : todos.length === 0 ? (
        <EmptyState icon={Bookmark} title="Aún no hay marcadores" body="En una revisión, abra una regla o la conclusión del dictamen y pulse «Guardar»." />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filtros">
            <Filtro id="filtro-tipo" etiqueta="Tipo" valor={tipo} onChange={(v) => setTipo(v as TipoMarcador | typeof TODOS)} opciones={(Object.keys(TIPOS_MARCADOR) as TipoMarcador[]).map((t) => [t, TIPOS_MARCADOR[t].etiqueta])} />
            <Filtro id="filtro-plano" etiqueta="Plano" valor={plano} onChange={setPlano} opciones={planos.map((p) => [p, p])} />
            <Filtro id="filtro-modelo" etiqueta="Modelo" valor={modelo} onChange={setModelo} opciones={modelos.map((m) => [m, m])} />
            <p className="tabular pb-2 text-sm text-muted-foreground">
              {visibles.length} de {todos.length}
            </p>
          </div>
          {porPlano.length === 0 ? (
            <EmptyState title="Ningún marcador coincide" body="Quite algún filtro." />
          ) : (
            porPlano.map(([nombre, items]) => (
              <section key={nombre} aria-labelledby={`plano-${nombre}`} className="flex flex-col gap-2">
                <h2 id={`plano-${nombre}`} className="font-semibold">
                  {nombre} <span className="tabular text-sm font-normal text-muted-foreground">({items.length})</span>
                </h2>
                <ul className="flex flex-col gap-2" data-testid="lista-marcadores">
                  {items.map((m) => (
                    <TarjetaMarcador key={m.id} marcador={m} existe={existentes ? existentes.has(m.projectId) : true} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}

function Filtro({ id, etiqueta, valor, onChange, opciones }: { id: string; etiqueta: string; valor: string; onChange: (v: string) => void; opciones: [string, string][] }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {etiqueta}
      </Label>
      <NativeSelect id={id} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value={TODOS}>Todos</option>
        {opciones.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function TarjetaMarcador({ marcador: m, existe }: { marcador: Marcador; existe: boolean }) {
  const { editar, quitar } = useCambiarMarcadores();
  const [editando, setEditando] = useState(false);
  const [nota, setNota] = useState(m.nota);
  const { icono: Icono, clase } = META_TIPO[m.tipo];
  const regla = m.foto.regla;
  const corrida = textoCorrida(m);

  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1 text-sm font-medium", clase)}>
          <Icono aria-hidden className="size-4" />
          {TIPOS_MARCADOR[m.tipo].etiqueta}
        </span>
        <span className="text-xs text-muted-foreground">
          <time dateTime={m.updatedAt}>{formatDate(m.updatedAt)}</time>
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium">{regla ? regla.titulo : "Conclusión del dictamen"}</p>
        <p className="text-xs text-muted-foreground">
          {m.foto.proyecto}
          {corrida ? ` · ${corrida}` : ""}
        </p>
        {regla ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <ComplianceBadge status={regla.estado} official={false} faltaEnPlano={regla.faltaEnPlano} size="sm" />
            {regla.decision ? <span className="text-xs text-muted-foreground">Decisión de la IA: {regla.decision}</span> : null}
          </div>
        ) : null}
        {regla?.justificacion || m.foto.conclusion ? <p className="text-sm text-ink-muted">{regla?.justificacion ?? m.foto.conclusion}</p> : null}
      </div>
      {editando ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`nota-${m.id}`} className="text-xs text-muted-foreground">
            Nota · {nota.length}/{MAX_NOTA_MARCADOR}
          </Label>
          <Textarea id={`nota-${m.id}`} value={nota} maxLength={MAX_NOTA_MARCADOR} rows={2} onChange={(e) => setNota(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={editar.isPending} onClick={() => editar.mutate({ id: m.id, cambios: { nota: nota.trim() } }, { onSuccess: () => setEditando(false) })}>
              Guardar nota
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : m.nota ? (
        <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm">{m.nota}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {existe ? (
          <Link href={enlaceDeMarcador(m)} className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
            Abrir {m.ruleId ? "la regla" : "la conclusión"} <ExternalLink aria-hidden className="size-3.5" />
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">Proyecto eliminado</span>
        )}
        {editando ? null : (
          <Button size="sm" variant="ghost" onClick={() => setEditando(true)}>
            <Pencil aria-hidden />
            Editar nota
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={quitar.isPending} onClick={() => quitar.mutate(m.id)}>
          <Trash2 aria-hidden />
          Quitar
        </Button>
      </div>
    </li>
  );
}
