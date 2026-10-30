"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Bookmark, Columns3, Download, GitCompare, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { Callout, EmptyState, ErrorState, SkeletonRows } from "@/components/common";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRecalcularMetricas, useRondas } from "@/features/rondas/hooks/use-rondas";
import { etapaMeta, formatoPorcentaje, type EtapaClave } from "@/features/rondas/lib/rondas";
import {
  agrupar,
  AGRUPACIONES,
  aCsv,
  COLUMNAS,
  COLUMNAS_INICIALES,
  etiquetaRondas,
  filasDe,
  FILTROS_VACIOS,
  filtrarFilas,
  ordenar,
  textoNiveles,
  type Agrupar,
  type ColumnaId,
  type FiltrosExplorador,
  type Registro,
  type VistaGuardada,
} from "../lib/explorador";
import { colorDe, GraficoPorGrupo, GraficoRepeticionCosto } from "./graficos-explorador";

/** Corridas que se pueden comparar lado a lado a la vez (tres modelos con tres repeticiones). */
export const MAXIMO_COMPARAR = 9;
// «.v2»: las vistas y el estado guardados antes medían exactitud; no se reutilizan.
const CLAVE_VISTAS = "precheck.explorador.vistas.v2";
const CLAVE_ESTADO = "precheck.explorador.estado.v2";
const ORDEN_MODELOS = ["Sonnet 5.5", "Opus 5.5", "Fable 5.1", "DeepSeek Flash", "Haiku 5.5"];

function leerLocal<T>(clave: string, defecto: T): T {
  try {
    const v = window.localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : defecto;
  } catch {
    return defecto;
  }
}
function guardarLocal(clave: string, valor: unknown) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: la pantalla funciona igual, solo no recuerda */
  }
}

function alternar<T>(lista: T[], v: T): T[] {
  return lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v];
}

function GrupoChecks<T extends string>({ titulo, opciones, elegidas, onChange }: { titulo: string; opciones: { valor: T; etiqueta: string; n: number }[]; elegidas: T[]; onChange: (v: T[]) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
        {elegidas.length ? (
          <button type="button" className="font-normal normal-case underline" onClick={() => onChange([])}>
            Quitar ({elegidas.length})
          </button>
        ) : null}
      </legend>
      {opciones.map((o) => (
        <label key={o.valor} className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-3.5 accent-[var(--chart-1)]" checked={elegidas.includes(o.valor)} onChange={() => onChange(alternar(elegidas, o.valor))} />
          <span className="min-w-0 flex-1 truncate">{o.etiqueta}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{o.n}</span>
        </label>
      ))}
    </fieldset>
  );
}

const vacio = <span className="text-muted-foreground">—</span>;

function celda(r: Registro, col: ColumnaId, modelos: string[]) {
  switch (col) {
    case "acuerdoRepeticiones":
    case "solapamientoRepeticiones":
    case "acuerdoEntreModelos":
    case "acuerdoTodas":
    case "solapamientoTodas":
    case "acuerdoMayoria":
    case "datos": {
      const v = r[col];
      return v === null ? vacio : <span className="tabular-nums">{formatoPorcentaje(v)}</span>;
    }
    case "usd":
      return r.usd === null ? vacio : <span className="tabular-nums">{r.usd.toFixed(2)}</span>;
    case "minutos":
    case "decisiones":
    case "hallazgos":
    case "infoRequerida": {
      const v = r[col];
      return v === null ? vacio : <span className="tabular-nums">{Number.isInteger(v) ? v : v.toFixed(1)}</span>;
    }
    case "corridas":
    case "superficiales":
      return <span className="tabular-nums">{r[col]}</span>;
    case "niveles":
      return <span className="text-xs">{textoNiveles(r.niveles) || "—"}</span>;
    case "rondas":
      return r.rondas === null ? (
        <span className="text-muted-foreground">varias</span>
      ) : (
        <span className="tabular-nums" title={r.titulo ?? undefined}>
          {etiquetaRondas(r.rondas)}
        </span>
      );
    case "modelo":
      return r.modelo === null ? (
        <span className="text-muted-foreground">varios</span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full" style={{ background: colorDe(modelos, r.modelo) }} />
          {r.modelo}
        </span>
      );
    case "plano":
      return r.plano ?? <span className="text-muted-foreground">varios</span>;
    case "etapa":
      return r.etapa ? etapaMeta[r.etapa as EtapaClave].label : <span className="text-muted-foreground">varias</span>;
    case "fecha":
      return r.fecha ? formatDate(r.fecha) : <span className="text-muted-foreground">—</span>;
  }
}

