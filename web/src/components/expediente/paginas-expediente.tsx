"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, FileText } from "lucide-react";
import type { ExpedienteInfo, HojaExpediente, MarcaPlano } from "@/types";
import { buttonVariants, Button } from "@/components/ui/button";
import { documentoDeExpedienteUrl, paginaDeExpedienteUrl } from "@/services/expedientes/cliente";
import { anclaPagina } from "@/lib/dictamen";
import { marcasDePagina } from "@/lib/marcas";
import { cn } from "@/lib/utils";

const hojaDe = (info: ExpedienteInfo, n: number): HojaExpediente | undefined => info.hojas?.find((h) => h.numero === n);

function rotuloPagina(info: ExpedienteInfo, n: number): string {
  const hoja = hojaDe(info, n);
  return [`Página ${n}`, hoja?.lamina ? `lámina ${hoja.lamina}` : null].filter(Boolean).join(" · ");
}

/** Enlace al PDF original (otra pestaña; la CSP no permite incrustarlo). Sin PDF disponible, lo dice. */
export function EnlaceDocumento({ projectId, info, className }: { projectId: string; info: ExpedienteInfo; className?: string }) {
  if (!info.documento) return null;
  if (!info.documentoDisponible) {
    return <p className={cn("text-xs text-muted-foreground", className)}>El PDF original no está en la carpeta de anteproyectos del servidor.</p>;
  }
  return (
    <a href={documentoDeExpedienteUrl(projectId)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), className)}>
      <FileText aria-hidden />
      Abrir el PDF original
      <ExternalLink aria-hidden />
      <span className="sr-only">(se abre en otra pestaña)</span>
    </a>
  );
}

