"use client";

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/common";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { MAX_EMPLEADOS_XTRA, tituloRevisionIa, urlRegistroIa, type EstadoXtra, type ProveedorIa } from "@/services/ia/cliente";
import { useConfigIa, useRegistroIa, useRevisionIa } from "../hooks";

const NOMBRE_PROVEEDOR = {
  "claude-code": "Claude Code en este equipo",
  "anthropic-api": "API de Anthropic",
  "deepseek-api": "API de DeepSeek",
} as const;

/**
 * A quién va el plano y con qué modelo, tal como se lanzará. El aviso nombraba siempre a Anthropic, también con
 * DeepSeek: quien confirma tiene que saber a qué empresa salen los datos.
 */
export function destinoRevision(proveedor: Exclude<ProveedorIa, "ninguno">, modelo: string): string {
  if (proveedor === "deepseek-api") return `DeepSeek (${modelo})`;
  if (proveedor === "anthropic-api") return `Anthropic (${modelo}) por API`;
  return `Claude Code en este equipo (${modelo})`;
}

/** Cuánto hace que la IA escribió algo en el registro; los silencios largos son normales (piensa o genera un archivo grande). */
function ActividadIa({ segundos }: { segundos?: number | null }) {
  if (segundos === null || segundos === undefined) return <span className="block text-xs">Todavía no hay actividad en el registro.</span>;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 1) return <span className="block text-xs">Última actividad hace menos de un minuto.</span>;
  return (
    <span className="block text-xs" data-testid="actividad-ia">
      Sin actividad hace {minutos} min.{minutos >= 3 ? " Es normal: la IA puede estar pensando o generando un archivo largo." : ""}
    </span>
  );
}

/** Avance de la revisión XTRA: cuántos empleados terminaron y si ya trabaja el maestro. */
export function textoAvanceXtra(x: EstadoXtra): string {
  if (x.fase === "maestro") return `Los empleados terminaron (${x.terminados} de ${x.empleados}${x.fallidos ? `, ${x.fallidos} sin terminar` : ""}). El agente maestro está revisando lo que dijeron.`;
  return `Los empleados están revisando: ${x.terminados + x.fallidos} de ${x.empleados} listos${x.fallidos ? ` (${x.fallidos} sin terminar)` : ""}. Después el agente maestro revisa lo que dijeron.`;
}

/**
 * Revisión con IA de un PreCheck real: decide las reglas que el motor dejó «en revisión» y escribe el dictamen.
 * Envía el contenido del PreCheck al proveedor configurado, así que solo se lanza al confirmar el aviso.
 */
