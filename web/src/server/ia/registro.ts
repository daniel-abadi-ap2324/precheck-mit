import { appendFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { carpetaPreCheck } from "@/server/prechecks/almacen";

/**
 * Registro de lo que hace la revisión con IA, en la carpeta del PreCheck:
 * - ia.log.jsonl: cada evento tal cual lo entrega Claude Code (stream-json), para reutilizarlo como datos.
 * - ia.log.txt: versión legible (mensajes, herramientas y resultados recortados).
 * Claude Code no entrega su razonamiento interno completo: el registro son sus mensajes, sus llamadas a herramientas
 * y, si el modelo los emite, sus bloques de pensamiento. Contiene datos del expediente: queda en disco, fuera de git.
 */
const MAX_BYTES = 20 * 1024 * 1024;
/** Campos con una imagen en base64: `data` (bloque image del mensaje) y `base64` (tool_use_result.file de Claude Code). */
const CAMPOS_IMAGEN = new Set(["data", "base64"]);
const MAX_TEXTO = 1500;
const MAX_RESULTADO = 300;

export type FormatoRegistro = "txt" | "jsonl";
const archivo = (id: string, formato: FormatoRegistro) => join(/* turbopackIgnore: true */ carpetaPreCheck(id), `ia.log.${formato}`);

const recorta = (t: string, max: number) => (t.length > max ? `${t.slice(0, max)}… [+${t.length - max} caracteres]` : t);
/** Hora local de este equipo (HH:MM:SS), la que ve quien mira el registro. */
const hora = () => new Date().toLocaleTimeString("es-PA", { hour12: false });

function textoDe(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b) => (b && typeof b === "object" && "text" in b ? String((b as { text: unknown }).text) : b && typeof b === "object" && (b as { type?: string }).type === "image" ? "[imagen]" : "")).join(" ");
  return "";
}

function resumenHerramienta(nombre: string, entrada: unknown): string {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const clave = e.file_path ?? e.path ?? e.pattern ?? e.command ?? e.description;
  return recorta(`${nombre}${clave ? `: ${String(clave)}` : ""}`, 400);
}

/** Pasa un evento stream-json de Claude Code a líneas legibles (vacío si no aporta nada). */
export function lineasLegibles(evento: unknown): string[] {
  const ev = (evento ?? {}) as { type?: string; subtype?: string; message?: { content?: unknown }; result?: unknown; is_error?: boolean; duration_ms?: number; num_turns?: number };
  const contenido = Array.isArray(ev.message?.content) ? (ev.message?.content as Record<string, unknown>[]) : [];
  const salida: string[] = [];
  if (ev.type === "system" && ev.subtype === "init") salida.push("Sesión de Claude Code iniciada.");
  if (ev.type === "assistant") {
    for (const b of contenido) {
      if (b.type === "thinking" && typeof b.thinking === "string" && b.thinking.trim()) salida.push(`Pensamiento: ${recorta(b.thinking.trim(), MAX_TEXTO)}`);
      else if (b.type === "text" && typeof b.text === "string" && b.text.trim()) salida.push(`Mensaje: ${recorta(b.text.trim(), MAX_TEXTO)}`);
      else if (b.type === "tool_use") salida.push(`Herramienta → ${resumenHerramienta(String(b.name ?? "?"), b.input)}`);
    }
  }
  if (ev.type === "user") {
    for (const b of contenido) {
      if (b.type === "tool_result") {
        const t = textoDe(b.content).replace(/\s+/g, " ").trim();
        salida.push(`Resultado${b.is_error ? " (error)" : ""}: ${recorta(t, MAX_RESULTADO) || "(vacío)"}`);
      }
    }
  }
  if (ev.type === "result") {
    salida.push(`Fin${ev.is_error ? " con error" : ""}: ${ev.num_turns ?? "?"} turnos, ${Math.round((ev.duration_ms ?? 0) / 1000)} s.${typeof ev.result === "string" ? ` ${recorta(ev.result, 600)}` : ""}`);
  }
  return salida;
}

/** Escribe el registro de una ejecución, con tope de tamaño; los errores de escritura nunca detienen la revisión. */
export class RegistroIa {
  private bytes = 0;
  /** Motivo con que Claude Code dio por terminada la sesión (evento final: completed, hook_stopped…), si lo dijo. */
  terminal: string | undefined;
  /** Texto del error con que Claude Code terminó (evento final con is_error), p. ej. «Can't reach the API server». */
  errorFinal: string | undefined;
  private cola: Promise<unknown> = Promise.resolve();
  private resto = "";

  private recortado = false;