/**
 * Estabilidad por ronda (ADR-0015): cuánto se repite cada modelo entre sus corridas y cuánto coincide con la mayoría,
 * por grupo de rondas, plano y modelo. Filtros a la izquierda, tabla ordenable con las columnas que se elijan (por
 * fila o promediada), tres gráficos y exportación a CSV. Nada se mide contra respuestas «correctas»: todavía no hay
 * una referencia confirmada.
 */
export function Explorador({ onComparar }: { onComparar: (ids: string[]) => void }) {
  const { data, isLoading, error, refetch } = useRondas();
  const recalcular = useRecalcularMetricas();
  const [filtros, setFiltros] = useState<FiltrosExplorador>(FILTROS_VACIOS);
  const [por, setPor] = useState<Agrupar>("fila");
  const [columnas, setColumnas] = useState<ColumnaId[]>(COLUMNAS_INICIALES);
  const [orden, setOrden] = useState<{ col: ColumnaId; asc: boolean }>({ col: "rondas", asc: false });
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [verColumnas, setVerColumnas] = useState(false);
  const [vistas, setVistas] = useState<VistaGuardada[]>([]);
  const [nombreVista, setNombreVista] = useState("");
  const [listo, setListo] = useState(false);

  // Leer localStorage solo se puede en el navegador, después del primer render (en el servidor no existe).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const e = leerLocal<{ filtros: FiltrosExplorador; por: Agrupar; columnas: ColumnaId[]; orden: { col: ColumnaId; asc: boolean } } | null>(CLAVE_ESTADO, null);
    if (e) {
      setFiltros({ ...FILTROS_VACIOS, ...e.filtros });
      setPor(e.por);
      setColumnas(e.columnas.length ? e.columnas : COLUMNAS_INICIALES);
      setOrden(e.orden);
    }
    setVistas(leerLocal<VistaGuardada[]>(CLAVE_VISTAS, []));
    setListo(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (listo) guardarLocal(CLAVE_ESTADO, { filtros, por, columnas, orden });
  }, [listo, filtros, por, columnas, orden]);

  const filas = useMemo(() => filasDe(data?.estabilidad?.planos ?? [], data?.rondas ?? [], data?.grupos ?? [], filtros.sinSuperficiales), [data, filtros.sinSuperficiales]);
  const modelos = useMemo(() => [...new Set(filas.map((f) => f.modelo))].sort((a, b) => (ORDEN_MODELOS.indexOf(a) + 1 || 99) - (ORDEN_MODELOS.indexOf(b) + 1 || 99)), [filas]);
  const planos = useMemo(() => [...new Set(filas.map((f) => f.plano))].sort(), [filas]);
  const etapas = useMemo(() => [...new Set(filas.map((f) => f.etapa))], [filas]);
  const rondasTodas = useMemo(() => filas.map((f) => f.rondas[0]), [filas]);
  const [minRonda, maxRonda] = [Math.min(...rondasTodas, 0), Math.max(...rondasTodas, 0)];

  const filtradas = useMemo(() => filtrarFilas(filas, filtros), [filas, filtros]);
  const registros = useMemo(() => ordenar(agrupar(filtradas, por), orden.col, orden.asc), [filtradas, por, orden]);
  const columnasVisibles = COLUMNAS.filter((c) => columnas.includes(c.id));
  const cuentan = (campo: "plano" | "modelo" | "etapa", v: string) => filas.filter((f) => f[campo] === v).length;

  const filtrosActivos =
    filtros.planos.length +
    filtros.modelos.length +
    filtros.etapas.length +
    (filtros.desde !== null || filtros.hasta !== null ? 1 : 0) +
    (filtros.soloConRepeticiones ? 1 : 0) +
    (filtros.sinSuperficiales ? 1 : 0) +
    (filtros.texto ? 1 : 0);
  // Se comparan corridas del mismo plano: las de las filas elegidas.
  const planoElegido = por === "fila" ? (registros.find((r) => elegidas.includes(r.clave))?.plano ?? null) : null;
  const corridasElegidas = registros.filter((r) => elegidas.includes(r.clave)).flatMap((r) => r.projectIds);

  const ordenarPor = (col: ColumnaId) => setOrden((o) => ({ col, asc: o.col === col ? !o.asc : COLUMNAS.find((c) => c.id === col)?.numerica === false }));
  const descargar = () => {
    const blob = new Blob(["﻿", aCsv(registros, columnasVisibles.map((c) => c.id))], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estabilidad-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const guardarVista = () => {
    const nombre = nombreVista.trim();
    if (!nombre) return;
    const nuevas = [...vistas.filter((v) => v.nombre !== nombre), { nombre, filtros, agrupar: por, columnas }];
    setVistas(nuevas);
    guardarLocal(CLAVE_VISTAS, nuevas);
    setNombreVista("");
  };
  const aplicarVista = (v: VistaGuardada) => {
    setFiltros({ ...FILTROS_VACIOS, ...v.filtros });
    setPor(v.agrupar);
    setColumnas(v.columnas);
    setElegidas([]);
  };
  const borrarVista = (nombre: string) => {
    const nuevas = vistas.filter((v) => v.nombre !== nombre);
    setVistas(nuevas);
    guardarLocal(CLAVE_VISTAS, nuevas);
  };

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <SkeletonRows rows={6} />;
  if (!data.estabilidad) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState title="Falta calcular la estabilidad" body="Pulse «Actualizar datos»: lee las corridas terminadas de cada ronda y mide cuánto se repiten." />
        <Button className="self-center" onClick={() => recalcular.mutate()} disabled={recalcular.isPending}>
          <RefreshCw aria-hidden className={cn("size-3.5", recalcular.isPending && "animate-spin")} />
          {recalcular.isPending ? "Actualizando…" : "Actualizar datos"}
        </Button>
        {recalcular.isError ? <ErrorState variant="inline" error={recalcular.error} onRetry={() => recalcular.mutate()} /> : null}
      </div>
    );
  }
  if (!filas.length) return <EmptyState title="Todavía no hay corridas terminadas" body="Cuando haya revisiones con IA, aparecen aquí. Pulse «Actualizar datos» si ya las hizo." />;

  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-5 lg:sticky lg:top-4 lg:self-start" aria-label="Filtros">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Filtros{filtrosActivos ? ` (${filtrosActivos})` : ""}</h2>
          <Button variant="ghost" size="sm" disabled={!filtrosActivos} onClick={() => setFiltros(FILTROS_VACIOS)}>
            <RotateCcw aria-hidden className="size-3.5" />
            Limpiar
          </Button>
        </div>
        <input
          type="search"
          value={filtros.texto}
          onChange={(e) => setFiltros({ ...filtros, texto: e.target.value })}
          placeholder="Buscar plano, modelo, ronda o título"
          aria-label="Buscar"
          className="h-9 rounded-md border bg-background px-3 text-sm"
        />
        <GrupoChecks titulo="Plano" opciones={planos.map((p) => ({ valor: p, etiqueta: p, n: cuentan("plano", p) }))} elegidas={filtros.planos} onChange={(v) => setFiltros({ ...filtros, planos: v })} />
        <GrupoChecks titulo="Modelo" opciones={modelos.map((m) => ({ valor: m, etiqueta: m, n: cuentan("modelo", m) }))} elegidas={filtros.modelos} onChange={(v) => setFiltros({ ...filtros, modelos: v })} />
        <GrupoChecks titulo="Etapa" opciones={etapas.map((e) => ({ valor: e, etiqueta: etapaMeta[e].label, n: cuentan("etapa", e) }))} elegidas={filtros.etapas} onChange={(v) => setFiltros({ ...filtros, etapas: v })} />
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rondas (primera del grupo)</legend>
          <div className="flex items-center gap-2 text-sm">
            <input type="number" min={minRonda} max={maxRonda} placeholder={String(minRonda)} aria-label="Desde la ronda" value={filtros.desde ?? ""} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value === "" ? null : Number(e.target.value) })} className="h-8 w-full rounded-md border bg-background px-2 tabular-nums" />
            <span aria-hidden>a</span>
            <input type="number" min={minRonda} max={maxRonda} placeholder={String(maxRonda)} aria-label="Hasta la ronda" value={filtros.hasta ?? ""} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value === "" ? null : Number(e.target.value) })} className="h-8 w-full rounded-md border bg-background px-2 tabular-nums" />
          </div>
          <div className="flex gap-2 text-xs">
            <button type="button" className="underline" onClick={() => setFiltros({ ...filtros, desde: Math.max(minRonda, maxRonda - 4), hasta: null })}>
              Últimas 5
            </button>
            <button type="button" className="underline" onClick={() => setFiltros({ ...filtros, desde: null, hasta: null })}>
              Todas
            </button>
          </div>
        </fieldset>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-3.5" checked={filtros.soloConRepeticiones} onChange={(e) => setFiltros({ ...filtros, soloConRepeticiones: e.target.checked })} />
          Solo con repeticiones (2 o más corridas del modelo)
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 size-3.5" checked={filtros.sinSuperficiales} onChange={(e) => setFiltros({ ...filtros, sinSuperficiales: e.target.checked })} />
          <span>
            Medir sin las corridas posiblemente superficiales
            <span className="block text-xs text-muted-foreground">Las que la web marcó con muy pocos hallazgos propios.</span>
          </span>
        </label>
        <div className="flex flex-col gap-2 border-t pt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Bookmark aria-hidden className="size-3.5" />
            Vistas guardadas
          </h3>
          {vistas.length ? (
            <ul className="flex flex-col gap-1">
              {vistas.map((v) => (
                <li key={v.nombre} className="flex items-center gap-1">
                  <button type="button" className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => aplicarVista(v)}>
                    {v.nombre}
                  </button>
                  <button type="button" aria-label={`Borrar la vista ${v.nombre}`} className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => borrarVista(v.nombre)}>
                    <Trash2 aria-hidden className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Guarde los filtros, el agrupado y las columnas actuales con un nombre.</p>
          )}
          <div className="flex gap-1">
            <input value={nombreVista} onChange={(e) => setNombreVista(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guardarVista()} placeholder="Nombre de la vista" aria-label="Nombre de la vista" className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" />
            <Button size="sm" variant="outline" onClick={guardarVista} disabled={!nombreVista.trim()}>
              Guardar
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Ver</span>
            <select value={por} onChange={(e) => { setPor(e.target.value as Agrupar); setElegidas([]); }} className="h-9 rounded-md border bg-background px-2 text-sm">
              {AGRUPACIONES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setVerColumnas((v) => !v)} aria-expanded={verColumnas}>
              <Columns3 aria-hidden className="size-3.5" />
              Columnas ({columnasVisibles.length})
            </Button>
            {verColumnas ? (
              <div className="absolute left-0 top-full z-20 mt-1 flex w-64 flex-col gap-1 rounded-lg border bg-popover p-3 shadow-md">
                {COLUMNAS.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-start gap-2 text-sm" title={c.ayuda}>
                    <input type="checkbox" className="mt-1 size-3.5" checked={columnas.includes(c.id)} onChange={() => setColumnas(alternar(columnas, c.id))} />
                    <span>
                      {c.label}
                      <span className="block text-xs text-muted-foreground">{c.ayuda}</span>
                    </span>
                  </label>
                ))}
                <button type="button" className="mt-1 self-start text-xs underline" onClick={() => setColumnas(COLUMNAS_INICIALES)}>
                  Columnas por defecto
                </button>
              </div>
            ) : null}
          </div>
          <Button variant="outline" size="sm" onClick={descargar} disabled={!registros.length}>
            <Download aria-hidden className="size-3.5" />
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => recalcular.mutate()} disabled={recalcular.isPending} className="ml-auto">
            <RefreshCw aria-hidden className={cn("size-3.5", recalcular.isPending && "animate-spin")} />
            {recalcular.isPending ? "Actualizando… (hasta 5 min)" : "Actualizar datos"}
          </Button>
        </div>
        {recalcular.isError ? <ErrorState variant="inline" error={recalcular.error} onRetry={() => recalcular.mutate()} /> : null}
        {recalcular.isSuccess ? (
          <Callout tone={recalcular.data.aviso ? "warning" : "pass"} title="Datos actualizados">
            {recalcular.data.rondas} rondas con {recalcular.data.corridas} corridas.
            {recalcular.data.estabilidad ? ` Estabilidad medida en ${recalcular.data.estabilidad.planos} combinaciones de grupo y plano.` : ""}
            {recalcular.data.aviso ? ` ${recalcular.data.aviso}` : ""}
          </Callout>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {filtradas.length} de {filas.length} filas (grupo × plano × modelo) · {registros.length} a la vista
          {data.estabilidad.generado ? ` · medido ${formatDate(data.estabilidad.generado)}` : ""}
          {data.estabilidad.sinLeer ? ` · ${data.estabilidad.sinLeer} corridas terminadas no se pudieron leer` : ""}. Todo se mide entre corridas: todavía no hay una referencia
          confirmada contra la que medir.
        </p>

        {registros.length ? (
          <div className="grid gap-5">
            <section className="flex min-w-0 flex-col gap-2 rounded-lg border p-4" aria-label="Cuánto se repite cada modelo">
              <h3 className="text-sm font-semibold">Cuánto se repite cada modelo</h3>
              <p className="text-xs text-muted-foreground">
                Acuerdo en las reglas del catálogo entre las corridas del mismo modelo, por grupo de rondas (promedio de los planos). Solo los grupos con dos o más corridas del
                modelo. Pase el cursor sobre una línea para resaltarla; pulse un modelo de la leyenda para ocultarlo.
              </p>
              <GraficoPorGrupo filas={filtradas} modelos={modelos} medida="acuerdoRepeticiones" etiqueta="Cuánto se repite" />
            </section>
            <section className="flex min-w-0 flex-col gap-2 rounded-lg border p-4" aria-label="Acuerdo con la mayoría">
              <h3 className="text-sm font-semibold">Acuerdo con la mayoría</h3>
              <p className="text-xs text-muted-foreground">En qué parte de las reglas y hallazgos dice cada modelo lo mismo que la mayoría de las corridas del plano en el grupo.</p>
              <GraficoPorGrupo filas={filtradas} modelos={modelos} medida="acuerdoMayoria" etiqueta="Acuerdo con la mayoría" />
            </section>
            <section className="flex min-w-0 flex-col gap-2 rounded-lg border p-4" aria-label="Acuerdo frente a costo">
              <h3 className="text-sm font-semibold">Acuerdo frente a costo</h3>
              <p className="text-xs text-muted-foreground">Cada punto es una fila de la tabla. Arriba a la izquierda: se repite más y cuesta menos.</p>
              <GraficoRepeticionCosto registros={registros} modelos={modelos} />
            </section>
          </div>
        ) : null}
        {elegidas.length ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm" role="status">
            <span>
              {corridasElegidas.length} {corridasElegidas.length === 1 ? "corrida elegida" : "corridas elegidas"}
              {planoElegido ? ` de ${planoElegido}` : ""}
            </span>
            <Button size="sm" disabled={corridasElegidas.length < 2 || corridasElegidas.length > MAXIMO_COMPARAR} onClick={() => onComparar(corridasElegidas)}>
              <GitCompare aria-hidden className="size-3.5" />
              Comparar lado a lado
            </Button>
            <button type="button" className="text-xs underline" onClick={() => setElegidas([])}>
              Quitar selección
            </button>
            {corridasElegidas.length < 2 || corridasElegidas.length > MAXIMO_COMPARAR ? (
              <span className="text-xs text-muted-foreground">Elija filas del mismo plano con 2 a {MAXIMO_COMPARAR} corridas en total.</span>
            ) : null}
          </div>
        ) : null}

        {registros.length ? (
          <div className="max-h-[36rem] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-left">
                <tr>
                  {por === "fila" ? <th className="w-8 px-3 py-2" aria-label="Elegir" /> : null}
                  {columnasVisibles.map((c) => {
                    const activa = orden.col === c.id;
                    return (
                      <th key={c.id} scope="col" aria-sort={activa ? (orden.asc ? "ascending" : "descending") : "none"} className={cn("px-3 py-2 font-medium", c.numerica && "text-right")} title={c.ayuda}>
                        <button type="button" onClick={() => ordenarPor(c.id)} className={cn("inline-flex items-center gap-1 hover:text-foreground", !activa && "text-muted-foreground")}>
                          {c.label}
                          {activa ? orden.asc ? <ArrowUp aria-hidden className="size-3" /> : <ArrowDown aria-hidden className="size-3" /> : null}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => {
                  const puede =
                    por === "fila" &&
                    r.projectIds.length > 0 &&
                    (planoElegido === null || planoElegido === r.plano) &&
                    (elegidas.includes(r.clave) || corridasElegidas.length + r.projectIds.length <= MAXIMO_COMPARAR);
                  return (
                    <tr key={r.clave} className={cn("border-t hover:bg-muted/30", elegidas.includes(r.clave) && "bg-muted/40")}>
                      {por === "fila" ? (
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            className="size-3.5"
                            aria-label={`Elegir ${r.modelo}, rondas ${r.rondas ? etiquetaRondas(r.rondas) : ""} en ${r.plano}`}
                            disabled={!puede}
                            checked={elegidas.includes(r.clave)}
                            onChange={() => setElegidas(alternar(elegidas, r.clave))}
                          />
                        </td>
                      ) : null}
                      {columnasVisibles.map((c) => (
                        <td key={c.id} className={cn("px-3 py-2", c.numerica && "text-right")}>
                          {celda(r, c.id, modelos)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Ninguna fila coincide" body="Quite algún filtro para ver resultados." />
        )}

      </div>
    </div>
  );
}