export function AiReviewPanel({ precheckId }: { precheckId: string }) {
  const config = useConfigIa();
  const { estado, pedir } = useRevisionIa(precheckId);
  const [confirmando, setConfirmando] = useState(false);
  const [modeloElegido, setModeloElegido] = useState<string | null>(null);
  // Revisión XTRA (solo con Claude Code): 1 agente maestro (el modelo elegido) y de 1 a 10 empleados.
  const [xtra, setXtra] = useState(false);
  const [empleados, setEmpleados] = useState(3);
  const [modeloEmpleados, setModeloEmpleados] = useState<string | null>(null);
  const ia = estado.data;
  const proveedor = config.data?.proveedor;
  const apagada = proveedor === "ninguno";
  const sinLlave =
    proveedor === "anthropic-api" && !config.data?.llaveConfigurada;
  const sinLlaveDeepSeek =
    proveedor === "deepseek-api" && config.data?.deepseek?.llave === false;
  const sinClaude =
    proveedor === "claude-code" && config.data?.claudeCodeDisponible === false;
  const enCurso = ia?.status === "running";
  // Con la IA trabajando, el registro se abre solo (es lo que se quiere ver); la persona puede cerrarlo.
  const [aperturaManual, setAperturaManual] = useState<boolean | null>(null);
  const verRegistro = aperturaManual ?? enCurso;
  const setVerRegistro = (f: (v: boolean) => boolean) =>
    setAperturaManual(f(verRegistro));
  const registro = useRegistroIa(precheckId, verRegistro, enCurso);
  const hayRegistro = Boolean(ia);

  return (
    <section
      aria-label="Revisión con IA"
      className="flex flex-col gap-2 rounded-lg border bg-card p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles aria-hidden className="size-4" />{" "}
            {tituloRevisionIa(ia ?? (confirmando && xtra ? { xtra: { empleados, modeloEmpleados: "", fase: "empleados", terminados: 0, fallidos: 0 } } : null))}
          </h2>
          <p className="text-2xs text-muted-foreground">
            {ia
              ? // Lo que produjo ESTA revisión (su proveedor y modelo), no lo que está configurado ahora.
                ia.xtra
                ? `${NOMBRE_PROVEEDOR[ia.proveedor as keyof typeof NOMBRE_PROVEEDOR] ?? ia.proveedor} · maestro ${ia.modelo} · ${ia.xtra.empleados} ${ia.xtra.empleados === 1 ? "empleado" : "empleados"} ${ia.xtra.modeloEmpleados}`
                : `${NOMBRE_PROVEEDOR[ia.proveedor as keyof typeof NOMBRE_PROVEEDOR] ?? ia.proveedor} · ${ia.modelo}${ia.modeloPedido ? ` (plano escaneado; se pidió ${ia.modeloPedido})` : ""} · proveedor y modelo de esta revisión; el predeterminado se cambia en Configuración`
              : !config.data
                ? "Consultando…"
                : proveedor !== "ninguno"
                  ? `${NOMBRE_PROVEEDOR[proveedor as keyof typeof NOMBRE_PROVEEDOR]} · ${config.data.modelo} · se cambia en Configuración`
                  : "Apagada · se cambia en Configuración"}
          </p>
        </div>
        {!confirmando ? (
          <Button
            size="sm"
            onClick={() => setConfirmando(true)}
            disabled={
              !config.data ||
              apagada ||
              sinLlave ||
              sinLlaveDeepSeek ||
              sinClaude ||
              enCurso
            }
            loading={enCurso}
          >
            {enCurso
              ? "La IA está revisando…"
              : ia?.status === "done"
                ? "Volver a revisar con IA"
                : "Revisar con IA"}
          </Button>
        ) : null}
      </div>
      {confirmando ? (
        <div className="flex flex-col gap-2">
          {config.data && proveedor && proveedor !== "ninguno" ? (
            <Callout tone="warning" title="Antes de enviar">
              <span data-testid="destino-ia">
                Se enviará el plano a{" "}
                {destinoRevision(proveedor, modeloElegido ?? config.data.modelo)}
              </span>
              : los datos leídos, las reglas y{" "}
              {proveedor === "claude-code"
                ? "las láminas (Claude Code las procesa en los servidores de Anthropic)"
                : proveedor === "deepseek-api"
                  ? "el texto y los recortes de las láminas que pida"
                  : "los resultados del motor"}
              . No la use con expedientes que no deban salir de este equipo.
            </Callout>
          ) : null}
          {config.data && proveedor !== "ninguno" ? (
            <div className="flex max-w-md flex-col gap-1.5">
              <Label htmlFor="ia-modelo-revision">
                {xtra ? "Modelo del agente maestro" : "Modelo para esta revisión"}
              </Label>
              <NativeSelect
                id="ia-modelo-revision"
                value={modeloElegido ?? config.data.modelo}
                onChange={(e) => setModeloElegido(e.target.value)}
              >
                {config.data.modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-2xs text-muted-foreground">
                Solo vale para esta revisión; el modelo por defecto se cambia en
                Configuración.
              </p>
            </div>
          ) : null}
          {config.data && proveedor === "claude-code" ? (
            <fieldset className="flex max-w-md flex-col gap-1.5 rounded-md border p-2">
              <legend className="px-1 text-sm font-medium">Revisión XTRA</legend>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={xtra} onChange={(e) => setXtra(e.target.checked)} />
                <span>
                  Usar varios agentes: los empleados revisan el plano por separado y después el agente maestro revisa lo que dijeron y escribe el dictamen.
                </span>
              </label>
              {xtra ? (
                <>
                  <Label htmlFor="ia-xtra-empleados">Agentes empleados (1 a {MAX_EMPLEADOS_XTRA})</Label>
                  <NativeSelect id="ia-xtra-empleados" value={String(empleados)} onChange={(e) => setEmpleados(Number(e.target.value))}>
                    {Array.from({ length: MAX_EMPLEADOS_XTRA }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </NativeSelect>
                  <Label htmlFor="ia-xtra-modelo">Modelo de los empleados</Label>
                  <NativeSelect id="ia-xtra-modelo" value={modeloEmpleados ?? config.data.modelo} onChange={(e) => setModeloEmpleados(e.target.value)}>
                    {config.data.modelos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </NativeSelect>
                  <p className="text-2xs text-muted-foreground">
                    Cuesta y tarda más: son {empleados + 1} revisiones en total ({empleados} {empleados === 1 ? "empleado" : "empleados"} y el maestro). Los empleados corren hasta 3 a la vez.
                  </p>
                </>
              ) : null}
            </fieldset>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={pedir.isPending}
              onClick={() =>
                pedir.mutate({ modelo: modeloElegido ?? undefined, xtra: xtra && proveedor === "claude-code" ? { empleados, modeloEmpleados: modeloEmpleados ?? config.data?.modelo ?? "" } : undefined }, {
                  onSettled: () => setConfirmando(false),
                })
              }
            >
              Enviar y revisar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmando(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
      {apagada ? (
        <p className="text-sm text-muted-foreground">
          La revisión con IA está apagada. Actívela en Configuración → Revisión
          con IA.
        </p>
      ) : null}
      {sinLlave ? (
        <p className="text-sm text-muted-foreground">
          Falta la llave de la API de Anthropic: agréguela en Configuración →
          Revisión con IA.
        </p>
      ) : null}
      {sinLlaveDeepSeek ? (
        <p className="text-sm text-muted-foreground">
          Falta la llave de DeepSeek en el servidor (DEEPSEEK_API_KEY o
          ~/.config/precheck/deepseek.env).
        </p>
      ) : null}
      {sinClaude ? (
        <p className="text-sm text-muted-foreground">
          No se encontró Claude Code en este equipo. Instálelo o elija la API de
          Anthropic.
        </p>
      ) : null}
      {enCurso ? (
        <Callout tone="processing">
          {ia?.enEspera
            ? `En espera de turno: hay ${ia.revisionesCorriendo ?? 0} revisiones en curso (máximo ${ia.maxParalelo ?? 3} a la vez). Empieza sola cuando se libere una.`
            : ia?.xtra
              ? textoAvanceXtra(ia.xtra)
              : "La IA está revisando las reglas en revisión. Con Claude Code puede tardar varios minutos."}
          {ia && !ia.enEspera ? <ActividadIa segundos={ia.segundosSinActividad} /> : null}
        </Callout>
      ) : null}
      {ia?.status === "done" ? (
        <Callout tone="info">
          Dictamen de la IA aplicado a los resultados. Es preliminar y no
          oficial: el visto bueno lo da el Revisor DOYC.
        </Callout>
      ) : null}
      {ia?.status === "done" && ia.aviso ? (
        <Callout tone="warning" title="Revisión posiblemente superficial">
          {ia.aviso}
        </Callout>
      ) : null}
      {ia?.status === "failed" ? (
        <Callout tone="fail" title="La revisión con IA falló">
          {ia.error}
        </Callout>
      ) : null}
      {pedir.error ? (
        <Callout tone="fail">{pedir.error.message}</Callout>
      ) : null}
      {hayRegistro ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button
              size="sm"
              variant="outline"
              aria-expanded={verRegistro}
              aria-controls="registro-ia"
              onClick={() => setVerRegistro((v) => !v)}
            >
              Registro de la IA
              <ChevronDown
                aria-hidden
                className={
                  verRegistro
                    ? "rotate-180 transition-transform motion-reduce:transition-none"
                    : "transition-transform motion-reduce:transition-none"
                }
              />
            </Button>
          </div>
          {verRegistro ? (
            <div id="registro-ia" className="flex flex-col gap-1.5">
              <pre
                aria-label="Registro de la revisión con IA"
                className="max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 text-2xs break-words whitespace-pre-wrap"
              >
                {registro.data ??
                  (registro.isPending
                    ? "Cargando…"
                    : "Todavía no hay registro.")}
              </pre>
              <p className="text-2xs text-muted-foreground">
                Guardar una copia:{" "}
                <a
                  className="underline"
                  href={urlRegistroIa(precheckId, "txt", true)}
                >
                  texto (.txt)
                </a>{" "}
                ·{" "}
                <a
                  className="underline"
                  href={urlRegistroIa(precheckId, "jsonl", true)}
                >
                  eventos (.jsonl)
                </a>
              </p>
            </div>
          ) : null}
          <p className="text-2xs text-muted-foreground">
            El registro tiene los mensajes y las herramientas que usó la IA (no
            su razonamiento interno completo) y datos del expediente: queda solo
            en este equipo.
          </p>
        </div>
      ) : null}
    </section>
  );
}
