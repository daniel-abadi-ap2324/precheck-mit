"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { EmptyState } from "@/components/common";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDay } from "@/lib/format";
import { leerPreCheckServidor, type PreCheckServidor } from "@/services/prechecks/cliente";
import type { Project } from "@/types";
import { leerNombrePrueba } from "@/lib/corridas-prueba";
import { conclusionLegible, contarEstados, contarFaltasEnPlano, planoDe } from "../lib/comparacion";

/** Primero los recomendados (Sonnet para el día a día, Opus para la revisión final). */
const ORDEN = ["Sonnet 5.5", "Opus 5.5", "Fable 5.1", "DeepSeek Flash", "Haiku 5.5"];
const posicion = (m: string) => (ORDEN.includes(m) ? ORDEN.indexOf(m) : ORDEN.length);
const MAX_PROBLEMAS = 6;

/** Por modelo, la prueba más reciente del plano: la de ronda más alta y, dentro de la ronda, la última repetición. */
export function ultimaPorModelo(proyectos: Project[]): { modelo: string; proyecto: Project; ronda: number; repeticion: number }[] {
  const m = new Map<string, { proyecto: Project; ronda: number; repeticion: number }>();
  for (const p of proyectos) {
    const n = leerNombrePrueba(p.name);
    if (!n) continue;
    const previo = m.get(n.modelo);
    const masNueva =
      !previo ||
      n.ronda > previo.ronda ||
      (n.ronda === previo.ronda && (n.repeticion > previo.repeticion || (n.repeticion === previo.repeticion && p.updatedAt > previo.proyecto.updatedAt)));
    if (masNueva) m.set(n.modelo, { proyecto: p, ronda: n.ronda, repeticion: n.repeticion });
  }
  return [...m.entries()]
    .map(([modelo, x]) => ({ modelo, ...x }))
    .sort((a, b) => posicion(a.modelo) - posicion(b.modelo) || a.modelo.localeCompare(b.modelo, "es"));
}

/**
 * «Conclusión de cada modelo»: elige un plano y ve, para cada modelo, lo que concluyó su última revisión (texto del
 * dictamen, conteo de reglas y lo que pide corregir), sin tener que comparar corridas. Solo lee una corrida por modelo.
 */
export function ConclusionesModelos({ proyectos }: { proyectos: Project[] }) {
  const grupos = useMemo(() => {
    const m = new Map<string, Project[]>();
    for (const p of proyectos) if (leerNombrePrueba(p.name)) m.set(planoDe(p.name), [...(m.get(planoDe(p.name)) ?? []), p]);
    return m;
  }, [proyectos]);
  const [plano, setPlano] = useState<string | null>(null);
  const planoActual = plano ?? [...grupos.keys()].sort((a, b) => a.localeCompare(b, "es"))[0] ?? null;
  const ultimas = useMemo(() => ultimaPorModelo(grupos.get(planoActual ?? "") ?? []), [grupos, planoActual]);

  const consultas = useQueries({
    queries: ultimas.map((u) => ({
      queryKey: ["comparacion", u.proyecto.precheckId],
      queryFn: () => leerPreCheckServidor(u.proyecto.precheckId as string),
    })),
  });

  if (grupos.size === 0)
    return (
      <EmptyState title="Todavía no hay pruebas de modelos" body="Cuando un plano se revise con uno o más modelos, aquí aparecerá lo que concluyó cada uno." />
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-sm flex-col gap-1">
        <Label htmlFor="conc-plano">Plano</Label>
        <NativeSelect id="conc-plano" value={planoActual ?? ""} onChange={(e) => setPlano(e.target.value)}>
          {[...grupos.keys()]
            .sort((a, b) => a.localeCompare(b, "es"))
            .map((nombre) => (
              <option key={nombre} value={nombre}>
                {nombre}
              </option>
            ))}
        </NativeSelect>
      </div>
      <p className="text-sm text-muted-foreground">
        Lo que concluyó cada modelo en su revisión más reciente de este plano. Es un resultado preliminar: el visto bueno oficial lo da la DOYC.
      </p>
      <ul className="grid gap-4 lg:grid-cols-2" data-testid="conclusiones">
        {ultimas.map((u, i) => (
          <TarjetaConclusion
            key={u.proyecto.id}
            modelo={u.modelo}
            ronda={u.ronda}
            repeticion={u.repeticion}
            proyecto={u.proyecto}
            datos={consultas[i]?.data}
            cargando={consultas[i]?.isPending ?? true}
          />
        ))}
      </ul>
    </div>
  );
}

