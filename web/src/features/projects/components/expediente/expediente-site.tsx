"use client";

import { useProject } from "@/hooks/use-api";
import { Callout, ErrorState, SkeletonRows } from "@/components/common";
import { DatosLeidos } from "@/components/expediente";

const ZONA = new Set(["lote.codigo_zona", "lote.norma_aplicable"]);

/**
 * /projects/[id]/site de un expediente real: los datos del lote leídos del plano, con su confianza y fuente. Sin
 * mapa: el expediente no trae el polígono del lote ni su ubicación en el catastro, y no se dibuja uno inventado.
 */
export function ExpedienteSite({ projectId }: { projectId: string }) {
  const { data: project, isPending, error, refetch } = useProject(projectId);
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} className="m-4 md:m-6" />;
  if (isPending) return <SkeletonRows rows={8} className="m-4 rounded-lg border bg-card p-4 md:m-6" />;
  const info = project.expediente;
  if (!info) return <ErrorState message="El expediente no trae los datos del lote." className="m-4 md:m-6" />;

  const zona = info.lote.filter((d) => ZONA.has(d.clave));
  const lote = info.lote.filter((d) => !ZONA.has(d.clave));
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">Datos del lote leídos del plano (no es el catastro de la ANATI)</h2>
        <Callout tone="info">
          El agente revisor-planos leyó estos datos del plano del expediente; cada uno lleva su confianza y su fuente. No se contrastaron con el
          Registro Público ni con el catastro, y el expediente no trae el polígono del lote: por eso no se muestra un mapa.
        </Callout>
      </div>
      <section aria-labelledby="zona-titulo" className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <h3 id="zona-titulo" className="font-semibold">
          Zonificación y norma aplicable
        </h3>
        <DatosLeidos datos={zona} umbral={info.umbral} label="Zonificación leída del plano" />
        <p className="text-xs text-muted-foreground">Certificación de uso de suelo (CEUS): no consta. Si existe, prevalece sobre la zona leída del plano.</p>
      </section>
      <section aria-labelledby="lote-titulo" className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <h3 id="lote-titulo" className="font-semibold">
          Lote
        </h3>
        <DatosLeidos datos={lote} umbral={info.umbral} label="Datos del lote leídos del plano" />
      </section>
    </div>
  );
}
