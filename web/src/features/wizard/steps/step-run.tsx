"use client";

import { Fragment, useState } from "react";
import { Play } from "lucide-react";
import { DatosMotorCampos, declaracionesDe, type ValoresMotor } from "@/features/plans/components/datos-motor-campos";
import { UploadedPlanReading } from "@/features/plans";
import { PlanRegions } from "@/features/projects/components/plans/plan-regions";
import type { DatosMotor } from "@/services/prechecks/cliente";
import { datosSinConfirmar, mensajeSinConfirmar } from "@/lib/barrera-precheck";
import { Button } from "@/components/ui/button";
import { Callout, CalloutBlock, PreliminaryNotice } from "@/components/common";
import { useWizardStore } from "@/stores/wizard";
import type { PlanFact } from "@/types";
import { completarConDocumentos } from "@/lib/documentos-complementarios";
import { nombreProvisional } from "../hooks/use-ensure-project";
import { useStartPreCheck } from "../hooks/use-start-precheck";
import { usePlansReadiness } from "../hooks/use-plans-readiness";
import { useRegionesRevisadas } from "../hooks/use-regiones-revisadas";
import { useValidarDatos } from "../hooks/use-validar-datos";
import { useCorrectPlanData } from "@/hooks/use-api";
import type { AvisoDato } from "@/services/planos/cliente";
import { PlansReadiness } from "../components/plans-readiness";
import { VariablesDefinidas } from "../components/variables-definidas";
import { leerCuadro, mensajeErroresCuadro } from "@/features/plans/lib/cuadro-datos";
import { WizardFooter } from "../wizard-footer";
import { NORMAS_MOTOR } from "@/features/plans/lib/normas";

/** Norma del lote según el corregimiento leído (como scripts/lote_ia.py): el Casco Antiguo (San Felipe) tiene su norma
 * del MIVIOT y San Francisco la modificación del Acuerdo 270. La persona la puede cambiar. */
