import Link from "next/link";
import { CircleSlash } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CorridaRonda } from "@/services/rondas/tipos";
import { costoMedio, formatoPorcentaje, formatoUsd, tituloGrupo, type CorridaCarpeta, type GrupoVista } from "../lib/rondas";
import { NivelCorto } from "./indicadores";

/**
 * Tabla plano × modelo de un grupo de rondas: en cada celda, las corridas (1, 2, 3…) con su clasificación y, si el
 * modelo repitió el plano, cuánto se repite y cuánto coincide con la mayoría.
 */
export function TablaGrupo({ grupo: g }: { grupo: GrupoVista }) {
  const planos = [...new Set(g.corridas.map((c) => c.plano))].sort((a, b) => a.localeCompare(b, "es"));
  const modelos = g.modelos.map((m) => m.modelo);
  if (!planos.length) return null;
  return (
    <div className="overflow-x-auto">
      <Table aria-label={`Corridas de ${tituloGrupo(g.grupo).toLowerCase()}`} className="rounded-md border bg-card">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Plano</TableHead>
            {modelos.map((m) => (
              <TableHead key={m} scope="col">
                {m}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {planos.map((p) => {
            const estable = g.estabilidad.find((e) => e.plano === p);
            return (
              <TableRow key={p} className="align-top">
                <TableHead scope="row" className="font-medium whitespace-normal">
                  {p}
                </TableHead>
                {modelos.map((m) => {
                  const cs = g.rondas.flatMap((r) => r.corridas.filter((c) => c.plano === p && c.modelo === m).map((c) => ({ c, ronda: r.ronda })));
                  const medida = estable?.todas.modelos.find((x) => x.modelo === m);
                  const usd = costoMedio(cs.map((x) => x.c));
                  return (
                    <TableCell key={m} className="whitespace-normal">
                      {cs.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap gap-1">
                            {cs
                              .sort((a, b) => a.ronda - b.ronda || a.c.repeticion - b.c.repeticion)
                              .map(({ c, ronda }, i) => {
                                const e = estable?.corridas.find((x) => x.precheckId === c.precheckId);
                                return <EnlaceCorrida key={c.precheckId ?? `${ronda}-${i}`} x={{ corrida: c, ronda, nivel: e?.nivel ?? null, superficial: e?.superficial ?? false }} numero={i + 1} />;
                              })}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {medida && medida.entreRepeticiones.pares > 0 && medida.entreRepeticiones.acuerdoCatalogo !== null
                              ? `Se repite ${formatoPorcentaje(medida.entreRepeticiones.acuerdoCatalogo)}`
                              : cs.length > 1
                                ? "Sin medir"
                                : "Una sola corrida"}
                            {medida && estable && estable.todas.corridas > 1 ? ` · con la mayoría ${formatoPorcentaje(medida.acuerdoMayoria)}` : ""}
                            {usd === null ? "" : ` · ${formatoUsd(usd)}`}
                          </span>
                        </div>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function detalle(c: CorridaRonda, ronda: number): string {
  const partes = [`ronda ${ronda}${c.repeticion > 1 ? `, repetición ${c.repeticion}` : ""}`];
  if (c.usd !== null) partes.push(formatoUsd(c.usd));
  if (c.minutos !== null) partes.push(`${Math.round(c.minutos)} min`);
  return partes.join(" · ");
}

/** Una corrida: su número y su clasificación, enlazada a su revisión; si no terminó, en gris con su error. */
export function EnlaceCorrida({ x, numero }: { x: CorridaCarpeta; numero: number }) {
  const c = x.corrida;
  const titulo = `${c.plano} con ${c.modelo}: ${detalle(c, x.ronda)}`;
  const contenido = (
    <>
      <span className="tabular text-xs font-medium">{numero}</span>
      {c.terminada ? (
        <NivelCorto nivel={x.nivel} />
      ) : (
        <span className="inline-flex items-center gap-0.5 text-2xs text-ink-muted">
          <CircleSlash aria-hidden className="size-3" />
          no terminó
        </span>
      )}
      {x.superficial ? <span className="text-2xs text-warning">superficial</span> : null}
    </>
  );
  const clase = "inline-flex min-w-16 flex-col items-center gap-0.5 rounded-md border px-1.5 py-1";
  if (!c.projectId)
    return (
      <span className={clase} title={c.error ? `${titulo}\nNo terminó: ${c.error}` : titulo}>
        {contenido}
      </span>
    );
  return (
    <Link
      href={`/projects/${encodeURIComponent(c.projectId)}/precheck`}
      title={c.error ? `${titulo}\nNo terminó: ${c.error}` : titulo}
      className={`${clase} bg-card hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none`}
    >
      {contenido}
      <span className="sr-only">
        {" "}
        (abrir la corrida {numero} de {c.plano} con {c.modelo}, {detalle(c, x.ronda)})
      </span>
    </Link>
  );
}
