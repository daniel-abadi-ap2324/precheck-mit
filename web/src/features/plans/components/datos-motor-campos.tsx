"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { NORMAS_MOTOR } from "../lib/normas";

/** Respuesta a una pregunta sí/no opcional: vacío = sin responder (la regla que la necesita queda en revisión). */
export type Respuesta = "" | "si" | "no";

export interface ValoresMotor {
  norma: string;
  zona: string;
  tramite: string;
  fecha: string;
  /** Declaraciones del expediente que no salen del plano (decisión D9). */
  urbanizacion?: Respuesta;
  servidumbreOtra?: Respuesta;
  servidumbreHidrica?: Respuesta;
  bcbrp?: Respuesta;
}

const PREGUNTAS = [
  { campo: "urbanizacion", etiqueta: "¿Es una urbanización o parcelación?" },
  { campo: "servidumbreHidrica", etiqueta: "¿El lote tiene servidumbre fluvial o pluvial?" },
  { campo: "servidumbreOtra", etiqueta: "¿Hay servidumbre de otra entidad (eléctrica, telefónica, IDAAN…)?" },
  { campo: "bcbrp", etiqueta: "¿Requiere la aprobación del Cuerpo de Bomberos (BCBRP)?" },
] as const;

const aBooleano = (r: Respuesta | undefined) => (r === "si" ? true : r === "no" ? false : undefined);

/** Las respuestas sí/no que sí se contestaron, listas para enviar al servidor; undefined si no hay ninguna. */
export function declaracionesDe(v: ValoresMotor) {
  const d = {
    esUrbanizacionOParcelacion: aBooleano(v.urbanizacion),
    servidumbreFluvialOPluvial: aBooleano(v.servidumbreHidrica),
    servidumbreOtraEntidad: aBooleano(v.servidumbreOtra),
    requiereBcbrp: aBooleano(v.bcbrp),
  };
  const llenas = Object.fromEntries(Object.entries(d).filter(([, x]) => x !== undefined));
  return Object.keys(llenas).length ? llenas : undefined;
}

/** Al revés: las declaraciones guardadas de un PreCheck anterior como respuestas del formulario. */
export function respuestasDe(d: { esUrbanizacionOParcelacion?: boolean; servidumbreFluvialOPluvial?: boolean; servidumbreOtraEntidad?: boolean; requiereBcbrp?: boolean } | undefined): Pick<ValoresMotor, "urbanizacion" | "servidumbreHidrica" | "servidumbreOtra" | "bcbrp"> {
  const r = (x: boolean | undefined): Respuesta => (x === undefined ? "" : x ? "si" : "no");
  return { urbanizacion: r(d?.esUrbanizacionOParcelacion), servidumbreHidrica: r(d?.servidumbreFluvialOPluvial), servidumbreOtra: r(d?.servidumbreOtraEntidad), bcbrp: r(d?.requiereBcbrp) };
}

/** Lo que el motor necesita saber del lote y que no se adivina: norma, código de zona, trámite y fecha. */
export function DatosMotorCampos({ valores, onChange, idPrefix = "motor" }: { valores: ValoresMotor; onChange: (cambio: Partial<ValoresMotor>) => void; idPrefix?: string }) {
  const faltaNorma = !valores.norma;
  return (
    <fieldset className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
      <legend className="px-1 text-sm font-semibold">Datos para el motor de reglas</legend>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-norma`}>Norma aplicable al lote</Label>
        <NativeSelect id={`${idPrefix}-norma`} value={valores.norma} onChange={(e) => onChange({ norma: e.target.value })} aria-invalid={faltaNorma}>
          <option value="">Elija la norma…</option>
          {NORMAS_MOTOR.map((n) => (
            <option key={n.codigo} value={n.codigo}>
              {n.nombre}
            </option>
          ))}
        </NativeSelect>
        {faltaNorma ? <p className="text-2xs text-muted-foreground">La zona del lote no se resolvió sola: elija la norma que corresponde (la certificación CEUS prevalece).</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-zona`}>Código de zona</Label>
        <Input id={`${idPrefix}-zona`} value={valores.zona} onChange={(e) => onChange({ zona: e.target.value })} maxLength={40} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-tramite`}>Trámite</Label>
        <Input id={`${idPrefix}-tramite`} value={valores.tramite} onChange={(e) => onChange({ tramite: e.target.value })} maxLength={40} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-fecha`}>Fecha de presentación</Label>
        <Input id={`${idPrefix}-fecha`} type="date" value={valores.fecha} onChange={(e) => onChange({ fecha: e.target.value })} />
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <p className="text-xs text-muted-foreground">Datos del expediente que no salen del plano (opcionales). Sin responder, esas reglas quedan «requiere revisión».</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {PREGUNTAS.map((p) => (
            <div key={p.campo} className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-${p.campo}`}>{p.etiqueta}</Label>
              <NativeSelect id={`${idPrefix}-${p.campo}`} value={valores[p.campo] ?? ""} onChange={(e) => onChange({ [p.campo]: e.target.value as Respuesta })}>
                <option value="">Sin responder</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </NativeSelect>
            </div>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