  /**
   * `carpeta`: otra carpeta para el registro (la de un empleado de la revisión XTRA); por defecto, la del PreCheck.
   * `maxBytes`: tope de lo que escribe el agente (solo para pruebas).
   */
  constructor(
    private readonly id: string,
    private readonly carpeta?: string,
    private readonly maxBytes = MAX_BYTES,
  ) {}

  /**
   * Una línea de texto legible con hora, del servidor (inicio, enrutamiento, pendientes, fin). Se escribe aunque el
   * registro haya llegado al tope: son pocas y cortas, y dicen cómo terminó la revisión.
   */
  texto(linea: string): void {
    this.escribir("txt", `[${hora()}] ${linea}\n`, true);
  }

  /** Datos crudos de stdout (pueden llegar partidos en cualquier punto): se separan por líneas. */
  stdout(trozo: string): void {
    const partes = (this.resto + trozo).split("\n");
    this.resto = partes.pop() ?? "";
    for (const l of partes) this.linea(l);
  }

  /** Procesa lo que quedó sin salto de línea al cerrar. */
  cerrar(): Promise<unknown> {
    if (this.resto.trim()) this.linea(this.resto);
    this.resto = "";
    return this.cola;
  }

  private linea(l: string): void {
    const t = l.trim();
    if (!t) return;
    try {
      const ev: unknown = JSON.parse(t);
      const final = ev as { type?: string; terminal_reason?: unknown; is_error?: unknown; result?: unknown };
      if (final.type === "result" && final.is_error && typeof final.result === "string") this.errorFinal = final.result;
      if (final.type === "result" && typeof final.terminal_reason === "string") this.terminal = final.terminal_reason;
      // Las imágenes que abre el agente llegan en base64 (megas por lámina): se anota que hubo una, sin el contenido.
      // Claude Code las repite en tool_use_result.file.base64: sin quitar esa copia, Fable llenó el tope de 20 MB a
      // mitad de la revisión y se perdió la línea final con el costo (r81, 26-oct).
      const sinImagenes = JSON.stringify(ev, (k, v: unknown) => (CAMPOS_IMAGEN.has(k) && typeof v === "string" && v.length > 2000 ? `[imagen omitida: ${v.length} caracteres base64]` : v));
      // El evento final (costo, turnos, motivo) se escribe siempre, aunque el registro ya esté en el tope.
      this.escribir("jsonl", `${sinImagenes}\n`, final.type === "result");
      for (const x of lineasLegibles(ev)) this.escribir("txt", `[${hora()}] ${x}\n`);
    } catch {
      this.escribir("jsonl", `${JSON.stringify({ type: "salida_no_json", texto: recorta(t, 2000) })}\n`);
      this.escribir("txt", `[${hora()}] Salida: ${recorta(t, MAX_RESULTADO)}\n`);
    }
  }

  private escribir(formato: FormatoRegistro, contenido: string, siempre = false): void {
    if (this.bytes > this.maxBytes && !siempre) {
      if (!this.recortado) {
        this.recortado = true;
        this.anexar("txt", `[${hora()}] Registro recortado: se llegó al tope de ${Math.round(this.maxBytes / 1024 / 1024)} MB; desde aquí solo se anotan las líneas del servidor y el evento final.\n`);
      }
      return;
    }
    this.bytes += contenido.length;
    this.anexar(formato, contenido);
  }

  private anexar(formato: FormatoRegistro, contenido: string): void {
    this.cola = this.cola.then(() => appendFile(/* turbopackIgnore: true */ this.carpeta ? join(/* turbopackIgnore: true */ this.carpeta, `ia.log.${formato}`) : archivo(this.id, formato), contenido, "utf8")).catch(() => undefined);
  }
}

/** Momento (ISO) de la última línea escrita en el registro: la última actividad de la IA; null si no hay registro. */
export async function ultimaActividadRegistro(id: string): Promise<string | null> {
  const info = await stat(/* turbopackIgnore: true */ archivo(id, "txt")).catch(() => null);
  return info?.isFile() ? info.mtime.toISOString() : null;
}

/** Contenido del registro (el final, si es muy grande); null si no existe. */
export async function leerRegistro(id: string, formato: FormatoRegistro, maxBytes = 2 * 1024 * 1024): Promise<string | null> {
  const ruta = archivo(id, formato);
  const info = await stat(/* turbopackIgnore: true */ ruta).catch(() => null);
  if (!info?.isFile()) return null;
  const texto = await readFile(/* turbopackIgnore: true */ ruta, "utf8");
  return texto.length > maxBytes ? `[… registro recortado: se muestran los últimos ${maxBytes} caracteres]\n${texto.slice(-maxBytes)}` : texto;
}
