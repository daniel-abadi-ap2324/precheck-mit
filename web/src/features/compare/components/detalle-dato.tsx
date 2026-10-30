import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";

import { nombreModelo, type Ejecucion } from "../lib/comparacion";

const METODOS: Record<string, string> = {
  vision: "visto en la lámina",
  texto: "leído del texto del PDF",
  medicion: "medido en el dibujo",
  humano: "confirmado por una persona",
  ocr: "leído con OCR",
};

/**
 * Cómo leyó cada corrida un dato: valor, confianza, método, lo que anotó (dónde lo vio, cómo lo contó) y la lámina
 * donde lo leyó, con su miniatura. Responde «¿qué identificó cada modelo en el plano?» para un dato concreto.
 */
export function DetalleDato({ clave, etiqueta, ejecuciones, onCerrar }: { clave: string; etiqueta: string; ejecuciones: Ejecucion[]; onCerrar: () => void }) {
  return (
    <section aria-label={`Cómo leyó cada corrida: ${etiqueta}`} className="flex flex-col gap-3 rounded-lg border bg-card p-4" data-testid="detalle-dato">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Cómo lo leyó cada modelo: {etiqueta}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Lo que cada corrida anotó al escribir el dato: dónde lo vio, cómo lo contó o midió y en qué lámina. Pulse la lámina para verla en grande.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar el detalle del dato">
          <X aria-hidden className="size-4" />
        </Button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ejecuciones.map((e) => {
          const d = e.datos?.[clave];
          const lamina = d?.pagina && e.precheckId ? `/api/prechecks/${e.precheckId}/paginas/${d.pagina}` : null;
          return (
            <li key={e.projectId} className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{nombreModelo(e.modelo)}</p>
                <Link href={`/projects/${e.projectId}/precheck`} className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
                  Abrir revisión <ExternalLink aria-hidden className="size-3" />
                </Link>
              </div>
              <p className="truncate text-xs text-muted-foreground" title={e.nombre}>
                {e.nombre}
              </p>
              {d ? (
                <>
                  <p className="text-lg font-semibold tabular">{d.valor || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {typeof d.confianza === "number" ? `Confianza ${d.confianza}` : "Sin confianza"}
                    {d.metodo ? ` · ${METODOS[d.metodo] ?? d.metodo}` : ""}
                    {d.pagina ? ` · lámina ${d.pagina}` : ""}
                  </p>
                  {d.detalle ? <p className="text-sm whitespace-pre-line">{d.detalle}</p> : <p className="text-sm text-muted-foreground">No anotó cómo lo leyó.</p>}
                  {lamina ? (
                    <a href={lamina} target="_blank" rel="noreferrer" className="block overflow-hidden rounded border bg-muted" title={`Abrir la lámina ${d.pagina} en grande`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={lamina} alt={`Lámina ${d.pagina} de ${e.nombre}`} loading="lazy" className="h-40 w-full object-contain" />
                    </a>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Esta corrida no escribió el dato.</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
