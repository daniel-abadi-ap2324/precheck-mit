"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, RefreshCw, Shapes, Sparkles } from "lucide-react";
import { Callout, ErrorState } from "@/components/common";
import { EditorRegiones } from "@/components/regiones";
import { Button } from "@/components/ui/button";
import { useEnVista } from "@/hooks/use-en-vista";
import { queryKeys } from "@/lib/query-keys";
import { etiquetaVision } from "@/lib/regiones";
import { guardarRegionesPlano, imagenRegionesUrl, leerRegionesPlano, proponerRegionesPlano, type RegionesServidor } from "@/services/planos/regiones";

const clave = queryKeys.planRegions;
/** Cada cuánto se consulta mientras se proponen las regiones. */
export const INTERVALO_MS = 3000;

/**
 * «Regiones del plano» (paso 2 del flujo): propuesta automática de polígonos por tipo y su revisión a mano. El PreCheck
 * copia las regiones guardadas a su carpeta y la revisión con IA las usa como evidencia, no como medida.
 */
export function PlanRegions({ planId, fileName }: { planId: string; fileName: string }) {
  const qc = useQueryClient();
  // La lámina grande (r<N>.png, varios MB) solo se pide cuando la sección llega a la vista.
  const [refSeccion, enVista] = useEnVista<HTMLElement>();
  const { data, error, refetch } = useQuery({
    queryKey: clave(planId),
    queryFn: () => leerRegionesPlano(planId),
    // Mientras Python propone, se consulta cada pocos segundos (también con la pestaña en segundo plano: la propuesta
    // con visión tarda minutos y la persona suele cambiar de pestaña) y se deja de consultar al terminar.
    refetchInterval: (q) => (q.state.data?.propuesta.status === "processing" ? INTERVALO_MS : false),
    refetchIntervalInBackground: true,
    // Una propuesta lanzada fuera de esta página (otra pestaña, scripts/lote_ia.py) se ve al volver a la pestaña.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const proponer = useMutation({
    mutationFn: (vision: boolean) => proponerRegionesPlano(planId, vision),
    onSuccess: ({ propuesta }) => {
      // El 202 ya dice «processing»: se pone en la caché para que el sondeo empiece aunque la relectura tarde o falle,
      // y la mutación termina sin esperar esa relectura (no retiene «Proponiendo…» por su cuenta).
      qc.setQueryData<RegionesServidor>(clave(planId), (d) => (d ? { ...d, propuesta } : d));
      void qc.invalidateQueries({ queryKey: clave(planId) });
    },
  });
  const procesando = data?.propuesta.status === "processing" || proponer.isPending;
  const regiones = data?.regiones ?? null;
  // El modelo lo elige el servidor (configuración de IA); aquí solo se muestra.
  const modeloVision = data?.modeloVision?.nombre;
  const modeloEnCurso = data?.propuesta.modelo === data?.modeloVision?.id ? modeloVision : data?.propuesta.modelo;

  const botones = (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={procesando} onClick={() => proponer.mutate(false)}>
        <RefreshCw aria-hidden />
        {regiones ? "Proponer de nuevo" : "Proponer regiones"}
      </Button>
      <Button size="sm" variant="outline" disabled={procesando} onClick={() => proponer.mutate(true)}>
        <Sparkles aria-hidden />
        {etiquetaVision(modeloVision)}
      </Button>
    </div>
  );

  return (
    <section ref={refSeccion} aria-label={`Regiones del plano ${fileName}`} className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="flex items-center gap-2 truncate font-semibold" title={fileName}>
          <Shapes aria-hidden className="size-4 text-muted-foreground" />
          {`Regiones del plano · ${fileName}`}
        </h3>
        <p className="text-sm text-muted-foreground">
          El sistema propone el lote, la huella, los retiros, los estacionamientos y demás áreas sobre la lámina; revíselas, corríjalas y confírmelas antes de ejecutar el PreCheck.
        </p>
      </div>
      {error ? (
        <ErrorState variant="inline" error={error} onRetry={() => void refetch()} />
      ) : !data ? (
        <p role="status" className="text-sm text-muted-foreground">
          Consultando las regiones…
        </p>
      ) : (
        <>
          {procesando ? (
            <p role="status" className="flex items-center gap-2 text-sm text-processing">
              <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
              {data.propuesta.vision || (proponer.isPending && proponer.variables)
                ? `Proponiendo regiones con IA (visión${modeloEnCurso ? `, ${modeloEnCurso}` : ""})… puede tardar varios minutos.`
                : "Proponiendo regiones…"}
            </p>
          ) : null}
          {data.propuesta.status === "failed" && data.propuesta.error ? (
            <Callout tone="fail" title="La propuesta falló.">
              {data.propuesta.error}
            </Callout>
          ) : null}
          {proponer.error ? (
            <Callout tone="fail" title="No se pudo proponer.">
              {proponer.error.message}
            </Callout>
          ) : null}
          {data.aviso ? <Callout tone="warning">{data.aviso}</Callout> : null}
          {regiones && !enVista ? (
            <p className="text-sm text-muted-foreground">La lámina se carga al llegar a esta sección.</p>
          ) : regiones ? (
            <EditorRegiones
              key={regiones.generado}
              datos={regiones}
              nombre={fileName}
              imagenUrl={(n) => imagenRegionesUrl(planId, n, regiones.generado)}
              proponiendo={procesando}
              modeloVision={modeloVision}
              onProponer={(vision) => proponer.mutateAsync(vision)}
              onGuardar={async (lista) => {
                const guardado = await guardarRegionesPlano(planId, lista);
                qc.setQueryData<RegionesServidor>(clave(planId), (d) => (d ? { ...d, regiones: guardado } : d));
                return guardado;
              }}
            />
          ) : !procesando ? (
            <>
              <p className="text-sm text-muted-foreground">Este plano todavía no tiene regiones.</p>
              {botones}
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
