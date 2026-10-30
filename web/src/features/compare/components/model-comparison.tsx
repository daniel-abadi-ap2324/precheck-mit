"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Check, ExternalLink, ListChecks } from "lucide-react";
import { Callout, EmptyState, ErrorState, SkeletonRows } from "@/components/common";
import { ComplianceBadge, FueraDeCatalogoTag } from "@/components/status";
import { useProjects } from "@/hooks/use-api";
import { etapaDeSeveridad, leerNombrePrueba, type EtapaSeveridad } from "@/lib/corridas-prueba";
import { toneClasses } from "@/lib/status";
import { cn } from "@/lib/utils";
import { esPreCheckReal, leerPreCheckServidor, type PreCheckServidor } from "@/services/prechecks/cliente";
import type { CorridaEstable, GrupoRondas, RespuestaRondas } from "@/services/rondas/tipos";
import type { ComplianceStatus, Project } from "@/types";
import { useRondas } from "@/features/rondas/hooks/use-rondas";
import { etapaMeta, formatoPorcentaje, type EtapaClave } from "@/features/rondas/lib/rondas";
import { detalleDeCorrida, rondaDe } from "../lib/clasificacion";
import {
  claveDeRegla,
  compararEjecuciones,
  conclusionLegible,
  contarEstados,
  contarFaltasEnPlano,
  ejecucionDe,
  estabilidadDe,
  planoDe,
  resumenPorModelo,
  tablaDeDatos,
  tablaDeSupuestos,
  type Ejecucion,
} from "../lib/comparacion";
import { etiquetaRondas } from "../lib/explorador";
import { ClasificacionTag, etiquetaDeNivel, metaNivel, ORDEN_NIVELES, type ClasificacionVisible } from "./clasificacion-tag";
import { DetalleCorrida } from "./detalle-corrida";
import { DetalleDato } from "./detalle-dato";
import { MAXIMO_COMPARAR } from "./explorador";

/** Primero los modelos recomendados. */
const ORDEN_MODELOS = ["Sonnet 5.5", "Opus 5.5", "Fable 5.1", "DeepSeek Flash", "Haiku 5.5"];
const posicion = (m: string) => (ORDEN_MODELOS.includes(m) ? ORDEN_MODELOS.indexOf(m) : ORDEN_MODELOS.length);
const SIN_MODELO = "Sin IA o manual";

/** Modelo escrito en el nombre de una prueba: «Bella Vista - prueba 45 con Sonnet 5.5» → «Sonnet 5.5». */
const modeloDelNombre = (nombre: string) => leerNombrePrueba(nombre)?.modelo ?? SIN_MODELO;

const SEVERIDAD: Record<EtapaSeveridad, string> = { "hasta-56": "hasta la ronda 56", "57-76": "de la 57 a la 76", "desde-77": "desde la ronda 77" };
const SIN_MEDIR: ClasificacionVisible = { nivel: "sin_clasificar", motivos: ["Sin medir: pulse «Actualizar datos» en «Estabilidad por ronda»."], orientativa: true };

/** Una revisión del plano, con lo que se sabe sin leerla: modelo, ronda, repetición, grupo, etapa y su clasificación. */
export interface Revision {
  proyecto: Project;
  modelo: string;
  ronda: number | null;
  repeticion: number;
  grupo: GrupoRondas | null;
  etapa: EtapaClave | null;
  /** Lo que midió el servidor de esta corrida frente a las demás del plano en su grupo (null si no se midió). */
  estable: CorridaEstable | null;
  /** 1, 2, 3…: el orden de la corrida entre las del mismo modelo en su grupo (por ronda y repetición). */
  numero: number;
}

/** Proyectos con un PreCheck real terminado: los que se pueden comparar. */
const comparables = (items: Project[]) => items.filter((p) => p.precheckId && esPreCheckReal(p.precheckId) && p.status === "REVIEW_REQUIRED");
const rango = ([min, max]: [number, number]) => (min === max ? String(min) : `${min}–${max}`);
const pct = (v: number | null) => (v === null ? "—" : formatoPorcentaje(v));

