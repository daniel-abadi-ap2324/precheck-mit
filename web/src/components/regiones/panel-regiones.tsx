"use client";

import { useId } from "react";
import { CircleCheck, Trash2, X } from "lucide-react";
import type { RegionPlano, TipoRegion } from "@/types";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { colorDeTipo, conteoPorTipo, etiquetaDeTipo, MAX_ETIQUETA, TIPOS_REGION } from "@/lib/regiones";
import { cn } from "@/lib/utils";
import { EstadoRegion, procedencia } from "./estado-region";

/** Leyenda de colores con el conteo por tipo de las regiones dadas. */
export function LeyendaRegiones({ regiones }: { regiones: RegionPlano[] }) {
  const filas = conteoPorTipo(regiones);
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Leyenda (esta página)</h4>
      {filas.length ? (
        <ul aria-label="Leyenda de regiones" className="space-y-0.5 text-xs">
          {filas.map((t) => (
            <li key={t.tipo} className="flex items-center gap-1.5">
              <span aria-hidden className="size-3 shrink-0 rounded-sm border" style={{ backgroundColor: t.color, borderColor: t.color }} />
              <span className="flex-1">{t.etiqueta}</span>
              <span className="tabular font-medium">{t.conteo}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Sin regiones en esta página.</p>
      )}
    </div>
  );
}

/** Lista de regiones de la página: alternativa con teclado a hacer clic en la lámina. */
export function ListaRegiones({ regiones, seleccion, onSeleccionar }: { regiones: RegionPlano[]; seleccion: string | null; onSeleccionar: (id: string) => void }) {
  if (!regiones.length) return null;
  return (
    <ul aria-label="Regiones de esta página" className="max-h-56 space-y-1 overflow-auto pr-1">
      {regiones.map((r, i) => (
        <li key={r.id}>
          <button
            type="button"
            aria-pressed={r.id === seleccion}
            onClick={() => onSeleccionar(r.id)}
            className={cn("flex w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs hover:bg-muted", r.id === seleccion && "border-ring bg-muted")}
          >
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colorDeTipo(r.tipo) }} />
            <span className="min-w-0 flex-1 truncate">
              {`${i + 1}. ${etiquetaDeTipo(r.tipo)}`}
              {r.etiqueta ? ` · ${r.etiqueta}` : ""}
              <span className="block truncate text-2xs text-muted-foreground">{procedencia(r)}</span>
            </span>
            <EstadoRegion region={r} />
          </button>
        </li>
      ))}
    </ul>
  );
}

interface DetalleProps {
  region: RegionPlano;
  vertice: number | null;
  onTipo: (t: TipoRegion) => void;
  onEtiqueta: (t: string) => void;
  onConfirmar: () => void;
  onQuitarVertice: () => void;
  onQuitarRegion: () => void;
  onCerrar: () => void;
}

/** Región elegida: tipo, rótulo, procedencia y acciones. */
export function DetalleRegion({ region, vertice, onTipo, onEtiqueta, onConfirmar, onQuitarVertice, onQuitarRegion, onCerrar }: DetalleProps) {
  const id = useId();
  return (
    <section aria-label="Región elegida" className="space-y-2 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <h4 className="flex-1 text-sm font-semibold">Región elegida</h4>
        <Button variant="ghost" size="icon-xs" aria-label="Cerrar la región elegida" onClick={onCerrar}>
          <X aria-hidden />
        </Button>
      </div>
      <EstadoRegion region={region} size="md" />
      <p className="text-xs text-muted-foreground">Origen: {procedencia(region)}</p>
      <div className="space-y-1">
        <label htmlFor={`${id}-tipo`} className="text-xs font-medium">
          Tipo
        </label>
        <NativeSelect id={`${id}-tipo`} value={region.tipo} onChange={(e) => onTipo(e.target.value as TipoRegion)}>
          {TIPOS_REGION.map((t) => (
            <option key={t.tipo} value={t.tipo}>
              {t.etiqueta}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-etiqueta`} className="text-xs font-medium">
          Rótulo (opcional)
        </label>
        <input
          id={`${id}-etiqueta`}
          value={region.etiqueta}
          maxLength={MAX_ETIQUETA}
          onChange={(e) => onEtiqueta(e.target.value)}
          className="h-8 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {region.puntos.length} vértices. Arrastre un vértice para moverlo; doble clic en un lado agrega uno.
        {vertice !== null ? ` Vértice ${vertice + 1} elegido.` : ""}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant={region.confirmada ? "outline" : "default"} disabled={region.confirmada} onClick={onConfirmar}>
          <CircleCheck aria-hidden />
          {region.confirmada ? "Región confirmada" : "Confirmar región"}
        </Button>
        <Button size="sm" variant="outline" disabled={vertice === null || region.puntos.length <= 3} onClick={onQuitarVertice}>
          Quitar vértice
        </Button>
        <Button size="sm" variant="destructive" onClick={onQuitarRegion}>
          <Trash2 aria-hidden />
          Quitar región
        </Button>
      </div>
    </section>
  );
}
