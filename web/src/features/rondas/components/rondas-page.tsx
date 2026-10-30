"use client";

import Link from "next/link";
import { useMemo } from "react";
import { History, Repeat, RefreshCw } from "lucide-react";
import { Callout, EmptyState, ErrorState, PageHeader, PreliminaryNotice, SkeletonRows } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/use-api";
import { formatDate } from "@/lib/format";
import type { RespuestaRondas } from "@/services/rondas/tipos";
import type { Project } from "@/types";
import { useRecalcularMetricas, useRondas } from "../hooks/use-rondas";
import { esDeepSeek, FACTOR_REAL_DEEPSEEK, formatoPorcentaje, formatoUsd, gruposVista, tituloGrupo, ultimoConRepeticiones, type GrupoVista } from "../lib/rondas";
import { GLOSARIO } from "../lib/glosario";
import { CarpetaCorridas } from "./carpeta-corridas";
import { Niveles, Porcentaje } from "./indicadores";
import { ListaCambios } from "./lista-cambios";

const SECCIONES = [
  { id: "conclusion", label: "Conclusión" },
  { id: "estabilidad", label: "Cuánto se repite cada modelo" },
  { id: "cambios", label: "Cómo llegamos aquí" },
  { id: "corridas", label: "Corridas de prueba" },
  { id: "glosario", label: "Qué significa cada término" },
];

const COMANDO = "python scripts/analisis/rondas.py";

/** /rondas: cuánto se repite cada modelo, qué cambios probamos ronda por ronda y la carpeta de corridas de prueba. */
export function RondasPage() {
  const { data, isLoading, error, refetch } = useRondas();
  const pruebas = useProjects({ pruebas: "solo" });
  const recalcular = useRecalcularMetricas();
  // Corridas con nombre de prueba que no son de ninguna ronda: van a «Otras corridas de prueba».
  const otras = useMemo(() => {
    if (!data || !pruebas.data) return null;
    const enRondas = new Set(data.rondas.flatMap((r) => r.corridas.flatMap((c) => (c.projectId ? [c.projectId] : []))));
    return pruebas.data.items.filter((p) => !enRondas.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [data, pruebas.data]);

  let cuerpo;
  if (error) cuerpo = <ErrorState error={error} onRetry={() => void refetch()} />;
  else if (isLoading || !data) cuerpo = <SkeletonRows rows={5} />;
  else cuerpo = <RondasVista datos={data} otras={otras} />;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Rondas de mejora"
        description="Cuánto se repite cada modelo de IA al revisar el mismo plano, qué cambios probamos y todas las corridas de prueba."
      />
      <PreliminaryNotice compact />
      {cuerpo}
      <details className="rounded-lg border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-medium">Para el equipo técnico</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-muted-foreground">
            Vuelve a calcular las cifras de cada corrida (lo mismo que <code className="rounded bg-muted px-1">{COMANDO}</code>) y cuánto se parecen las corridas
            de cada plano entre sí.
          </p>
          <Button variant="outline" size="sm" className="self-start" onClick={() => recalcular.mutate()} disabled={recalcular.isPending}>
            <RefreshCw aria-hidden className={recalcular.isPending ? "size-3.5 animate-spin" : "size-3.5"} />
            {recalcular.isPending ? "Recalculando… (hasta 5 min)" : "Recalcular métricas"}
          </Button>
          {recalcular.isError ? <ErrorState variant="inline" error={recalcular.error} onRetry={() => recalcular.mutate()} /> : null}
          {recalcular.isSuccess ? (
            <Callout tone={recalcular.data.aviso ? "warning" : "pass"} title="Métricas recalculadas">
              {recalcular.data.rondas} rondas con {recalcular.data.corridas} corridas
              {recalcular.data.generado ? ` (generadas ${formatDate(recalcular.data.generado)})` : ""}.
              {recalcular.data.estabilidad
                ? ` Estabilidad: ${recalcular.data.estabilidad.planos} planos medidos${recalcular.data.estabilidad.sinLeer ? `, ${recalcular.data.estabilidad.sinLeer} corridas sin leer` : ""}.`
                : ""}
              {recalcular.data.aviso ? ` ${recalcular.data.aviso}` : ""}
            </Callout>
          ) : null}
        </div>
      </details>
    </div>
  );
}

/** Contenido con los datos ya leídos (separado para probarlo sin red). */
export function RondasVista({ datos, otras = null }: { datos: RespuestaRondas; otras?: Project[] | null }) {
  const grupos = useMemo(() => gruposVista(datos.rondas, datos.grupos, datos.estabilidad), [datos]);
  const { faltantes } = datos;

  return (
    <div className="flex flex-col gap-5">
      {datos.avisos.map((a) => (
        <Callout key={a} tone="warning" title="Aviso">
          {a}
        </Callout>
      ))}
      {faltantes.metricas ? (
        <Callout tone="info" title="Sin métricas">
          Todavía no hay cifras por corrida. Ejecuta <code className="rounded bg-muted px-1">{COMANDO}</code> desde la raíz del repositorio (o el botón
          «Recalcular métricas») para calcularlas; se guardan en web/.data/rondas-metricas.json.
        </Callout>
      ) : null}
      {faltantes.catalogo ? (
        <Callout tone="info" title="Sin catálogo">
          Falta docs/demo/rondas.json (qué cambió en cada ronda, por qué y qué efecto tuvo): las rondas se listan como «sin documentar», solo con sus cifras.
        </Callout>
      ) : null}
      {datos.generado ? (
        <p className="text-xs text-muted-foreground">
          Cifras calculadas el {formatDate(datos.generado)}
          {datos.estabilidad?.generado ? ` · estabilidad entre corridas, el ${formatDate(datos.estabilidad.generado)}` : ""}
        </p>
      ) : null}

      {datos.rondas.length === 0 ? (
        <EmptyState
          icon={History}
          title="Todavía no hay rondas"
          body={`Escribe el catálogo docs/demo/rondas.json y ejecuta ${COMANDO} para ver aquí cómo mejoró el pipeline.`}
        />
      ) : (
        <>
          <nav aria-label="Secciones de la página" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {SECCIONES.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="text-brand hover:underline">
                {s.label}
              </a>
            ))}
          </nav>
          <Conclusion grupos={grupos} medida={datos.estabilidad !== null} />
          <EstabilidadPorGrupo grupos={grupos} />
          <ListaCambios grupos={grupos} />
          <CarpetaCorridas grupos={grupos} otras={otras} />
          <Glosario />
        </>
      )}
    </div>
  );
}