export function normaPorCorregimiento(corregimiento: string | null | undefined): string {
  const c = (corregimiento ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (c.includes("san felipe")) return "MIVIOT-CA-R127-2003";
  if (c.includes("san francisco")) return "PLOT-A61-2021+A270-2025";
  return "PLOT-A61-2021";
}

const valorDe = (hechos: PlanFact[] | undefined, clave: string) => {
  const h = hechos?.find((x) => x.hecho === clave);
  return h && h.valor !== null && h.valor !== "" && (h.estado === "ok" || h.corregido || h.confirmado) ? String(h.valor) : null;
};

/** Paso 2: lo leído del plano, solo las preguntas de lo que no se pudo comprobar, y el botón de ejecutar. */
export function StepRun({ onBack }: { onBack: () => void }) {
  const files = useWizardStore((s) => s.files);
  const start = useStartPreCheck();
  const real = process.env.NEXT_PUBLIC_PRECHECK_MODE !== "demo";
  const subidos = files.filter((f) => f.format === "PDF" && f.status === "uploaded" && f.planId);
  const pdfs = subidos.filter((f) => !f.complementario).map((f) => ({ planId: f.planId as string, name: f.name }));
  const docs = subidos.filter((f) => f.complementario).map((f) => ({ planId: f.planId as string, name: f.name }));
  const lectura = usePlansReadiness(real ? pdfs : []);
  const lecturaDocs = usePlansReadiness(real ? docs : []);
  // Los datos del plano, completados con los de los documentos complementarios (igual que en el servidor).
  const delPlano = lectura.principal?.extraction?.hechos;
  const complementos = lecturaDocs.lecturas.map((p) => ({ nombre: p.fileName, hechos: p.extraction?.hechos ?? [] }));
  const hechos = delPlano ? completarConDocumentos(delPlano, complementos) : undefined;

  const [tramite, setTramite] = useState("RLA");
  const [fecha, setFecha] = useState(() => new Date().toLocaleDateString("sv-SE"));
  const [normaElegida, setNormaElegida] = useState<string | null>(null);
  const [zonaEscrita, setZonaEscrita] = useState<string | null>(null);
  const [respuestas, setRespuestas] = useState<Partial<ValoresMotor>>({});
  // Variables definidas por el arquitecto: lo que escribe aquí manda sobre la lectura del plano y sobre la IA.
  const zonaDefinida = useWizardStore((s) => s.zonaDefinida ?? "");
  const setZonaDefinida = useWizardStore((s) => s.setZonaDefinida);
  const textosCuadro = useWizardStore((s) => s.cuadroDatos ?? {});
  const setCuadroDato = useWizardStore((s) => s.setCuadroDato);
  const cuadro = leerCuadro(textosCuadro);
  const erroresCuadro = real ? mensajeErroresCuadro(cuadro.errores) : null;
  const zona = zonaDefinida.trim() || (zonaEscrita ?? valorDe(hechos, "plano.zonificacion_declarada") ?? "");
  const definidas = [...(zonaDefinida.trim() ? ["lote.codigo_zona"] : []), ...Object.keys(cuadro.datos)];
  const norma = normaElegida ?? (hechos ? normaPorCorregimiento(valorDe(hechos, "lote.corregimiento")) : "");
  const declaraciones = declaracionesDe({ norma, zona, tramite, fecha, ...respuestas });
  const datos: DatosMotor = {
    nombreProyecto: nombreProvisional(pdfs[0]?.name),
    tramite,
    fechaPresentacion: fecha,
    normaAplicable: norma,
    ...(zona ? { codigoZona: zona } : {}),
    ...(declaraciones ? { declaraciones } : {}),
    ...(Object.keys(cuadro.datos).length ? { datosDeclarados: cuadro.datos } : {}),
    ...(definidas.length ? { definidas } : {}),
  };

  // Validación corta de lo que escribió o confirmó el usuario: avisa antes de gastar la corrida.
  const area = hechos?.find((h) => h.hecho === "lote.area_m2")?.valor;
  const avisosDatos = useValidarDatos(
    { zona, norma, finca: valorDe(hechos, "lote.finca") ?? "", corregimiento: valorDe(hechos, "lote.corregimiento") ?? "", ...(typeof area === "number" ? { area_m2: area } : {}) },
    real && Boolean(hechos),
  );
  const corregirPlano = useCorrectPlanData(lectura.principal?.id ?? "");
  const aplicarSugerencia = (a: AvisoDato) => {
    if (!a.sugerencia) return;
    if (a.campo === "zona") {
      if (zonaDefinida.trim()) setZonaDefinida(a.sugerencia);
      else if (zonaEscrita !== null) setZonaEscrita(a.sugerencia);
      else corregirPlano.mutate({ "plano.zonificacion_declarada": a.sugerencia });
    } else if (a.campo === "finca") corregirPlano.mutate({ "lote.finca": a.sugerencia });
    else if (a.campo === "corregimiento") corregirPlano.mutate({ "lote.corregimiento": a.sugerencia });
  };
  const sinPdf = real && pdfs.length === 0;
  const esperandoLectura = real && !sinPdf && (lectura.leyendo || lectura.listos === 0 || lecturaDocs.leyendo);
  // El área definida por el arquitecto vale como confirmada.
  const areaDefinida = cuadro.datos["lote.area_m2"];
  const hechosBarrera = hechos && areaDefinida !== undefined ? [...hechos.filter((h) => h.hecho !== "lote.area_m2"), { hecho: "lote.area_m2", valor: areaDefinida, confianza: 1, estado: "ok" as const, fuente: null, confirmado: true }] : hechos;
  const sinConfirmar = real && hechosBarrera ? datosSinConfirmar(hechosBarrera, zona) : [];
  const faltaNorma = real && !esperandoLectura && !norma;
  // Regiones del plano: solo avisa; sin ellas la revisión se hace igual, con menos apoyo.
  const regiones = useRegionesRevisadas(real ? (lectura.principal?.id ?? null) : null);
  const avisoRegiones = !regiones || regiones.revisadas > 0
    ? null
    : regiones.proponiendo
      ? "Las regiones del plano se están proponiendo: si ejecuta ahora, la IA contará las plazas de estacionamiento y medirá los retiros solo a simple vista."
      : regiones.total === 0
        ? "El plano no tiene regiones: la IA contará las plazas de estacionamiento y medirá los retiros solo a simple vista. Puede proponerlas y revisarlas a la izquierda."
        : "Ninguna región del plano está confirmada ni corregida: la IA contará las plazas de estacionamiento y medirá los retiros solo a simple vista. Revíselas a la izquierda.";
  const motivoBloqueo = sinPdf
    ? "El motor de reglas necesita un plano PDF: vuelva al paso «Cargar el plano»."
    : lectura.leyendo || lecturaDocs.leyendo
      ? "Leyendo el plano y los documentos. Con GLM-OCR, una hoja escaneada tarda varios minutos."
      : lectura.listos === 0
        ? "No se pudo leer ningún plano: suba otro PDF."
        : sinConfirmar.length
          ? mensajeSinConfirmar(sinConfirmar)
          : faltaNorma
            ? "Elija la norma aplicable."
            : erroresCuadro;

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Esto es lo que se leyó del plano. Lo que quedó comprobado no necesita nada; solo confirme o corrija lo que se marca como pendiente.
      </p>
      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(var(--spacing-panel-sm),var(--spacing-panel))]">
        <div className="flex min-w-0 flex-col gap-4">
          {real
            ? pdfs.map((f) => (
                <Fragment key={f.planId}>
                  <UploadedPlanReading planId={f.planId} fileName={f.name} contexto={{ zona }} complementos={complementos} />
                  {lectura.planos.some((p) => p.planId === f.planId && p.status === "ready") ? <PlanRegions planId={f.planId} fileName={f.name} /> : null}
                </Fragment>
              ))
            : null}
          {real ? <VariablesDefinidas zona={zonaDefinida} onZona={setZonaDefinida} cuadro={textosCuadro} onCuadro={setCuadroDato} definidas={definidas.length} /> : null}
          {real && docs.length ? (
            <details className="rounded-lg border bg-card p-4" open={lecturaDocs.leyendo}>
              <summary className="cursor-pointer font-semibold">
                Documentos complementarios <span className="font-normal text-muted-foreground">({docs.length})</span>
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                Sus datos completan los del plano cuando el plano no los trae o los trae dudosos; en la lectura del plano se indica de qué documento salió cada uno.
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {docs.map((d) => (
                  <UploadedPlanReading key={d.planId} planId={d.planId} fileName={d.name} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 self-start rounded-lg border bg-plan-paper p-5 lg:sticky lg:top-4">
          {real ? <PlansReadiness planos={[...lectura.planos, ...lecturaDocs.planos]} /> : null}
          {avisosDatos.length ? (
            <CalloutBlock tone={avisosDatos.some((a) => a.nivel === "error") ? "fail" : "warning"} title="Revise estos datos antes de ejecutar">
              <ul className="flex flex-col gap-2">
                {avisosDatos.map((a) => (
                  <li key={a.campo} className="flex flex-col gap-1">
                    <span>{a.mensaje}</span>
                    <div className="flex flex-wrap gap-2">
                      {a.norma_sugerida ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => setNormaElegida(a.norma_sugerida ?? null)}>
                          {`Usar la norma ${NORMAS_MOTOR.find((n) => n.codigo === a.norma_sugerida)?.nombre ?? a.norma_sugerida}`}
                        </Button>
                      ) : null}
                      {a.sugerencia ? (
                        <Button type="button" size="sm" variant="outline" loading={corregirPlano.isPending} onClick={() => aplicarSugerencia(a)}>
                          {`Usar «${a.sugerencia}»`}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-2xs text-muted-foreground">Es solo un aviso: si el dato es correcto, puede ejecutar igual.</p>
            </CalloutBlock>
          ) : null}
          {sinConfirmar.length ? (
            <Callout tone="manual" title="Falta un dato">
              {motivoBloqueo}
            </Callout>
          ) : null}
          {real && !esperandoLectura ? (
            <details className="rounded-md border bg-card p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Norma, zona y trámite <span className="font-normal text-muted-foreground">({norma || "sin norma"}{zona ? ` · ${zona}` : ""} · {tramite})</span>
              </summary>
              <div className="mt-3">
                <DatosMotorCampos
                  valores={{ norma, zona, tramite, fecha, ...respuestas }}
                  onChange={(c) => {
                    if (c.norma !== undefined) setNormaElegida(c.norma);
                    if (c.zona !== undefined) setZonaEscrita(c.zona);
                    if (c.tramite !== undefined) setTramite(c.tramite);
                    if (c.fecha !== undefined) setFecha(c.fecha);
                    const preguntas = Object.fromEntries(Object.entries(c).filter(([k]) => ["urbanizacion", "servidumbreOtra", "servidumbreHidrica", "bcbrp"].includes(k)));
                    if (Object.keys(preguntas).length) setRespuestas((r) => ({ ...r, ...preguntas }));
                  }}
                />
              </div>
            </details>
          ) : null}
          <Button
            size="lg"
            className="h-12 text-base"
            onClick={() => start.mutate(real ? datos : undefined)}
            loading={start.isPending}
            disabled={sinPdf || esperandoLectura || sinConfirmar.length > 0 || faltaNorma || Boolean(erroresCuadro)}
          >
            {start.isPending ? null : <Play aria-hidden />}
            {start.isPending ? "Iniciando…" : "Ejecutar PreCheck"}
          </Button>
          {motivoBloqueo && !sinConfirmar.length && !start.isPending ? <p className="text-sm text-muted-foreground">{motivoBloqueo}</p> : null}
          {avisoRegiones ? (
            <Callout tone="warning" title="Sin regiones revisadas">
              {avisoRegiones}
            </Callout>
          ) : null}
          {start.error ? (
            <p role="alert" className="text-sm text-fail">
              No se pudo iniciar: {start.error.message}
            </p>
          ) : null}
        </div>
      </div>
      <PreliminaryNotice />
      <WizardFooter onBack={onBack} />
    </div>
  );
}