/** Miniaturas de las páginas del documento; cada una abre la imagen completa en otra pestaña. */
export function MiniaturasExpediente({ projectId, info }: { projectId: string; info: ExpedienteInfo }) {
  const paginas = info.miniaturas ?? [];
  if (paginas.length === 0) return <p className="text-sm text-muted-foreground">Las miniaturas de las páginas no están en la carpeta del expediente.</p>;
  return (
    <ul aria-label="Páginas del documento" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {paginas.map((n) => {
        const hoja = hojaDe(info, n);
        return (
          // El ancla permite enlazar una página desde la evidencia del dictamen (resaltada con :target).
          <li key={n} id={anclaPagina(n)} className="min-w-0 scroll-mt-24 overflow-hidden rounded-md border bg-card target:ring-2 target:ring-brand">
            <a href={paginaDeExpedienteUrl(projectId, n)} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90">
              {/* PNG generado por el agente revisor-planos; se sirve detrás de la sesión, sin el optimizador de imágenes. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={paginaDeExpedienteUrl(projectId, n)} alt={rotuloPagina(info, n)} loading="lazy" className="aspect-[3/4] w-full bg-plan-paper object-contain" />
              <span className="sr-only"> (abre la imagen en otra pestaña)</span>
            </a>
            <div className="space-y-0.5 p-2 text-2xs">
              <p className="truncate font-medium text-compact">{rotuloPagina(info, n)}</p>
              {hoja?.tipo ? <p className="text-muted-foreground">{hoja.tipo === "escaneada" ? "escaneada (OCR)" : "texto del PDF"}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Visor de una página a la vez (panel del plano en la revisión). `inicial`: página citada por la regla elegida. */
/** Rectángulos numerados sobre la lámina. Fracciones 0–1 de la página; el SVG se estira con la imagen. */
function CapaMarcas({ marcas }: { marcas: MarcaPlano[] }) {
  if (!marcas.length) return null;
  return (
    <svg aria-hidden viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full">
      {marcas.map((m, i) => (
        <g key={`${m.x}-${m.y}-${i}`}>
          <rect x={m.x} y={m.y} width={m.w} height={m.h} className="fill-fail/15 stroke-fail" strokeWidth={3} strokeDasharray="10 6" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </svg>
  );
}

export function VisorPaginasExpediente({ projectId, info, inicial, marcas }: { projectId: string; info: ExpedienteInfo; inicial?: number | null; marcas?: MarcaPlano[] }) {
  const paginas = info.miniaturas ?? [];
  const [elegida, setElegida] = useState<{ n: number; para: number | null | undefined } | null>(null);
  // La página citada por la regla manda hasta que el usuario elige otra; al cambiar de regla, vuelve a mandar.
  const actual = elegida && elegida.para === inicial ? elegida.n : inicial && paginas.includes(inicial) ? inicial : (paginas[0] ?? null);
  const idx = actual === null ? -1 : paginas.indexOf(actual);
  const ir = (n: number) => setElegida({ n, para: inicial });
  const marcasAqui = marcasDePagina(marcas, actual);
  const marcasOtras = (marcas ?? []).filter((m) => m.pagina !== actual);

  return (
    <section aria-label="Documento del expediente" className="flex h-full min-h-0 flex-col bg-muted/40">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={info.documento ?? undefined}>
          {info.documento ?? "Documento del expediente"}
        </p>
        {paginas.length ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Página anterior" disabled={idx <= 0} onClick={() => ir(paginas[idx - 1])}>
              <ChevronLeft aria-hidden />
            </Button>
            <label className="sr-only" htmlFor="pagina-expediente">
              Página
            </label>
            <select id="pagina-expediente" value={actual ?? ""} onChange={(e) => ir(Number(e.target.value))} className="h-8 rounded-md border bg-card px-2 text-sm">
              {paginas.map((n) => (
                <option key={n} value={n}>
                  {rotuloPagina(info, n)}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="icon-sm" aria-label="Página siguiente" disabled={idx < 0 || idx >= paginas.length - 1} onClick={() => ir(paginas[idx + 1])}>
              <ChevronRight aria-hidden />
            </Button>
          </div>
        ) : null}
        <EnlaceDocumento projectId={projectId} info={info} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {actual === null ? (
          <p className="text-sm text-muted-foreground">Las miniaturas de las páginas no están en la carpeta del expediente.</p>
        ) : (
          // El contenedor se ajusta al tamaño de la imagen para que las marcas (fracciones de la página) coincidan.
          <div key={actual} className="relative mx-auto w-fit max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={paginaDeExpedienteUrl(projectId, actual)} alt={rotuloPagina(info, actual)} className="block h-auto max-w-full bg-plan-paper shadow-sm" />
            <CapaMarcas marcas={marcasAqui} />
          </div>
        )}
      </div>
      {marcas?.length ? (
        <ul aria-label="Marcas de la regla" className="max-h-28 space-y-0.5 overflow-auto border-t bg-card px-3 py-1.5 text-xs">
          {marcas.map((m, i) => (
            <li key={`${m.pagina}-${m.x}-${m.y}-${i}`} className="flex gap-1.5">
              <button type="button" className="font-medium underline" onClick={() => ir(m.pagina)}>
                p. {m.pagina}
              </button>
              <span className="text-muted-foreground">
                recuadro punteado rojo{m.origen === "lector" ? " (dato que leyó el lector)" : " (ubicado por la IA)"}
                {m.etiqueta ? `: ${m.etiqueta}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="border-t bg-card px-3 py-1.5 text-xs text-muted-foreground">
        Páginas del documento revisado.{" "}
        {marcasAqui.length
          ? `${marcasAqui.length} ${marcasAqui.length === 1 ? "marca" : "marcas"} de la regla en esta página.`
          : marcasOtras.length
            ? "La regla tiene marcas en otras páginas (lista de arriba)."
            : "Esta regla no tiene recuadro: la IA no pudo ubicar el hallazgo en la lámina (por ejemplo, algo que falta). Vea la evidencia en el detalle."}
      </p>
    </section>
  );
}
