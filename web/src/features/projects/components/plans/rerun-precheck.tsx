"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/common";
import { CuadroDatosAnteproyecto } from "@/features/plans/components/cuadro-datos-anteproyecto";
import { leerCuadro, mensajeErroresCuadro, textosDe, type TextosCuadro } from "@/features/plans/lib/cuadro-datos";
import { datosSinConfirmar, mensajeSinConfirmar } from "@/lib/barrera-precheck";
import { DatosMotorCampos, declaracionesDe, respuestasDe, type ValoresMotor } from "@/features/plans/components/datos-motor-campos";
import { api } from "@/services/api";
import { esPreCheckReal, leerPreCheckReciente } from "@/services/prechecks/cliente";
import type { PlanExtraction, Project } from "@/types";

const hoy = () => new Date().toLocaleDateString("sv-SE");

/**
 * Vuelve a ejecutar el motor con los planos del proyecto y las correcciones hechas arriba. Precarga los datos del
 * último PreCheck (norma, zona, trámite, fecha y el cuadro de datos) para cambiarlos si hace falta. No deja ejecutar
 * sin la finca, el área y la zona confirmadas o corregidas en `lectura` (la del plano que evaluará el motor).
 */
export function RerunPreCheck({ project, lectura }: { project: Project; lectura?: PlanExtraction | null }) {
  const router = useRouter();
  const previo = useQuery({
    queryKey: ["precheck-servidor", project.precheckId ?? ""],
    // La misma lectura que hizo getProject al cargar el proyecto: no se vuelve a pedir al servidor.
    queryFn: () => leerPreCheckReciente(project.precheckId as string),
    enabled: Boolean(project.precheckId && esPreCheckReal(project.precheckId)),
  });
  const datos = previo.data?.estado.datos;
  const [cambios, setCambios] = useState<Partial<ValoresMotor>>({});
  const valores: ValoresMotor = {
    norma: cambios.norma ?? datos?.normaAplicable ?? "",
    zona: cambios.zona ?? datos?.codigoZona ?? project.zoningCode ?? "",
    tramite: cambios.tramite ?? datos?.tramite ?? project.tramite ?? "RLA",
    fecha: cambios.fecha ?? datos?.fechaPresentacion ?? hoy(),
    ...respuestasDe(datos?.declaraciones),
    ...Object.fromEntries(Object.entries(cambios).filter(([k]) => ["urbanizacion", "servidumbreOtra", "servidumbreHidrica", "bcbrp"].includes(k))),
  };
  const declaraciones = declaracionesDe(valores);
  const [cuadroEscrito, setCuadroEscrito] = useState<TextosCuadro>({});
  const textosCuadro: TextosCuadro = { ...textosDe(datos?.datosDeclarados), ...cuadroEscrito };
  const cuadro = leerCuadro(textosCuadro);
  const erroresCuadro = mensajeErroresCuadro(cuadro.errores);
  const sinConfirmar = lectura ? datosSinConfirmar(lectura.hechos, valores.zona) : [];
  const ejecutar = useMutation({
    mutationFn: () =>
      api.startPreCheck(project.id, {
        nombreProyecto: project.name,
        tramite: valores.tramite,
        fechaPresentacion: valores.fecha,
        normaAplicable: valores.norma,
        ...(valores.zona ? { codigoZona: valores.zona } : {}),
        ...(declaraciones ? { declaraciones } : {}),
        ...(Object.keys(cuadro.datos).length ? { datosDeclarados: cuadro.datos } : {}),
      }),
    onSuccess: ({ precheckId }) => router.push(`/projects/${project.id}/processing?run=${encodeURIComponent(precheckId)}`),
  });

  return (
    <section aria-label="Volver a ejecutar el PreCheck" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div>
        <h2 className="font-semibold">Volver a ejecutar el PreCheck</h2>
        <p className="text-sm text-muted-foreground">El motor usa los planos de este proyecto con los datos corregidos. El resultado anterior se conserva.</p>
      </div>
      <DatosMotorCampos idPrefix="rerun" valores={valores} onChange={(c) => setCambios((v) => ({ ...v, ...c }))} />
      <CuadroDatosAnteproyecto idPrefix="rerun-cuadro" textos={textosCuadro} onChange={(clave, texto) => setCuadroEscrito((c) => ({ ...c, [clave]: texto }))} />
      {sinConfirmar.length ? (
        <Callout tone="manual" title="Falta confirmar datos">
          {mensajeSinConfirmar(sinConfirmar)}
        </Callout>
      ) : erroresCuadro ? (
        <p className="text-sm text-muted-foreground">{erroresCuadro}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => ejecutar.mutate()} loading={ejecutar.isPending} disabled={!valores.norma || sinConfirmar.length > 0 || Boolean(erroresCuadro)}>
          {ejecutar.isPending ? null : <RotateCw aria-hidden />}
          {ejecutar.isPending ? "Iniciando…" : "Volver a ejecutar"}
        </Button>
        {ejecutar.error ? (
          <p role="alert" className="text-sm text-fail">
            No se pudo iniciar: {ejecutar.error.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
