"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMarcadores } from "../hooks/use-marcadores";
import { enlaceDeMarcador, TIPOS_MARCADOR } from "../lib/marcadores";
import { META_TIPO } from "./guardar-marcador";
import { textoCorrida } from "./marcadores-page";

const CUANTOS = 5;

/** Panel: los últimos marcadores guardados (también los de corridas de prueba: los guardó el usuario). */
export function MarcadoresRecientes() {
  const { data, isPending, error } = useMarcadores();
  const items = (data ?? []).slice(0, CUANTOS);
  return (
    <section aria-labelledby="marcadores-recientes" className="rounded-lg border bg-card">
      <header className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
        <h2 id="marcadores-recientes" className="font-semibold">
          Marcadores
        </h2>
        <Link href="/marcadores" className="text-sm text-brand hover:underline">
          Ver todos los marcadores →
        </Link>
      </header>
      {error ? (
        <p className="px-4 py-6 text-center text-sm text-fail">No se pudieron leer los marcadores.</p>
      ) : isPending ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Guarde una conclusión con «Guardar» en la revisión.</p>
      ) : (
        <ul data-testid="marcadores-recientes">
          {items.map((m) => {
            const { icono: Icono, clase } = META_TIPO[m.tipo];
            return (
              <li key={m.id} className="border-b last:border-0">
                <Link href={enlaceDeMarcador(m)} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                  <Icono aria-label={TIPOS_MARCADOR[m.tipo].etiqueta} className={cn("size-4 shrink-0", clase)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.foto.regla?.titulo ?? "Conclusión del dictamen"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.foto.plano}
                      {textoCorrida(m) ? ` · ${textoCorrida(m)}` : ""}
                    </p>
                  </div>
                  <ChevronRight aria-hidden className="size-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
