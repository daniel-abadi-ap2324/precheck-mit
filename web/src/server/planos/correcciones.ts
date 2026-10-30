import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlanExtraction, PlanFact } from "@/types";
import { carpetaDe } from "./almacen";

/**
 * Correcciones del usuario a lo que leyó el lector de planos. Se guardan aparte (correcciones.json): la
 * extracción original (extraccion.json) no se modifica, para poder ver qué leyó el lector y qué cambió la persona.
 * Una entrada corrige el dato (`valor`) o lo confirma tal como se leyó (`confirmado: true`, sin valor).
 */
export type Valor = string | number;
export interface Correccion {
  valor?: Valor;
  confirmado?: true;
  actualizadoEn: string;
}
export type Correcciones = Record<string, Correccion>;
/** Un valor corrige (o agrega) el dato; `{ confirmar: true }` lo confirma sin cambiarlo; null deshace lo uno o lo otro. */
export type Cambio = Valor | { confirmar: true } | null;

/** Rutas de hechos del motor: lote.area_m2, proyecto.pisos_totales, plano.zonificacion_declarada… */
export const CLAVE_HECHO = /^(?:lote|proyecto|plano|expediente)\.[a-z0-9_]{1,60}$/;
const MAX_TEXTO = 200;
const MAX_CORRECCIONES = 100;

export const valorValido = (v: unknown): v is Valor =>
  (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.trim().length > 0 && v.length <= MAX_TEXTO);

/** `{ "confirmar": true }` exacto (cualquier otro objeto no es un cambio válido). */
export const esConfirmar = (v: unknown): v is { confirmar: true } =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 1 && (v as { confirmar?: unknown }).confirmar === true;

/** Un hecho que se puede confirmar: el lector lo leyó con un solo valor (si dudó, hay que corregirlo). */
export const confirmable = (h: PlanFact | undefined): boolean => Boolean(h && h.estado === "ok" && h.valor !== null);

const archivo = (id: string) => join(/* turbopackIgnore: true */ carpetaDe(id), "correcciones.json");

/** La extracción tal como la dejó el lector (null si no existe o está dañada). */
export async function leerExtraccionOriginal(id: string): Promise<PlanExtraction | null> {
  const texto = await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ carpetaDe(id), "extraccion.json"), "utf8").catch(() => null);
  if (!texto) return null;
  try {
    return JSON.parse(texto) as PlanExtraction;
  } catch {
    return null;
  }
}

function entradaValida(v: unknown): v is Correccion {
  if (!v || typeof v !== "object") return false;
  const e = v as { valor?: unknown; confirmado?: unknown };
  return valorValido(e.valor) || e.confirmado === true;
}

export async function leerCorrecciones(id: string): Promise<Correcciones> {
  try {
    const crudo: unknown = JSON.parse(await readFile(/* turbopackIgnore: true */ archivo(id), "utf8"));
    if (!crudo || typeof crudo !== "object") return {};
    return Object.fromEntries(Object.entries(crudo).filter(([k, v]) => CLAVE_HECHO.test(k) && entradaValida(v))) as Correcciones;
  } catch {
    return {};
  }
}

/** Aplica los cambios por clave y devuelve las correcciones vigentes. */
export async function guardarCorrecciones(id: string, cambios: Record<string, Cambio>): Promise<Correcciones> {
  const actuales = await leerCorrecciones(id);
  const ahora = new Date().toISOString();
  for (const [clave, cambio] of Object.entries(cambios)) {
    if (cambio === null) delete actuales[clave];
    else if (esConfirmar(cambio)) actuales[clave] = { confirmado: true, actualizadoEn: ahora };
    else actuales[clave] = { valor: cambio, actualizadoEn: ahora };
  }
  if (Object.keys(actuales).length > MAX_CORRECCIONES) throw new Error("Demasiadas correcciones.");
  await writeFile(/* turbopackIgnore: true */ archivo(id), JSON.stringify(actuales, null, 1));
  return actuales;
}

/**
 * La extracción con las correcciones puestas, con procedencia «humano» y confianza 1: el dato corregido lleva el valor
 * de la persona (y el que había leído el lector); el confirmado conserva el valor leído y queda `confirmado`. Una
 * confirmación de un dato que ya no se lee con certeza se ignora (no hay valor que confirmar).
 */
export function aplicarCorrecciones(ext: PlanExtraction, correcciones: Correcciones): PlanExtraction {
  const claves = Object.keys(correcciones);
  if (!claves.length) return ext;
  const humano = { metodo: "humano" as const, pagina: 0, bbox: [0, 0, 0, 0] as [number, number, number, number] };
  const corregido = (hecho: string, valor: Valor, original: PlanFact | undefined): PlanFact => ({
    ...(original ? {} : { agregado: true }),
    hecho,
    valor,
    confianza: 1,
    estado: "ok",
    fuente: humano,
    corregido: true,
    valorOriginal: original?.valor ?? null,
  });
  const revisado = (h: PlanFact): PlanFact => {
    const c = correcciones[h.hecho];
    if (!c) return h;
    if (c.valor !== undefined) return corregido(h.hecho, c.valor, h);
    if (!confirmable(h)) return h;
    // Se conserva la página y el recuadro donde se leyó: la persona confirmó ese texto.
    return { ...h, confianza: 1, estado: "ok", fuente: { ...(h.fuente ?? humano), metodo: "humano" }, confirmado: true };
  };
  const existentes = new Set(ext.hechos.map((h) => h.hecho));
  return {
    ...ext,
    hechos: [
      ...ext.hechos.map(revisado),
      ...claves.filter((c) => !existentes.has(c) && correcciones[c].valor !== undefined).map((c) => corregido(c, correcciones[c].valor as Valor, undefined)),
    ],
  };
}
