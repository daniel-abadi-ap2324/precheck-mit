import { CircleHelp, FileText, GitCommitHorizontal } from "lucide-react";
import { ToneBadge } from "@/components/status";
import { formatDay } from "@/lib/format";
import { costoMedio, etapaMeta, formatoUsd, textosDeGrupo, tituloGrupo, type GrupoVista } from "../lib/rondas";
import { Chip } from "./indicadores";
import { TablaGrupo } from "./tabla-corridas";

const SIN_DOCUMENTAR = { label: "Sin documentar", tone: "neutral" as const, icon: CircleHelp };

/** Un grupo de rondas: qué cambió, qué resultado dio y la tabla plano × modelo de sus corridas; sus rondas, en el detalle técnico. */
export function TarjetaGrupo({ grupo: g }: { grupo: GrupoVista }) {
  const etapa = etapaMeta[g.etapa];
  const usd = costoMedio(g.corridas);
  const terminadas = g.corridas.filter((c) => c.terminada).length;
  const documentado = g.rondas.some((r) => r.documentada);
  const { cambio, resultado } = textosDeGrupo(g);
  const modelos = [...new Set(g.rondas.flatMap((r) => r.modelos))];
  const planos = [...new Set(g.rondas.flatMap((r) => r.planos))];
  const titulo = tituloGrupo(g.grupo);
  return (
    <article aria-labelledby={`grupo-${g.grupo.id}`} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {g.fecha ? <span className="tabular">{formatDay(g.fecha)}</span> : null}
            {g.etapa !== "sin-etapa" ? <ToneBadge meta={{ label: etapa.label, tone: etapa.tone, icon: etapa.icon }} size="sm" /> : null}
            {documentado ? null : <ToneBadge meta={SIN_DOCUMENTAR} size="sm" />}
          </p>
          <h3 id={`grupo-${g.grupo.id}`} className="mt-1 text-base font-semibold">
            {titulo}
            {g.grupo.titulo ? <span className="font-normal"> · {g.grupo.titulo}</span> : null}
          </h3>
        </div>
        {g.corridas.length ? (
          <div className="text-right text-xs text-muted-foreground">
            <p>
              {terminadas} de {g.corridas.length} corridas terminadas
            </p>
            {usd === null ? null : <p className="tabular">{formatoUsd(usd)} por revisión</p>}
          </div>
        ) : null}
      </header>

      {documentado ? (
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          <Bloque titulo="Qué cambié" texto={cambio} />
          <Bloque titulo="Resultado" texto={resultado} />
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">De este grupo hay resultados, pero no se anotó qué se cambió.</p>
      )}

      {modelos.length || planos.length ? (
        <div className="flex flex-col gap-1.5 text-xs">
          {modelos.length ? (
            <p className="flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground">Modelos:</span>
              {modelos.map((m) => (
                <Chip key={m}>{m}</Chip>
              ))}
            </p>
          ) : null}
          {planos.length ? (
            <p className="flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground">Planos:</span>
              {planos.map((p) => (
                <Chip key={p}>{p}</Chip>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}

      <TablaGrupo grupo={g} />

      {documentado ? (
        <details className="rounded-md border border-dashed p-2.5 text-sm" data-testid="detalle-tecnico">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Detalle técnico (para el equipo de desarrollo)</summary>
          <div className="mt-2 flex flex-col gap-3">
            {g.rondas.map((r) => (
              <div key={r.ronda} className="flex flex-col gap-2">
                <p className="text-xs font-semibold">
                  Ronda {r.ronda}
                  {r.titulo ? <span className="font-normal"> · {r.titulo}</span> : null}
                  {r.tanda ? <span className="font-normal text-muted-foreground"> · lote {r.tanda}</span> : null}
                </p>
                {r.documentada ? (
                  <dl className="grid gap-2 md:grid-cols-3">
                    <Bloque titulo="Cambio (detalle)" texto={r.cambio} />
                    <Bloque titulo="Por qué" texto={r.hipotesis} />
                    <Bloque titulo="Resultado (detalle)" texto={r.resultado ?? r.efecto} />
                  </dl>
                ) : (
                  <p className="text-xs text-muted-foreground">Sin documentar.</p>
                )}
                {r.informe || r.commits.length ? (
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {r.informe ? (
                      <span className="inline-flex items-center gap-1">
                        <FileText aria-hidden className="size-3.5" />
                        Informe: <code className="text-foreground">{r.informe}</code>
                      </span>
                    ) : null}
                    {r.commits.length ? (
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <GitCommitHorizontal aria-hidden className="size-3.5" />
                        Versiones del código:
                        {r.commits.map((c) => (
                          <code key={c} className="text-foreground">
                            {c}
                          </code>
                        ))}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function Bloque({ titulo, texto }: { titulo: string; texto: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-muted/50 p-2.5">
      <dt className="text-xs font-medium text-muted-foreground">{titulo}</dt>
      <dd className="whitespace-pre-line">{texto ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}