function Paso({ numero, titulo, ayuda, children }: { numero: number; titulo: string; ayuda?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`paso-${numero}`} className="flex flex-col gap-3">
      <div>
        <h2 id={`paso-${numero}`} className="flex items-center gap-2 text-base font-semibold">
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-foreground text-xs text-background">{numero}</span>
          {titulo}
        </h2>
        {ayuda ? <p className="mt-1 text-sm text-muted-foreground">{ayuda}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Comparar corridas de un mismo plano en tres pasos: elegir el plano, elegir las corridas (por grupo de rondas, modelo
 * y repetición; ninguna marcada al empezar) y ver cuánto se parecen y en qué no. Solo se leen las corridas elegidas.
 * Nada se mide contra respuestas «correctas»: todavía no hay una referencia confirmada (ADR-0015).
 */
export function ModelComparison({ inicial }: { inicial: string[] }) {
  const lista = useProjects({ pruebas: "incluir" });
  const rondasQ = useRondas();
  const candidatos = useMemo(() => comparables(lista.data?.items ?? []), [lista.data]);

  const revisiones = useMemo(() => revisionesDe(candidatos, rondasQ.data), [candidatos, rondasQ.data]);

  const planos = useMemo(() => {
    const m = new Map<string, Revision[]>();
    for (const r of revisiones) m.set(planoDe(r.proyecto.name), [...(m.get(planoDe(r.proyecto.name)) ?? []), r]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [revisiones]);

  const delInicio = candidatos.find((p) => inicial.includes(p.id));
  const [plano, setPlano] = useState<string | null>(delInicio ? planoDe(delInicio.name) : null);
  const [elegidas, setElegidas] = useState<string[]>(inicial.slice(0, MAXIMO_COMPARAR));

  if (lista.error) return <ErrorState error={lista.error} onRetry={() => void lista.refetch()} />;
  if (lista.isPending) return <SkeletonRows rows={4} />;
  if (candidatos.length === 0) return <EmptyState title="Todavía no hay revisiones" body="Cuando un plano se revise con la IA, aparecerá aquí para comparar." />;

  const delPlano = planos.find(([p]) => p === plano)?.[1] ?? [];
  const elegir = (p: string) => {
    setPlano(p);
    setElegidas([]);
  };

  return (
    <div className="flex flex-col gap-8">
      <Paso numero={1} titulo="Elija un plano" ayuda="Cada plano es un anteproyecto real que se revisó varias veces, con distintos modelos de IA, para ver cuánto se repiten sus resultados.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Plano">
          {planos.map(([nombre, items]) => (
            <button
              key={nombre}
              type="button"
              role="radio"
              aria-checked={plano === nombre}
              onClick={() => elegir(nombre)}
              className={cn("flex items-center justify-between gap-2 rounded-lg border p-3 text-left hover:bg-muted", plano === nombre ? "border-brand bg-brand-soft" : "bg-card")}
            >
              <span className="font-medium">{nombre}</span>
              <span className="text-xs text-muted-foreground">{items.length} revisiones</span>
            </button>
          ))}
        </div>
      </Paso>

      {plano ? <ElegirRevisiones key={plano} revisiones={delPlano} elegidas={elegidas} onCambiar={setElegidas} /> : null}

      {plano && elegidas.length >= 2 ? <Resultado revisiones={delPlano.filter((r) => elegidas.includes(r.proyecto.id))} /> : null}
    </div>
  );
}

/**
 * Lo que se sabe de cada revisión sin leerla: modelo, ronda y repetición salen del nombre; grupo, etapa y
 * clasificación, de /rondas. `numero` cuenta 1, 2, 3… dentro del plano, el grupo y el modelo (por ronda y repetición).
 */
export function revisionesDe(candidatos: Project[], datos: RespuestaRondas | undefined): Revision[] {
  const grupoDeRonda = new Map<number, GrupoRondas>();
  const grupos = new Map((datos?.grupos ?? []).map((g) => [g.id, g]));
  const etapaDeRonda = new Map<number, EtapaClave>();
  for (const r of datos?.rondas ?? []) {
    etapaDeRonda.set(r.ronda, r.etapa ?? "sin-etapa");
    const g = grupos.get(r.grupo);
    if (g) grupoDeRonda.set(r.ronda, g);
  }
  const estables = new Map<string, CorridaEstable>();
  for (const p of datos?.estabilidad?.planos ?? []) for (const c of p.corridas) if (c.projectId) estables.set(c.projectId, c);
  const base = candidatos.map((p) => {
    const ronda = rondaDe(p.name);
    return {
      proyecto: p,
      modelo: modeloDelNombre(p.name),
      ronda,
      repeticion: leerNombrePrueba(p.name)?.repeticion ?? 1,
      grupo: ronda === null ? null : (grupoDeRonda.get(ronda) ?? null),
      etapa: ronda === null ? null : (etapaDeRonda.get(ronda) ?? null),
      estable: estables.get(p.id) ?? null,
    };
  });
  // Número dentro del grupo y modelo de su plano: 1, 2, 3… (por ronda y repetición).
  const orden = [...base].sort((a, b) => (a.ronda ?? -1) - (b.ronda ?? -1) || a.repeticion - b.repeticion || a.proyecto.name.localeCompare(b.proyecto.name, "es"));
  const cuenta = new Map<string, number>();
  const numero = new Map<string, number>();
  for (const r of orden) {
    const k = `${planoDe(r.proyecto.name)}|${r.grupo?.id ?? r.ronda ?? "otras"}|${r.modelo}`;
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
    numero.set(r.proyecto.id, cuenta.get(k) as number);
  }
  return base.map((r): Revision => ({ ...r, numero: numero.get(r.proyecto.id) ?? 1 }));
}

/** Fila de la tabla del paso 2: un grupo de rondas (o una ronda suelta, o las corridas sin ronda). */
interface FilaGrupo {
  clave: string;
  titulo: string;
  ayuda: string | null;
  primera: number;
  revisiones: Revision[];
}

/** Paso 2: las corridas del plano en una tabla grupo de rondas × modelo, con un botón por repetición. Ninguna marcada al empezar. */
function ElegirRevisiones({ revisiones, elegidas, onCambiar }: { revisiones: Revision[]; elegidas: string[]; onCambiar: (ids: string[]) => void }) {
  const etapas = useMemo(() => {
    const vistas = new Map<EtapaClave, Set<string>>();
    for (const r of revisiones) if (r.etapa) vistas.set(r.etapa, new Set([...(vistas.get(r.etapa) ?? []), r.grupo?.id ?? String(r.ronda)]));
    const primera = (e: EtapaClave) => Math.min(...revisiones.filter((r) => r.etapa === e).map((r) => r.ronda ?? Infinity));
    return [...vistas.entries()].map(([e, g]) => [e, g.size] as const).sort((a, b) => primera(a[0]) - primera(b[0]));
  }, [revisiones]);
  const modelos = useMemo(() => [...new Set(revisiones.map((r) => r.modelo))].sort((a, b) => posicion(a) - posicion(b) || a.localeCompare(b, "es")), [revisiones]);
  // Por defecto, la última etapa con revisiones (la más reciente): es la que casi siempre interesa.
  const [etapa, setEtapa] = useState<EtapaClave | "todas">(etapas[etapas.length - 1]?.[0] ?? "todas");
  const [ocultos, setOcultos] = useState<string[]>([]);

  const visibles = revisiones.filter((r) => (etapa === "todas" || r.etapa === etapa) && !ocultos.includes(r.modelo));
  const columnas = modelos.filter((m) => !ocultos.includes(m) && visibles.some((r) => r.modelo === m));
  const filas = useMemo(() => {
    const m = new Map<string, FilaGrupo>();
    for (const r of visibles) {
      const clave = r.grupo?.id ?? (r.ronda === null ? "otras" : `r${r.ronda}`);
      const fila =
        m.get(clave) ??
        (r.grupo
          ? { clave, titulo: r.grupo.rondas.length > 1 ? `Rondas ${etiquetaRondas(r.grupo.rondas)}` : `Ronda ${r.grupo.rondas[0]}`, ayuda: r.grupo.titulo, primera: r.grupo.rondas[0], revisiones: [] }
          : { clave, titulo: r.ronda === null ? "Otras" : `Ronda ${r.ronda}`, ayuda: null, primera: r.ronda ?? -1, revisiones: [] });
      fila.revisiones.push(r);
      m.set(clave, fila);
    }
    return [...m.values()].sort((a, b) => b.primera - a.primera);
  }, [visibles]);

  const alternar = (id: string) => onCambiar(elegidas.includes(id) ? elegidas.filter((x) => x !== id) : elegidas.length >= MAXIMO_COMPARAR ? elegidas : [...elegidas, id]);
  const ultimaDeCadaModelo = () => {
    const ultimas = columnas.flatMap((m) => {
      const r = visibles.filter((x) => x.modelo === m).sort((a, b) => (b.ronda ?? -1) - (a.ronda ?? -1) || b.repeticion - a.repeticion)[0];
      return r ? [r.proyecto.id] : [];
    });
    onCambiar(ultimas.slice(0, MAXIMO_COMPARAR));
  };
  // El grupo más reciente con al menos dos corridas: sus repeticiones de todos los modelos visibles.
  const grupoReciente = filas.find((f) => f.revisiones.length >= 2);

  return (
    <Paso
      numero={2}
      titulo="Elija qué corridas comparar"
      ayuda={
        <>
          Cada fila es un grupo de rondas (las que repiten la misma configuración) y cada columna un modelo de IA. Cada botón es una corrida: 1, 2, 3… son sus repeticiones,
          con su clasificación frente a las demás corridas del plano en el grupo. Marque de 2 a {MAXIMO_COMPARAR}.
        </>
      }
    >
      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Etapa de las pruebas</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Etapa">
            <Chip activo={etapa === "todas"} onClick={() => setEtapa("todas")} role="radio">
              Todas
            </Chip>
            {etapas.map(([e, n]) => (
              <Chip key={e} activo={etapa === e} onClick={() => setEtapa(e)} role="radio">
                {etapaMeta[e].label} <span className="opacity-70">({n} {n === 1 ? "grupo" : "grupos"})</span>
              </Chip>
            ))}
          </div>
          {etapa !== "todas" ? <p className="text-xs text-muted-foreground">{etapaMeta[etapa].descripcion}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Modelos</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Modelos">
            {modelos.map((m) => (
              <Chip key={m} activo={!ocultos.includes(m)} onClick={() => setOcultos(ocultos.includes(m) ? ocultos.filter((x) => x !== m) : [...ocultos, m])}>
                {m}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span data-testid="conteo-elegidas">
          <strong>{elegidas.length}</strong> de {MAXIMO_COMPARAR} elegidas
        </span>
        {grupoReciente ? (
          <button type="button" className="font-medium text-brand hover:underline" onClick={() => onCambiar(grupoReciente.revisiones.map((r) => r.proyecto.id).slice(0, MAXIMO_COMPARAR))}>
            Elegir todo el grupo más reciente ({grupoReciente.titulo.toLowerCase()})
          </button>
        ) : null}
        <button type="button" className="font-medium text-brand hover:underline" onClick={ultimaDeCadaModelo}>
          Elegir la más reciente de cada modelo
        </button>
        {elegidas.length ? (
          <button type="button" className="font-medium text-muted-foreground hover:underline" onClick={() => onCambiar([])}>
            Quitar todas
          </button>
        ) : null}
      </div>

      {filas.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">No hay revisiones con esta etapa y estos modelos.</p>
      ) : (
        <div className="max-h-[28rem] overflow-auto rounded-lg border bg-card">
          <table className="w-full text-sm" data-testid="revisiones">
            <caption className="sr-only">Corridas del plano por grupo de rondas y modelo</caption>
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="p-2.5 font-medium">
                  Rondas
                </th>
                {columnas.map((m) => (
                  <th key={m} scope="col" className="p-2.5 font-medium">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.clave} className="border-t align-top">
                  <th scope="row" className="p-2.5 text-left font-normal">
                    <span className="whitespace-nowrap">{fila.titulo}</span>
                    {fila.ayuda ? <span className="block max-w-56 text-xs text-muted-foreground">{fila.ayuda}</span> : null}
                  </th>
                  {columnas.map((m) => {
                    const celda = fila.revisiones.filter((r) => r.modelo === m).sort((a, b) => a.numero - b.numero);
                    return (
                      <td key={m} className="p-1.5">
                        <div className="flex flex-wrap gap-1">
                          {celda.map((r) => (
                            <BotonCorrida key={r.proyecto.id} r={r} activa={elegidas.includes(r.proyecto.id)} lleno={elegidas.length >= MAXIMO_COMPARAR} onClick={() => alternar(r.proyecto.id)} />
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        «Sin clasificar»: el plano tiene menos de 3 corridas terminadas en ese grupo, o la estabilidad todavía no se midió. «Superficial»: la web la marcó con muy pocos
        hallazgos propios.
      </p>
      {elegidas.length === 1 ? <p className="text-sm text-muted-foreground">Elija al menos una corrida más para ver la comparación.</p> : null}
    </Paso>
  );
}

/** Una corrida en el paso 2: su número de repetición y, debajo, su clasificación (icono + color + texto). */
function BotonCorrida({ r, activa, lleno, onClick }: { r: Revision; activa: boolean; lleno: boolean; onClick: () => void }) {
  const c = r.estable ?? SIN_MEDIR;
  const n = metaNivel(c.nivel);
  const Icono = n.icono;
  const superficial = r.estable?.superficial ?? false;
  const detalle = `${r.ronda === null ? "" : `ronda ${r.ronda}`}${r.repeticion > 1 ? `, repetición ${r.repeticion}` : ""}`;
  return (
    <button
      type="button"
      aria-pressed={activa}
      aria-label={`${r.proyecto.name}: ${n.etiqueta.toLowerCase()}${superficial ? ", posiblemente superficial" : ""}`}
      title={[r.proyecto.name, n.ayuda, ...c.motivos].join("\n")}
      onClick={onClick}
      disabled={!activa && lleno}
      className={cn(
        "inline-flex min-w-20 flex-col items-center gap-0.5 rounded-md border px-2 py-1 text-xs disabled:opacity-40",
        activa ? "border-brand bg-brand-soft" : "bg-card hover:bg-muted",
      )}
    >
      <span className="inline-flex items-center gap-1 font-medium tabular-nums">
        {activa ? <Check aria-hidden className="size-3" /> : null}
        {r.numero}
        <span className="font-normal text-muted-foreground">{detalle ? `· ${detalle}` : ""}</span>
      </span>
      <span className={cn("inline-flex items-center gap-0.5 text-2xs", toneClasses[n.tono].text)}>
        <Icono aria-hidden className="size-3" />
        {n.etiqueta}
      </span>
      {superficial ? <span className="text-2xs text-warning">superficial</span> : null}
    </button>
  );
}

function Chip({ activo, onClick, children, role }: { activo: boolean; onClick: () => void; children: React.ReactNode; role?: "radio" }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role ? activo : undefined}
      aria-pressed={role ? undefined : activo}
      onClick={onClick}
      className={cn("rounded-full border px-3 py-1 text-xs font-medium", activo ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted")}
    >
      {children}
    </button>
  );
}

const nombreCorto = (r: Revision) => `${r.modelo}${r.ronda === null ? "" : ` · ronda ${r.ronda}`}${r.repeticion > 1 ? ` (${r.repeticion})` : ""}`;

/** Ejecución comparable a partir de lo que devuelve el servidor. */
const aEjecucion = (r: Revision, d: PreCheckServidor): Ejecucion =>
  ejecucionDe({
    projectId: r.proyecto.id,
    precheckId: r.proyecto.precheckId,
    nombre: r.proyecto.name,
    modelo: r.modelo,
    fecha: d.estado.createdAt,
    ia: d.ia,
    pedidos: d.datosPedidos,
    project: d.project,
    precheck: d.precheck,
  });

const ETIQUETAS_ESTADO: Record<ComplianceStatus, string> = { PASS: "Cumple", FAIL: "No cumple", WARNING: "Observación", MANUAL_REVIEW: "Requiere revisión", NOT_APPLICABLE: "No aplica" };

/** Tarjeta de una medida de estabilidad. */
function Medida({ titulo, ayuda, valor, detalle }: { titulo: string; ayuda: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3" title={ayuda}>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="tabular text-2xl font-semibold">{valor}</p>
      {detalle ? <p className="text-xs text-muted-foreground">{detalle}</p> : null}
    </div>
  );
}

/**
 * Paso 3: cuánto se parecen las corridas elegidas (entre repeticiones del mismo modelo y entre modelos), un resumen
 * por modelo, lo que asumió cada una, los datos que midió y, regla por regla, qué decidió cada una frente a la mayoría.
 */
function Resultado({ revisiones }: { revisiones: Revision[] }) {
  const orden = [...revisiones].sort((a, b) => posicion(a.modelo) - posicion(b.modelo) || (b.ronda ?? -1) - (a.ronda ?? -1) || a.repeticion - b.repeticion);
  const consultas = useQueries({
    queries: orden.map((r) => ({ queryKey: ["comparacion", r.proyecto.precheckId], queryFn: () => leerPreCheckServidor(r.proyecto.precheckId as string) })),
  });
  const [soloDiferencias, setSoloDiferencias] = useState(false);
  const [verMotor, setVerMotor] = useState(true);
  const [datoAbierto, setDatoAbierto] = useState<string | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const cargando = consultas.some((q) => q.isPending);
  const huella = consultas.map((q) => q.dataUpdatedAt).join(",");
  const ids = orden.map((r) => r.proyecto.id).join(",");

  // Columnas: solo las corridas que se pudieron leer, en el mismo orden que `ejecuciones`.
  const leidas = useMemo(
    () => orden.flatMap((r, i) => (consultas[i]?.data ? [{ r, d: consultas[i].data as PreCheckServidor }] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [huella, ids],
  );
  const ejecuciones = useMemo(() => leidas.map(({ r, d }) => aEjecucion(r, d)), [leidas]);
  const filas = useMemo(() => compararEjecuciones(ejecuciones), [ejecuciones]);
  const datos = useMemo(() => tablaDeDatos(ejecuciones), [ejecuciones]);
  const supuestos = useMemo(() => tablaDeSupuestos(ejecuciones), [ejecuciones]);
  const resumen = useMemo(() => resumenPorModelo(ejecuciones, filas), [ejecuciones, filas]);
  const mismoModelo = (i: number, j: number) => ejecuciones[i].modelo === ejecuciones[j].modelo;
  const entreRepeticiones = useMemo(() => estabilidadDe(ejecuciones, filas, (i, j) => ejecuciones[i].modelo === ejecuciones[j].modelo), [ejecuciones, filas]);
  const entreModelos = useMemo(() => estabilidadDe(ejecuciones, filas, (i, j) => ejecuciones[i].modelo !== ejecuciones[j].modelo), [ejecuciones, filas]);
  // Lo que determinó el motor en cada corrida, por regla del catálogo (para ponerlo junto a lo que decidió la IA).
  const motorPorCorrida = useMemo(() => {
    const m: Record<string, Record<string, ComplianceStatus | null>> = {};
    leidas.forEach(({ r, d }, i) => {
      m[r.proyecto.id] = Object.fromEntries(detalleDeCorrida(d.precheck.results, ejecuciones[i].titulos).map((x) => [claveDeRegla(x.ruleId), x.motor]));
    });
    return m;
  }, [leidas, ejecuciones]);

  if (cargando) {
    return (
      <Paso numero={3} titulo="Resultado">
        <SkeletonRows rows={3} />
      </Paso>
    );
  }
  const columnas = leidas.map((x) => x.r);
  const clasificacion = (r: Revision): ClasificacionVisible => r.estable ?? SIN_MEDIR;
  const sinTerminar = leidas.filter(({ d }) => d.ia && d.ia.status !== "done").map(({ r }) => r);
  const severidades = [...new Set(columnas.flatMap((r) => (r.ronda === null ? [] : [etapaDeSeveridad(r.ronda)])))];
  const supuestosDistintos = supuestos.filter((x) => x.difiere);
  const filasVisibles = soloDiferencias ? filas.filter((f) => f.difiere) : filas;
  const ocultas = filas.length - filasVisibles.length;
  const consistentes = filas.filter((f) => f.consenso.consistente).length;
  const conteoNiveles = Object.fromEntries(ORDEN_NIVELES.map((n) => [n, columnas.filter((r) => clasificacion(r).nivel === n).length]));
  const hayRepeticiones = entreRepeticiones.pares > 0;
  const detalle = leidas.find(({ r }) => r.proyecto.id === detalleId);
  const cabecera = (r: Revision) => (
    <>
      <Link href={`/projects/${r.proyecto.id}/precheck`} className="text-sm text-foreground underline-offset-2 hover:underline">
        {r.modelo}
      </Link>
      <span className="block font-normal">
        {r.ronda === null ? "sin ronda" : `ronda ${r.ronda}`}
        {r.repeticion > 1 ? ` (${r.repeticion})` : ""}
      </span>
    </>
  );
  // Por modelo: cuánto se repite entre sus propias corridas (solo con dos o más).
  const repiteModelo = (modelo: string | null) => estabilidadDe(ejecuciones, filas, (i, j) => mismoModelo(i, j) && ejecuciones[i].modelo === modelo);

  return (
    <Paso numero={3} titulo="Cuánto se parecen y en qué no" ayuda="Resultados preliminares: el visto bueno oficial lo da la DOYC. Todo se mide entre corridas; todavía no hay una referencia confirmada.">
      {sinTerminar.length ? (
        <Callout tone="warning" title="Alguna corrida no terminó">
          {sinTerminar.map(nombreCorto).join(", ")}: la IA no terminó, así que solo trae lo que decidió el motor de reglas y la comparación puede engañar.
        </Callout>
      ) : null}
      {severidades.length > 1 ? (
        <Callout tone="warning" title="Corridas evaluadas con catálogos de severidad distintos">
          Las corridas elegidas son de épocas con reglas de severidad distintas ({severidades.map((s) => SEVERIDAD[s]).join("; ")}). Desde la ronda 57 los requisitos de forma
          del plano pasaron a observación y desde la 77 lo que falta en el plano es «No cumple · falta en el plano» (ADR-0014): los «no cumple» no se comparan directamente.
        </Callout>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="tarjetas-revision">
        {leidas.map(({ r, d }, i) => {
          const e = ejecuciones[i];
          const c = contarEstados(e);
          const faltas = contarFaltasEnPlano(e);
          const noAplica = d.precheck.results.filter((x) => x.status === "NOT_APPLICABLE").length;
          return (
            <li key={r.proyecto.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">{nombreCorto(r)}</p>
                <Link href={`/projects/${r.proyecto.id}/precheck`} className="inline-flex shrink-0 items-center gap-1 text-xs text-brand hover:underline">
                  Abrir <ExternalLink aria-hidden className="size-3" />
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ClasificacionTag clasificacion={clasificacion(r)} />
                {r.estable?.superficial ? <span className="text-xs text-warning">Posiblemente superficial</span> : null}
              </div>
              <p className="text-sm tabular">
                <span className="text-pass">{c.PASS} cumple</span> · <span className="text-fail">
                  {c.FAIL} no cumple{faltas ? ` (${faltas} falta en el plano)` : ""}
                </span> · <span className="text-warning">{c.WARNING + c.MANUAL_REVIEW} observación</span> · <span className="text-muted-foreground">{noAplica} no aplica</span>
              </p>
              {d.project.expediente?.dictamen?.conclusion ? <p className="line-clamp-4 text-xs text-muted-foreground">{conclusionLegible(d.project.expediente.dictamen.conclusion)}</p> : null}
              <button type="button" className="inline-flex items-center gap-1 self-start text-xs font-medium text-brand hover:underline" onClick={() => setDetalleId(r.proyecto.id)}>
                <ListChecks aria-hidden className="size-3.5" />
                Motor e IA, regla por regla
              </button>
            </li>
          );
        })}
      </ul>

      <section aria-label="Estabilidad de las corridas elegidas" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="estabilidad">
        <Medida
          titulo="Se repite: entre repeticiones del mismo modelo"
          ayuda="De las reglas del catálogo que decidieron las dos corridas de un par del mismo modelo, en qué parte dicen lo mismo (promedio de los pares)."
          valor={hayRepeticiones ? pct(entreRepeticiones.acuerdoCatalogo) : "—"}
          detalle={hayRepeticiones ? `Hallazgos: ${pct(entreRepeticiones.solapamientoHallazgos)} · ${entreRepeticiones.pares} ${entreRepeticiones.pares === 1 ? "par" : "pares"}` : "Elija dos o más corridas del mismo modelo."}
        />
        <Medida
          titulo="Coinciden: entre modelos distintos"
          ayuda="Lo mismo, pero en pares de corridas de modelos distintos."
          valor={entreModelos.pares ? pct(entreModelos.acuerdoCatalogo) : "—"}
          detalle={entreModelos.pares ? `Hallazgos: ${pct(entreModelos.solapamientoHallazgos)} · ${entreModelos.pares} ${entreModelos.pares === 1 ? "par" : "pares"}` : "Elija corridas de dos modelos o más."}
        />
        <Medida titulo="Reglas consistentes" ayuda="Filas en las que al menos 2 de cada 3 corridas dicen lo mismo." valor={`${consistentes} de ${filas.length}`} detalle={`${filas.filter((f) => f.difiere).length} difieren en alguna corrida`} />
        <div className="rounded-lg border bg-card p-3" data-testid="conteo-niveles">
          <p className="text-xs text-muted-foreground">Clasificación de las elegidas</p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {ORDEN_NIVELES.filter((n) => conteoNiveles[n] > 0).map((n) => (
              <span key={n}>
                <strong className="tabular">{conteoNiveles[n]}</strong> {etiquetaDeNivel(n).toLowerCase()}
              </span>
            ))}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Frente a todas las corridas del plano en su grupo de rondas.</p>
        </div>
      </section>

      <section aria-labelledby="por-modelo" className="flex flex-col gap-2">
        <h3 id="por-modelo" className="text-sm font-semibold">
          Por modelo
        </h3>
        <p className="text-xs text-muted-foreground">Rango de cada estado entre las corridas del modelo, cuánto se repite y cuánto coincide con la mayoría de las elegidas.</p>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[40rem] text-sm" data-testid="resumen-modelos">
            <caption className="sr-only">Resumen por modelo</caption>
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                {["Modelo", "Corridas", "Se repite", "Cumple", "No cumple", "Falta en el plano", "Observación", "Con la mayoría"].map((h) => (
                  <th key={h} scope="col" className="p-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resumen.map((m) => {
                const rep = repiteModelo(m.modelo);
                return (
                  <tr key={m.modelo ?? "sin-ia"} className="border-b last:border-0">
                    <th scope="row" className="p-3 text-left font-medium">
                      {m.modelo ?? SIN_MODELO}
                    </th>
                    <td className="tabular p-3">{m.corridas}</td>
                    <td className="tabular p-3">{rep.pares ? pct(rep.acuerdoCatalogo) : "—"}</td>
                    <td className="tabular p-3">{rango(m.rango.PASS)}</td>
                    <td className="tabular p-3">{rango(m.rango.FAIL)}</td>
                    <td className="tabular p-3">{rango(m.faltasEnPlano)}</td>
                    <td className="tabular p-3">{rango(m.rango.WARNING)}</td>
                    <td className="tabular p-3">{pct(m.acuerdo)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {supuestos.length ? (
        <section aria-labelledby="supuestos" className="flex flex-col gap-2">
          <h3 id="supuestos" className="text-sm font-semibold">
            Qué asumió cada corrida
          </h3>
          <p className="text-xs text-muted-foreground">
            Lo que cada corrida anotó como supuesto en su dictamen (la zona, el sector, la unidad territorial…). «—» no es desacuerdo: esa corrida no lo anotó como supuesto.
          </p>
          {supuestosDistintos.length ? (
            <Callout tone="warning" title="Las corridas no asumieron lo mismo">
              {supuestosDistintos.map((x) => x.etiqueta).join(", ")}: puede explicar por qué una regla es «no aplica» en una corrida y se decide en otra.
            </Callout>
          ) : null}
          <div className="max-w-full overflow-x-auto rounded-lg border bg-card" data-testid="supuestos">
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">Supuestos de cada corrida</caption>
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th scope="col" className="sticky left-0 bg-muted p-3 font-medium">
                    Supuesto
                  </th>
                  {columnas.map((r) => (
                    <th key={r.proyecto.id} scope="col" className="min-w-28 p-3 font-medium">
                      {cabecera(r)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supuestos.map((x) => (
                  <tr key={x.hecho} className={cn("border-b align-top last:border-0", x.difiere && "bg-warning-soft/60")} data-testid="fila-supuesto">
                    <th scope="row" className={cn("sticky left-0 p-3 text-left font-normal", x.difiere ? "bg-warning-soft" : "bg-card")}>
                      {x.etiqueta}
                      {x.difiere ? <span className="block text-xs font-medium text-warning">no coinciden</span> : null}
                    </th>
                    {x.valores.map((v, i) => (
                      <td key={columnas[i]?.proyecto.id ?? i} className="p-3">
                        {v ?? <span className="text-muted-foreground">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <details className="rounded-lg border bg-card p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          Datos medidos en cada corrida ({datos.filter((f) => f.amplio || f.distintos || f.escritas < ejecuciones.length).length} no coinciden, de {datos.length})
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Los datos con que decidió el motor. Si el rango es amplio (más del 10 % de la mediana) o un sí/no no coincide, la medida cambia de una corrida a otra y puede mover el
          resultado. Pulse un dato para ver dónde y cómo lo leyó cada corrida.
        </p>
        <div className="mt-2 max-w-full overflow-x-auto" data-testid="datos-medidos">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">Datos con que decidió el motor en cada corrida</caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="p-2.5 font-medium">
                  Dato
                </th>
                <th scope="col" className="p-2.5 font-medium">
                  Corridas
                </th>
                <th scope="col" className="p-2.5 font-medium">
                  Rango
                </th>
                {columnas.map((r) => (
                  <th key={r.proyecto.id} scope="col" className="p-2.5 font-medium">
                    {cabecera(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.map((f) => (
                <tr key={f.clave} className={cn("border-b align-top last:border-0", (f.amplio || f.distintos) && "bg-warning-soft/60")}>
                  <th scope="row" className="p-2.5 text-left font-normal">
                    <button type="button" aria-expanded={datoAbierto === f.clave} className="text-left text-brand hover:underline" onClick={() => setDatoAbierto((a) => (a === f.clave ? null : f.clave))}>
                      {f.etiqueta}
                    </button>
                  </th>
                  <td className={cn("tabular p-2.5", f.escritas < ejecuciones.length && "font-medium text-warning")}>
                    {f.escritas} de {ejecuciones.length}
                  </td>
                  <td className="tabular p-2.5">
                    {f.rango ? `${f.rango.min} – ${f.rango.max}` : "—"}
                    {f.amplio ? <span className="block text-xs font-medium text-warning">rango amplio</span> : null}
                    {f.distintos ? <span className="block text-xs font-medium text-warning">valores distintos</span> : null}
                  </td>
                  {f.valores.map((v, i) => (
                    <td key={columnas[i]?.proyecto.id ?? i} className="tabular p-2.5">
                      {v ?? <span className="text-muted-foreground">No lo leyó</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {datoAbierto ? (
          <div className="mt-3">
            <DetalleDato clave={datoAbierto} etiqueta={datos.find((f) => f.clave === datoAbierto)?.etiqueta ?? datoAbierto} ejecuciones={ejecuciones} onCerrar={() => setDatoAbierto(null)} />
          </div>
        ) : null}
      </details>

      <section aria-labelledby="reglas" className="flex flex-col gap-2">
        <h3 id="reglas" className="text-sm font-semibold">
          Reglas y hallazgos, corrida por corrida
        </h3>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4" checked={soloDiferencias} onChange={(e) => setSoloDiferencias(e.target.checked)} />
            Mostrar solo lo que difiere entre corridas
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4" checked={verMotor} onChange={(e) => setVerMotor(e.target.checked)} />
            Mostrar lo que determinó el motor junto a la IA
          </label>
          <span className="text-muted-foreground" data-testid="resumen-consistencia">
            {filas.filter((f) => f.difiere).length} de {filas.length} filas difieren; {consistentes} son consistentes (al menos 2 de cada 3 corridas coinciden).
          </span>
        </div>
        {ocultas > 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="filas-ocultas">
            Se muestran {filasVisibles.length} de {filas.length} filas: {ocultas} {ocultas === 1 ? "se oculta" : "se ocultan"} porque todas las corridas elegidas coinciden.
          </p>
        ) : null}
        <div className="max-w-full overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[40rem] text-sm" data-testid="reglas-comparadas">
            <caption className="sr-only">Resultado de cada corrida, regla por regla, y lo que dice la mayoría</caption>
            <thead>
              <tr className="border-b bg-muted/40 text-left align-bottom text-xs text-muted-foreground">
                <th scope="col" className="sticky left-0 z-10 min-w-56 bg-muted p-2.5 font-medium">
                  Regla u hallazgo
                </th>
                <th scope="col" className="min-w-32 p-2.5 font-medium">
                  Consenso
                  <span className="block font-normal">lo que dice la mayoría</span>
                </th>
                {columnas.map((r) => (
                  <th key={r.proyecto.id} scope="col" className="min-w-32 p-2.5 font-medium">
                    {cabecera(r)}
                    <span className="mt-1 block">
                      <ClasificacionTag clasificacion={clasificacion(r)} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasVisibles.map((f) => (
                <tr key={f.clave} className={cn("border-b align-top last:border-0", f.difiere && "bg-warning-soft/60")}>
                  <th scope="row" className={cn("sticky left-0 p-2.5 text-left font-normal", f.difiere ? "bg-warning-soft" : "bg-card")}>
                    {f.titulo}
                    {f.fueraDeCatalogo ? <FueraDeCatalogoTag className="mt-1 block w-fit" /> : null}
                  </th>
                  <td className="p-2.5" data-testid="consenso">
                    {f.consenso.estado ? <ComplianceBadge status={f.consenso.estado} size="sm" /> : <span className="text-xs text-muted-foreground">no aparece</span>}
                    <span className={cn("mt-1 block text-xs", f.consenso.consistente ? "text-muted-foreground" : "font-medium text-warning")}>
                      {f.consenso.estado ? `${f.consenso.coinciden}/${f.consenso.de}` : `lo señalan ${f.consenso.de - f.consenso.coinciden} de ${f.consenso.de}`} ·{" "}
                      {f.consenso.consistente ? "consistente" : "verificar"}
                    </span>
                  </td>
                  {f.estados.map((s, i) => {
                    const r = columnas[i];
                    const motor = !f.fueraDeCatalogo && f.clave.startsWith("R:") ? motorPorCorrida[r.proyecto.id]?.[f.clave.slice(2)] : undefined;
                    return (
                      <td key={r.proyecto.id} className="p-2.5">
                        {s === "NOT_APPLICABLE" ? (
                          <span className="text-xs text-muted-foreground">No aplica</span>
                        ) : s ? (
                          <ComplianceBadge status={s} size="sm" />
                        ) : (
                          <span className="text-xs text-muted-foreground">no aparece</span>
                        )}
                        {verMotor && motor !== undefined ? (
                          <span className={cn("mt-1 block text-xs", motor && s && motor !== s ? "font-medium text-warning" : "text-muted-foreground")} data-testid="motor-celda">
                            Motor: {motor ? ETIQUETAS_ESTADO[motor] : "no la evaluó"}
                          </span>
                        ) : null}
                        {s && f.titulosPorEjecucion[i] && f.titulosPorEjecucion[i] !== f.titulo ? (
                          <span className="mt-1 block text-xs text-muted-foreground">«{f.titulosPorEjecucion[i]}»</span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detalle ? (
        <DetalleCorrida
          abierto
          onCerrar={() => setDetalleId(null)}
          proyectoId={detalle.r.proyecto.id}
          nombre={detalle.r.proyecto.name}
          modelo={detalle.r.modelo}
          clasificacion={clasificacion(detalle.r)}
          filas={detalleDeCorrida(detalle.d.precheck.results, ejecuciones[leidas.indexOf(detalle)]?.titulos ?? {})}
        />
      ) : null}
    </Paso>
  );
}
