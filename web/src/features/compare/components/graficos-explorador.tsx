"use client";

import { useState } from "react";
import { seriePorGrupo, type Fila, type Registro } from "../lib/explorador";

/** Un color por modelo, tomado de los tokens de gráficos (cambian solos con el tema). */
const COLORES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
export const colorDe = (modelos: string[], modelo: string | null) => COLORES[Math.max(0, modelos.indexOf(modelo ?? "")) % COLORES.length];

const W = 560;
const H = 300;
const M = { l: 40, r: 12, t: 12, b: 32 };
const pct = (v: number) => `${Math.round(v * 100)} %`;

function Leyenda({ modelos, todos }: { modelos: string[]; todos: string[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {modelos.map((m) => (
        <li key={m} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: colorDe(todos, m) }} />
          {m}
        </li>
      ))}
    </ul>
  );
}

const VENTANAS = [
  { id: 8, label: "Últimos 8 grupos" },
  { id: 16, label: "Últimos 16" },
  { id: 0, label: "Todos" },
] as const;

/**
 * Una medida por grupo de rondas, una línea por modelo (promedio de los planos). Por defecto muestra los últimos 8
 * grupos y ajusta la escala vertical al rango de los datos; con la leyenda se muestra u oculta cada modelo.
 */
export function GraficoPorGrupo({ filas, modelos, medida, etiqueta }: { filas: Fila[]; modelos: string[]; medida: "acuerdoRepeticiones" | "acuerdoMayoria"; etiqueta: string }) {
  const [ventana, setVentana] = useState<number>(8);
  const [ocultos, setOcultos] = useState<string[]>([]);
  const [activo, setActivo] = useState<string | null>(null);
  const todas = seriePorGrupo(filas, medida);
  const grupos = [...new Map(todas.flatMap((s) => s.puntos.map((p) => [p.grupo, p] as const))).values()].sort((a, b) => a.x - b.x);
  if (!grupos.length) return <p className="text-sm text-muted-foreground">No hay grupos con esta medida con los filtros elegidos.</p>;
  const vistos = ventana ? grupos.slice(-ventana) : grupos;
  const ids = vistos.map((g) => g.grupo);
  const series = todas.map((s) => ({ ...s, puntos: s.puntos.filter((p) => ids.includes(p.grupo)) })).filter((s) => s.puntos.length);
  const visibles = series.filter((s) => !ocultos.includes(s.modelo));
  const valores = visibles.flatMap((s) => s.puntos.map((p) => p.valor));
  const piso = valores.length ? Math.max(0, Math.floor((Math.min(...valores) - 0.05) * 10) / 10) : 0;
  const x = (grupo: string) => M.l + (ids.length === 1 ? (W - M.l - M.r) / 2 : (ids.indexOf(grupo) / (ids.length - 1)) * (W - M.l - M.r));
  const y = (v: number) => M.t + (1 - (v - piso) / (1 - piso || 1)) * (H - M.t - M.b);
  const marcasY = Array.from({ length: 5 }, (_, i) => piso + ((1 - piso) * i) / 4);
  const paso = Math.max(1, Math.ceil(ids.length / 10));
  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Grupos que se muestran">
        {VENTANAS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={ventana === v.id}
            onClick={() => setVentana(v.id)}
            className={`rounded-md border px-2 py-1 text-xs ${ventana === v.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${etiqueta} por grupo de rondas y modelo`} className="w-full">
        {marcasY.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={M.l - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-2xs">
              {pct(v)}
            </text>
          </g>
        ))}
        {vistos
          .filter((_, i) => i % paso === 0 || i === vistos.length - 1)
          .map((g) => (
            <text key={g.grupo} x={x(g.grupo)} y={H - 14} textAnchor="middle" className="fill-muted-foreground text-2xs">
              {g.etiqueta}
            </text>
          ))}
        {visibles.map((s) => {
          const atenuada = activo !== null && activo !== s.modelo;
          return (
            <g key={s.modelo} style={{ color: colorDe(modelos, s.modelo), opacity: atenuada ? 0.2 : 1 }} onMouseEnter={() => setActivo(s.modelo)} onMouseLeave={() => setActivo(null)}>
              <polyline fill="none" stroke="currentColor" strokeWidth={activo === s.modelo ? 3 : 2} strokeLinejoin="round" points={s.puntos.map((p) => `${x(p.grupo)},${y(p.valor)}`).join(" ")} />
              {s.puntos.map((p) => (
                <circle key={p.grupo} cx={x(p.grupo)} cy={y(p.valor)} r={3.5} fill="currentColor">
                  <title>{`${s.modelo} · rondas ${p.etiqueta}: ${pct(p.valor)} (${p.planos} ${p.planos === 1 ? "plano" : "planos"})`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        <text x={(M.l + W - M.r) / 2} y={H - 1} textAnchor="middle" className="fill-muted-foreground text-2xs">
          Rondas del grupo
        </text>
      </svg>
      <ul className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
        {series.map((s) => {
          const oculto = ocultos.includes(s.modelo);
          return (
            <li key={s.modelo}>
              <button
                type="button"
                aria-pressed={!oculto}
                title={oculto ? "Mostrar este modelo" : "Ocultar este modelo"}
                onClick={() => setOcultos(oculto ? ocultos.filter((m) => m !== s.modelo) : [...ocultos, s.modelo])}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${oculto ? "text-muted-foreground line-through opacity-60" : ""}`}
              >
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: colorDe(modelos, s.modelo) }} />
                {s.modelo}
              </button>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

/** Cuánto se repite frente a cuánto cuesta: cada punto es una fila de la tabla. Arriba a la izquierda: estable y barato. */
export function GraficoRepeticionCosto({ registros, modelos }: { registros: Registro[]; modelos: string[] }) {
  const puntos = registros.filter((r) => r.acuerdoRepeticiones !== null && r.usd !== null);
  if (!puntos.length) return <p className="text-sm text-muted-foreground">No hay filas con repeticiones y costo a la vez.</p>;
  const maxUsd = Math.max(...puntos.map((p) => p.usd as number)) * 1.1 || 1;
  const valores = puntos.map((p) => p.acuerdoRepeticiones as number);
  const piso = Math.max(0, Math.floor((Math.min(...valores) - 0.05) * 10) / 10);
  const x = (v: number) => M.l + (v / maxUsd) * (W - M.l - M.r);
  const y = (v: number) => M.t + (1 - (v - piso) / (1 - piso || 1)) * (H - M.t - M.b);
  const marcasY = Array.from({ length: 5 }, (_, i) => piso + ((1 - piso) * i) / 4);
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cuánto se repite cada modelo frente a su costo por revisión" className="w-full">
        {marcasY.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={M.l - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-2xs">
              {pct(v)}
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={x(maxUsd * f)} y={H - 14} textAnchor="middle" className="fill-muted-foreground text-2xs">
            {(maxUsd * f).toFixed(1)}
          </text>
        ))}
        {puntos.map((p) => (
          <circle key={p.clave} cx={x(p.usd as number)} cy={y(p.acuerdoRepeticiones as number)} r={4.5} fill={colorDe(modelos, p.modelo)} fillOpacity={0.8}>
            <title>{`${[p.modelo, p.plano, p.rondas ? `rondas ${p.rondas.join(", ")}` : null].filter(Boolean).join(" · ")}: se repite ${pct(p.acuerdoRepeticiones as number)}, ${(p.usd as number).toFixed(2)} USD`}</title>
          </circle>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 1} textAnchor="middle" className="fill-muted-foreground text-2xs">
          USD por revisión
        </text>
      </svg>
      <Leyenda modelos={[...new Set(puntos.map((p) => p.modelo))]} todos={modelos} />
    </figure>
  );
}