function TarjetaConclusion({
  modelo,
  ronda,
  repeticion,
  proyecto,
  datos,
  cargando,
}: {
  modelo: string;
  ronda: number;
  repeticion: number;
  proyecto: Project;
  datos?: PreCheckServidor;
  cargando: boolean;
}) {
  const encabezado = (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-base font-semibold">{modelo}</h3>
      <Link href={`/projects/${proyecto.id}/precheck`} className="inline-flex shrink-0 items-center gap-1 text-xs text-brand hover:underline">
        Ver revisión completa <ExternalLink aria-hidden className="size-3" />
      </Link>
    </div>
  );
  if (cargando || !datos) {
    return (
      <li className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        {encabezado}
        <p role="status" className="text-sm text-muted-foreground">
          Cargando…
        </p>
      </li>
    );
  }
  const terminada = datos.ia?.status === "done";
  const dictamen = datos.project.expediente?.dictamen;
  const titulos = Object.fromEntries((datos.precheck.rules ?? []).map((r) => [r.id, r.title]));
  const ejecucion = {
    projectId: proyecto.id,
    nombre: proyecto.name,
    modelo: datos.ia?.modelo ?? null,
    iaTerminada: terminada,
    resultados: datos.precheck.results,
    titulos,
  };
  const c = contarEstados(ejecucion);
  const faltas = contarFaltasEnPlano(ejecucion);
  const problemas = datos.precheck.results.filter((r) => r.status === "FAIL" && !r.fueraDeCatalogo);
  const vistos = new Set<string>();
  const unicos = problemas.filter((r) => {
    const t = titulos[r.ruleId] ?? r.ruleId;
    if (vistos.has(t)) return false;
    vistos.add(t);
    return true;
  });

  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      {encabezado}
      <p className="-mt-2 text-xs text-muted-foreground">
        Ronda {ronda}
        {repeticion > 1 ? ` · repetición ${repeticion}` : ""} · {formatDay(datos.estado.createdAt.slice(0, 10))}
      </p>
      {!terminada ? (
        <p className="text-sm text-muted-foreground">Esta revisión no terminó, así que no dejó conclusión.</p>
      ) : (
        <>
          <p className="text-sm">{dictamen?.conclusion ? conclusionLegible(dictamen.conclusion) : <span className="text-muted-foreground">El modelo no escribió una conclusión.</span>}</p>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Cifra etiqueta="Cumple" valor={c.PASS} clase="text-pass" />
            <Cifra etiqueta="No cumple" valor={c.FAIL} clase="text-fail" />
            <Cifra etiqueta="Observación" valor={c.WARNING + c.MANUAL_REVIEW} clase="text-warning" />
          </dl>
          <p className="-mt-1 text-xs text-muted-foreground">
            {faltas ? `De los «no cumple», ${faltas} ${faltas === 1 ? "es" : "son"} contenido que falta en el plano. ` : ""}
            Cuenta cada regla del catálogo una sola vez; el texto del modelo puede contar de otra forma.
          </p>
          {unicos.length ? (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Lo que pide corregir</p>
              <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm">
                {unicos.slice(0, MAX_PROBLEMAS).map((r) => (
                  <li key={r.ruleId}>{titulos[r.ruleId] ?? r.ruleId}</li>
                ))}
              </ul>
              {unicos.length > MAX_PROBLEMAS ? (
                <p className="text-xs text-muted-foreground">y {unicos.length - MAX_PROBLEMAS} más en la revisión completa.</p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </li>
  );
}

function Cifra({ etiqueta, valor, clase }: { etiqueta: string; valor: number; clase: string }) {
  return (
    <div className="rounded-md border p-2">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className={`tabular text-xl font-semibold ${clase}`}>{valor}</dd>
    </div>
  );
}
