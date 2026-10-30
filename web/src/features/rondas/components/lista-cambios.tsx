"use client";

import { useState } from "react";
import { ChevronDown, ListChecks } from "lucide-react";
import { toneClasses } from "@/lib/status";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/format";
import { etapaMeta, formatoPorcentaje, textosDeGrupo, tituloGrupo, type EtapaClave, type GrupoVista } from "../lib/rondas";
import { TarjetaGrupo } from "./tarjeta-ronda";

/** Grupos juntos por etapa (aunque no sean seguidos), en el orden en que empezó cada etapa. */
export function porEtapa(grupos: GrupoVista[]): { etapa: EtapaClave; grupos: GrupoVista[] }[] {
  const m = new Map<EtapaClave, GrupoVista[]>();
  for (const g of [...grupos].sort((a, b) => a.grupo.rondas[0] - b.grupo.rondas[0])) m.set(g.etapa, [...(m.get(g.etapa) ?? []), g]);
  return [...m.entries()].map(([etapa, gs]) => ({ etapa, grupos: gs }));
}

/** «1 a 12», «31, 34 a 36 y 39 a 42»: los tramos de rondas seguidas. */
export function tramos(numeros: number[]): string {
  const t: [number, number][] = [];
  for (const n of numeros) {
    const u = t[t.length - 1];
    if (u && n === u[1] + 1) u[1] = n;
    else t.push([n, n]);
  }
  const textos = t.map(([a, b]) => (a === b ? String(a) : `${a} a ${b}`));
  return textos.length > 1 ? `${textos.slice(0, -1).join(", ")} y ${textos[textos.length - 1]}` : textos[0];
}

/**
 * «Cómo llegamos aquí»: los grupos de rondas juntos por etapa, cada etapa cerrada por defecto con una frase que la
 * resume. Al abrirla se ve cada grupo con «Qué cambié» y «Resultado»; sus cifras y su detalle técnico solo se cargan al
 * pedirlos (con 50 grupos abiertos a la vez la página tardaba en responder).
 */
export function ListaCambios({ grupos }: { grupos: GrupoVista[] }) {
  const etapas = porEtapa(grupos);
  const rondas = grupos.reduce((n, g) => n + g.rondas.length, 0);
  return (
    <section aria-labelledby="lista-cambios" className="flex scroll-mt-4 flex-col gap-3" id="cambios">
      <div>
        <h2 id="lista-cambios" className="flex items-center gap-2 text-base font-semibold">
          <ListChecks aria-hidden className="size-4 text-brand" />
          Cómo llegamos aquí
        </h2>
        <p className="text-sm text-muted-foreground">
          Las {rondas} rondas, en {grupos.length} grupos y {etapas.length} etapas. Un grupo junta las rondas que repitieron la misma prueba. Abra una etapa
          para ver qué cambié en cada grupo y qué resultado dio.
        </p>
      </div>
      <ol className="flex flex-col gap-2">
        {etapas.map((e) => (
          <Etapa key={e.etapa} etapa={e.etapa} grupos={e.grupos} />
        ))}
      </ol>
    </section>
  );
}

function Etapa({ etapa, grupos }: { etapa: EtapaClave; grupos: GrupoVista[] }) {
  const [abierta, setAbierta] = useState(false);
  const meta = etapaMeta[etapa];
  const t = toneClasses[meta.tone];
  const Icon = meta.icon;
  const id = `etapa-${etapa}`;
  const rondas = grupos.flatMap((g) => g.grupo.rondas).sort((a, b) => a - b);
  return (
    <li className="rounded-lg border bg-card">
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={id}
        onClick={() => setAbierta((a) => !a)}
        className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/40"
      >
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border", t.bg, t.border, t.text)}>
          <Icon aria-hidden className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{meta.label}</span>
          <span className="block text-sm text-muted-foreground">{meta.descripcion}</span>
        </span>
        <span className="max-w-40 shrink-0 text-right text-xs text-muted-foreground">
          {rondas.length === 1 ? `Ronda ${rondas[0]}` : `${rondas.length} rondas: ${tramos(rondas)}`}
          <ChevronDown aria-hidden className={cn("mt-1 ml-auto size-4 transition-transform", abierta && "rotate-180")} />
        </span>
      </button>
      {abierta ? (
        <ol id={id} className="flex flex-col divide-y border-t">
          {grupos.map((g) => (
            <FilaGrupo key={g.grupo.id} grupo={g} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function FilaGrupo({ grupo: g }: { grupo: GrupoVista }) {
  const [detalle, setDetalle] = useState(false);
  const { cambio, resultado } = textosDeGrupo(g);
  const repite = g.modelos.filter((m) => m.seRepite !== null);
  return (
    <li className="flex flex-col gap-2 p-3" id={`grupo-${g.grupo.id}-fila`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
        <div className="shrink-0 sm:w-28">
          <p className="font-semibold">{tituloGrupo(g.grupo)}</p>
          {g.fecha ? <p className="tabular text-xs text-muted-foreground">{formatDay(g.fecha)}</p> : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <p>
            <span className="font-medium">Qué cambié: </span>
            {cambio ?? <span className="text-muted-foreground">no se anotó.</span>}
          </p>
          <p>
            <span className="font-medium">Resultado: </span>
            {resultado ?? <span className="text-muted-foreground">no se anotó.</span>}
          </p>
          {repite.length ? (
            <p className="text-xs text-muted-foreground" data-testid="se-repite-grupo">
              Se repite entre sus corridas: {repite.map((m) => `${m.modelo} ${formatoPorcentaje(m.seRepite as number)}`).join(" · ")}
            </p>
          ) : null}
          <button type="button" aria-expanded={detalle} onClick={() => setDetalle((d) => !d)} className="self-start text-xs font-medium text-brand hover:underline">
            {detalle ? "Ocultar cifras" : "Ver cifras de este grupo"}
          </button>
        </div>
      </div>
      {detalle ? <TarjetaGrupo grupo={g} /> : null}
    </li>
  );
}