const usdDe = (modelo: string, usd: number | null) =>
  usd === null ? null : esDeepSeek(modelo) ? `unos ${formatoUsd(usd / FACTOR_REAL_DEEPSEEK)} reales por revisión` : `${formatoUsd(usd)} por revisión`;

/**
 * Lo que hay que llevarse de la página: cuánto se repite cada modelo en el grupo más reciente con repeticiones. Las
 * cifras salen del cálculo del servidor; no hay ninguna medida contra respuestas «correctas» porque no están confirmadas.
 */
function Conclusion({ grupos, medida }: { grupos: GrupoVista[]; medida: boolean }) {
  const g = ultimoConRepeticiones(grupos);
  return (
    <section id="conclusion" aria-labelledby="titulo-conclusion" className="scroll-mt-4 rounded-lg border border-brand/40 bg-card p-4">
      <h2 id="titulo-conclusion" className="text-base font-semibold">
        Conclusión
      </h2>
      {!medida ? (
        <p className="mt-2 text-sm text-muted-foreground">Todavía no se midió cuánto se parecen las corridas entre sí. Pulse «Recalcular métricas» al final de la página.</p>
      ) : !g ? (
        <p className="mt-2 text-sm text-muted-foreground">Todavía no hay un grupo de rondas en el que un modelo haya revisado el mismo plano más de una vez.</p>
      ) : (
        <>
          <p className="mt-2 text-sm">
            En el grupo más reciente con repeticiones ({tituloGrupo(g.grupo).toLowerCase()}
            {g.grupo.titulo ? `, «${g.grupo.titulo}»` : ""}) cada modelo revisó los mismos planos varias veces. Esto es cuánto se repite cada uno:
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm" data-testid="conclusion-modelos">
            {g.modelos.map((m) => {
              const costo = usdDe(m.modelo, m.usd);
              return (
                <li key={m.modelo}>
                  <strong>{m.modelo}</strong>
                  {m.seRepite === null
                    ? `: una sola corrida por plano, no se puede saber cuánto se repite`
                    : `: entre sus repeticiones dice lo mismo en el ${formatoPorcentaje(m.seRepite)} de las reglas${m.hallazgosRepiten === null ? "" : ` y en el ${formatoPorcentaje(m.hallazgosRepiten)} de los hallazgos`}`}
                  {m.conMayoria === null ? "" : `; coincide con la mayoría de las corridas en el ${formatoPorcentaje(m.conMayoria)}`}
                  {costo ? `; ${costo}` : ""} ({m.corridas} {m.corridas === 1 ? "corrida" : "corridas"}).
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            Todavía no hay una referencia confirmada de las respuestas correctas: estas cifras dicen cuánto se repite cada modelo y cuánto coincide con los demás,
            no si acierta. Que un modelo se repita mucho no basta: puede repetir el mismo error.
          </p>
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Para ver las corridas lado a lado, regla por regla, use{" "}
        <Link href="/projects/compare" className="text-brand hover:underline">
          Comparar modelos
        </Link>
        . ¿Algún término no queda claro? Están explicados al final, en{" "}
        <a href="#glosario" className="text-brand hover:underline">
          Qué significa cada término
        </a>
        .
      </p>
    </section>
  );
}

/** Cuánto se repite cada modelo en cada grupo con repeticiones, del más reciente al más antiguo. */
function EstabilidadPorGrupo({ grupos }: { grupos: GrupoVista[] }) {
  const conRep = grupos.filter((g) => g.conRepeticiones);
  const modelos = [...new Set(conRep.flatMap((g) => g.modelos.filter((m) => m.seRepite !== null).map((m) => m.modelo)))];
  return (
    <section id="estabilidad" aria-labelledby="titulo-estabilidad" className="flex scroll-mt-4 flex-col gap-3">
      <div>
        <h2 id="titulo-estabilidad" className="flex items-center gap-2 text-base font-semibold">
          <Repeat aria-hidden className="size-4 text-brand" />
          Cuánto se repite cada modelo
        </h2>
        <p className="text-sm text-muted-foreground">
          En cada grupo de rondas con repeticiones: de las reglas que decidieron dos corridas del mismo modelo y el mismo plano, en qué parte dicen lo mismo
          (media de los planos). Debajo, cómo quedaron clasificadas sus corridas frente a las demás del plano.
        </p>
      </div>
      {conRep.length === 0 ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Ningún grupo tiene todavía repeticiones medidas.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[36rem] text-sm" data-testid="estabilidad-grupos">
            <caption className="sr-only">Cuánto se repite cada modelo por grupo de rondas</caption>
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th scope="col" className="p-2.5 font-medium">
                  Grupo
                </th>
                {modelos.map((m) => (
                  <th key={m} scope="col" className="p-2.5 font-medium">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conRep.map((g) => (
                <tr key={g.grupo.id} className="border-b align-top last:border-0">
                  <th scope="row" className="p-2.5 text-left font-normal">
                    <span className="whitespace-nowrap">{tituloGrupo(g.grupo)}</span>
                    {g.grupo.titulo ? <span className="block max-w-56 text-xs text-muted-foreground">{g.grupo.titulo}</span> : null}
                  </th>
                  {modelos.map((nombre) => {
                    const m = g.modelos.find((x) => x.modelo === nombre);
                    return (
                      <td key={nombre} className="p-2.5">
                        {m ? (
                          <div className="flex flex-col gap-0.5">
                            <Porcentaje valor={m.seRepite} vacio="una corrida" />
                            {m.conMayoria === null ? null : <span className="text-xs text-muted-foreground">con la mayoría {formatoPorcentaje(m.conMayoria)}</span>}
                            <Niveles niveles={m.niveles} />
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** «Cómo leer esta página»: los términos que usa la página, definidos una vez (lib/glosario.ts). */
function Glosario() {
  return (
    <section id="glosario" aria-labelledby="titulo-glosario" className="scroll-mt-4">
      <details className="rounded-lg border bg-card p-4">
        <summary id="titulo-glosario" className="cursor-pointer text-base font-semibold">
          Qué significa cada término
        </summary>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
          {GLOSARIO.map((g) => (
            <div key={g.termino}>
              <dt className="font-medium">{g.termino}</dt>
              <dd className="text-muted-foreground">{g.definicion}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
