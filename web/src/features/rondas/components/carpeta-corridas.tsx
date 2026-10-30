import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { formatDay } from "@/lib/format";
import type { Project } from "@/types";
import { anclaPlano, carpetaDeCorridas, tituloGrupo, type GrupoVista, type PlanoCarpeta } from "../lib/rondas";
import { EnlaceCorrida } from "./tabla-corridas";

/** Como en «Comparar corridas lado a lado». */
const MAXIMO_COMPARAR = 9;

/**
 * «Corridas de prueba»: la carpeta donde quedan las corridas que no salen en el panel ni en Proyectos. Por plano, una
 * fila por grupo de rondas con las corridas de cada modelo; al final, las corridas de prueba que no son de ninguna ronda.
 */
export function CarpetaCorridas({ grupos, otras }: { grupos: GrupoVista[]; otras: Project[] | null }) {
  const planos = carpetaDeCorridas(grupos);
  const total = planos.reduce((n, p) => n + p.corridas, 0);
  return (
    <section id="corridas" aria-labelledby="titulo-corridas" className="flex scroll-mt-4 flex-col gap-3">
      <div>
        <h2 id="titulo-corridas" className="flex items-center gap-2 text-base font-semibold">
          <FolderOpen aria-hidden className="size-4 text-brand" />
          Corridas de prueba
        </h2>
        <p className="text-sm text-muted-foreground">
          Las {total} corridas de las rondas, por plano. No salen en el panel ni en Proyectos, que muestran solo lo que hace el usuario. Cada botón abre una
          corrida; «Comparar» las pone lado a lado.
        </p>
      </div>
      {planos.length ? (
        <nav aria-label="Planos de la carpeta" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {planos.map((p) => (
            <a key={p.plano} href={`#${anclaPlano(p.plano)}`} className="text-brand hover:underline">
              {p.plano} ({p.corridas})
            </a>
          ))}
          {otras?.length ? (
            <a href="#corridas-otras" className="text-brand hover:underline">
              Otras corridas de prueba ({otras.length})
            </a>
          ) : null}
        </nav>
      ) : null}
      <div className="flex flex-col gap-2">
        {planos.map((p) => (
          <PlanoDeLaCarpeta key={p.plano} plano={p} />
        ))}
      </div>
      {otras?.length ? (
        <details id="corridas-otras" className="scroll-mt-4 rounded-lg border bg-card p-3">
          <summary className="cursor-pointer text-sm font-semibold">Otras corridas de prueba ({otras.length})</summary>
          <p className="mt-2 text-xs text-muted-foreground">Corridas con nombre de prueba que no son de ninguna ronda (pruebas a mano, ensayos sueltos).</p>
          <ul className="mt-2 flex flex-col divide-y text-sm" data-testid="otras-corridas">
            {otras.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <Link href={`/projects/${encodeURIComponent(p.id)}/precheck`} className="text-brand hover:underline">
                  {p.name}
                </Link>
                <span className="tabular text-xs text-muted-foreground">{formatDay(p.updatedAt.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function PlanoDeLaCarpeta({ plano: p }: { plano: PlanoCarpeta }) {
  return (
    <details id={anclaPlano(p.plano)} className="scroll-mt-4 rounded-lg border bg-card">
      <summary className="cursor-pointer p-3 text-sm font-semibold">
        {p.plano} <span className="font-normal text-muted-foreground">· {p.corridas} corridas</span>
      </summary>
      <div className="max-h-[32rem] overflow-auto border-t">
        <table className="w-full text-sm">
          <caption className="sr-only">Corridas de prueba de {p.plano} por grupo de rondas y modelo</caption>
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="p-2.5 font-medium">
                Rondas
              </th>
              {p.modelos.map((m) => (
                <th key={m} scope="col" className="p-2.5 font-medium">
                  {m}
                </th>
              ))}
              <th scope="col" className="p-2.5 font-medium">
                <span className="sr-only">Comparar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {p.filas.map((f) => {
              const ids = [...f.celdas.values()].flat().flatMap((x) => (x.corrida.terminada && x.corrida.projectId ? [x.corrida.projectId] : []));
              return (
                <tr key={f.grupo.id} className="border-t align-top">
                  <th scope="row" className="p-2.5 text-left font-normal whitespace-nowrap">
                    {tituloGrupo(f.grupo)}
                  </th>
                  {p.modelos.map((m) => (
                    <td key={m} className="p-1.5">
                      <div className="flex flex-wrap gap-1">
                        {(f.celdas.get(m) ?? []).map((x, i) => (
                          <EnlaceCorrida key={x.corrida.precheckId ?? `${x.ronda}-${i}`} x={x} numero={i + 1} />
                        ))}
                      </div>
                    </td>
                  ))}
                  <td className="p-2.5">
                    {ids.length >= 2 ? (
                      <Link href={`/projects/compare?ids=${ids.slice(0, MAXIMO_COMPARAR).join(",")}`} className="text-xs font-medium text-brand hover:underline">
                        Comparar
                        <span className="sr-only"> las corridas de {tituloGrupo(f.grupo).toLowerCase()} de {p.plano}</span>
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
