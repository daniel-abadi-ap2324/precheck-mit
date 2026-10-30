import { spawn } from "node:child_process";
import { access, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RegionPlano, RegionesPlano } from "@/types";
import { confianzaDe, ErrorRegiones, esTipoRegion, MAX_ETIQUETA, MAX_REGIONES, revisadaPorPersona, validarPuntos, validarRegionesPlano } from "@/lib/regiones";
import { leerConfig, modeloPorDefecto, MODELOS, raiz } from "@/server/ia/config";
import { MODELO_DEEPSEEK } from "@/server/ia/deepseek";
import { enCurso, encolar, esperar } from "@/server/trabajos";
import { carpetaDe } from "./almacen";
import { partirComando, PYTHON, REPO } from "./procesar";

/**
 * Regiones del plano (paso 2): `regiones.json` y los raster `r<N>.png` en la carpeta del plano. Python las propone
 * (`python -m precheck.planos.regiones proponer …`, PRECHECK_REGIONES permite otro comando en pruebas) y la persona las
 * edita en la web. Al guardar, el servidor decide el origen, «editada» y la confianza: no se fía de lo que manda el cliente.
 */
export { ErrorRegiones };

/** La propuesta con visión llama a un modelo por cada hoja: puede tardar varios minutos. */
const LIMITE_MS = 20 * 60_000;
const MENSAJE_FALLO = "No se pudieron proponer las regiones del plano. Inténtelo de nuevo o dibújelas a mano.";

/** `modelo`: el que propuso con visión (id de MODELOS). */
export type EstadoPropuesta = { status: "idle" | "processing" | "ready" | "failed"; vision?: boolean; modelo?: string; error?: string; updatedAt?: string };

/**
 * Modelo con el que se propone con visión: el de la configuración de IA (el mismo de la revisión). Los Claude corren con
 * `claude -p`; DeepSeek por su API, con el mismo contador y tope de gasto que la revisión. Con la IA apagada, el modelo
 * guardado puede ser cualquiera: se usa el de Claude Code por defecto (como antes), nunca una API de pago.
 */
export async function modeloVision(): Promise<{ id: string; nombre: string }> {
  const config = await leerConfig();
  const modelo = config.proveedor === "ninguno" ? modeloPorDefecto("claude-code") : config.modelo;
  const nombre = MODELOS.find((m) => m.id === modelo)?.nombre ?? modelo;
  return { id: modelo, nombre: nombre.split(" (")[0] };
}

const archivo = (id: string) => join(/* turbopackIgnore: true */ carpetaDe(id), "regiones.json");
const archivoEstado = (id: string) => join(/* turbopackIgnore: true */ carpetaDe(id), "regiones-estado.json");
const clave = (id: string) => `regiones:${id}`;

/** Escritura atómica: la ruta que responde puede leer mientras otra escribe. */
async function escribirAtomico(destino: string, contenido: string) {
  const tmp = `${destino}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(/* turbopackIgnore: true */ tmp, contenido);
  await rename(/* turbopackIgnore: true */ tmp, destino);
}

/** regiones.json validado, o null si el plano todavía no tiene regiones. Lanza ErrorRegiones si el archivo no sirve. */
export async function leerRegiones(id: string): Promise<RegionesPlano | null> {
  let texto: string;
  try {
    texto = await readFile(/* turbopackIgnore: true */ archivo(id), "utf8");
  } catch {
    return null;
  }
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    throw new ErrorRegiones("regiones.json no es un JSON válido.");
  }
  return validarRegionesPlano(crudo);
}

/** Hay una propuesta de regiones en curso para este plano. */
export const proponiendo = (id: string) => enCurso(clave(id));

export async function estadoPropuesta(id: string): Promise<EstadoPropuesta> {
  if (proponiendo(id)) return { status: "processing" };
  try {
    const e = JSON.parse(await readFile(/* turbopackIgnore: true */ archivoEstado(id), "utf8")) as EstadoPropuesta;
    // «processing» en disco sin trabajo en curso: el servidor se reinició a medio camino.
    if (e.status === "processing") return { ...e, status: "failed", error: "La propuesta se interrumpió (el servidor se reinició). Vuelva a proponer." };
    return e;
  } catch {
    return { status: "idle" };
  }
}

const escribirEstado = (id: string, e: EstadoPropuesta) => escribirAtomico(archivoEstado(id), JSON.stringify({ ...e, updatedAt: new Date().toISOString() }));

const mismaGeometria = (a: RegionPlano, b: Pick<RegionPlano, "tipo" | "puntos" | "pagina">) =>
  a.tipo === b.tipo && a.pagina === b.pagina && a.puntos.length === b.puntos.length && a.puntos.every((p, i) => p[0] === b.puntos[i][0] && p[1] === b.puntos[i][1]);

/**
 * Lo que manda el editor (`{id, pagina, tipo, puntos, etiqueta?, confirmada?}`) → región guardada. El origen, «editada»
 * y la confianza salen de comparar con lo guardado: una región nueva es «humano»; una propuesta cuyo polígono, tipo o
 * página cambió pasa a editada y «humano»; las demás conservan su procedencia.
 */
function regionGuardada(v: unknown, i: number, previas: Map<string, RegionPlano>, datos: RegionesPlano): RegionPlano {
  const donde = `Región ${i + 1}`;
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new ErrorRegiones(`${donde}: no es un objeto.`);
  const r = v as Record<string, unknown>;
  if (typeof r.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(r.id)) throw new ErrorRegiones(`${donde}: identificador no válido.`);
  if (!Number.isInteger(r.pagina) || !datos.paginas[String(r.pagina)]) throw new ErrorRegiones(`${donde}: la página ${String(r.pagina)} no existe en el plano.`);
  if (!esTipoRegion(r.tipo)) throw new ErrorRegiones(`${donde}: el tipo «${String(r.tipo).slice(0, 40)}» no está permitido.`);
  const etiqueta = r.etiqueta ?? "";
  if (typeof etiqueta !== "string" || etiqueta.length > MAX_ETIQUETA) throw new ErrorRegiones(`${donde}: la etiqueta debe ser un texto de hasta ${MAX_ETIQUETA} caracteres.`);
  if (r.confirmada !== undefined && typeof r.confirmada !== "boolean") throw new ErrorRegiones(`${donde}: «confirmada» debe ser sí/no.`);
  const nueva = { id: r.id, pagina: r.pagina as number, tipo: r.tipo, puntos: validarPuntos(r.puntos, donde), etiqueta: etiqueta.trim(), confirmada: r.confirmada === true };
  const previa = previas.get(nueva.id);
  const origen = !previa ? ("humano" as const) : mismaGeometria(previa, nueva) ? previa.origen : ("humano" as const);
  const editada = previa ? previa.editada || !mismaGeometria(previa, nueva) : false;
  const sinCambio = previa && previa.origen === origen && previa.editada === editada && previa.confirmada === nueva.confirmada;
  return { ...nueva, origen, editada, confianza: sinCambio ? previa.confianza : confianzaDe({ origen, editada, confirmada: nueva.confirmada }) };
}

export class ErrorSinRegiones extends Error {}
export class ErrorPropuestaEnCurso extends Error {}

/** Guarda las regiones editadas (la lista completa). Las páginas y la fecha de generación las pone Python. */
export async function guardarRegiones(id: string, regiones: unknown): Promise<RegionesPlano> {
  if (proponiendo(id)) throw new ErrorPropuestaEnCurso("Se están proponiendo regiones para este plano; espere a que termine.");
  const datos = await leerRegiones(id);
  if (!datos) throw new ErrorSinRegiones("El plano todavía no tiene regiones: primero propóngalas.");
  if (!Array.isArray(regiones)) throw new ErrorRegiones("«regiones» debe ser una lista.");
  if (regiones.length > MAX_REGIONES) throw new ErrorRegiones(`Hay más de ${MAX_REGIONES} regiones.`);
  const previas = new Map(datos.regiones.map((r) => [r.id, r]));
  const nuevas = regiones.map((r, i) => regionGuardada(r, i, previas, datos));
  const ids = new Set<string>();
  for (const r of nuevas) {
    if (ids.has(r.id)) throw new ErrorRegiones(`El identificador de región «${r.id}» está repetido.`);
    ids.add(r.id);
  }
  const guardado = validarRegionesPlano({ ...datos, regiones: nuevas });
  await escribirAtomico(archivo(id), JSON.stringify(guardado, null, 1));
  return guardado;
}

/** Regiones que la propuesta automática nunca reemplaza. */
export const esHumana = revisadaPorPersona;

function comando(dir: string, modelo: string | undefined): [string, string[]] {
  const args = ["proponer", "--pdf", join(/* turbopackIgnore: true */ dir, "original.pdf"), "--salida", dir, ...(modelo ? ["--vision", "--modelo", modelo] : [])];
  // La llave de DeepSeek la lee Python igual que la web (entorno o ~/.config/precheck/deepseek.env): nunca va en los argumentos.
  if (modelo === MODELO_DEEPSEEK) args.push("--gasto", raiz());
  args.push("--extraccion", join(/* turbopackIgnore: true */ dir, "extraccion.json"));
  const propio = partirComando(process.env.PRECHECK_REGIONES);
  if (propio?.length) return [propio[0], [...propio.slice(1), ...args]];
  return [PYTHON, ["-m", "precheck.planos.regiones", ...args]];
}

function ejecutar(dir: string, modelo: string | undefined): Promise<{ ok: boolean; stderr: string }> {
  const [bin, args] = comando(dir, modelo);
  return new Promise((fin) => {
    const p = spawn(/* turbopackIgnore: true */ bin, args, { cwd: REPO, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (c: Buffer) => {
      stderr = (stderr + c.toString("utf8")).slice(-2000);
    });
    const reloj = setTimeout(() => p.kill("SIGKILL"), LIMITE_MS);
    p.on("error", () => fin({ ok: false, stderr: "no se pudo lanzar Python" }));
    p.on("close", (code) => {
      clearTimeout(reloj);
      fin({ ok: code === 0, stderr });
    });
  });
}

async function proponer(id: string, modelo: string | undefined) {
  const vision = Boolean(modelo);
  await escribirEstado(id, { status: "processing", vision, modelo });
  const anteriorTexto = await readFile(/* turbopackIgnore: true */ archivo(id), "utf8").catch(() => null);
  const anterior = await leerRegiones(id).catch(() => null);
  const humanas = (anterior?.regiones ?? []).filter(esHumana);
  const restaurar = async () => {
    if (anteriorTexto !== null) await escribirAtomico(archivo(id), anteriorTexto);
  };
  const r = await ejecutar(carpetaDe(id), modelo);
  if (!r.ok) {
    console.warn(`[regiones] ${id}: ${r.stderr.slice(-300)}`);
    await restaurar();
    await escribirEstado(id, { status: "failed", vision, modelo, error: MENSAJE_FALLO });
    return;
  }
  try {
    const nuevo = await leerRegiones(id);
    if (!nuevo) throw new ErrorRegiones("Python no escribió regiones.json.");
    // Python conserva las regiones de la persona; si alguna faltara, se vuelve a poner (nunca se pierde trabajo humano).
    const presentes = new Set(nuevo.regiones.map((x) => x.id));
    const faltan = humanas.filter((h) => !presentes.has(h.id) && nuevo.paginas[String(h.pagina)]);
    if (faltan.length) {
      const combinado = validarRegionesPlano({ ...nuevo, regiones: [...faltan, ...nuevo.regiones].slice(0, MAX_REGIONES) });
      await escribirAtomico(archivo(id), JSON.stringify(combinado, null, 1));
    }
    await escribirEstado(id, { status: "ready", vision, modelo });
  } catch (e) {
    console.warn(`[regiones] ${id}: ${e instanceof Error ? e.message.slice(0, 300) : "error"}`);
    await restaurar();
    await escribirEstado(id, { status: "failed", vision, modelo, error: MENSAJE_FALLO });
  }
}

/**
 * Encola la propuesta de regiones (una a la vez en todo el servidor: la visión ocupa la cuenta del usuario).
 * Con visión usa el modelo de la configuración de IA (`modeloVision`). Devuelve el estado inicial.
 * Lanza ErrorPropuestaEnCurso si ya hay una para este plano.
 */
export async function proponerRegiones(id: string, { vision = false }: { vision?: boolean } = {}): Promise<EstadoPropuesta> {
  if (proponiendo(id)) throw new ErrorPropuestaEnCurso("Ya se están proponiendo regiones para este plano.");
  carpetaDe(id);
  const modelo = vision ? (await modeloVision()).id : undefined;
  const estado: EstadoPropuesta = { status: "processing", vision, ...(modelo ? { modelo } : {}) };
  await escribirEstado(id, estado);
  encolar("regiones", clave(id), () => proponer(id, modelo));
  return estado;
}

/**
 * Propuesta vectorial (sin visión: no cuesta nada) al terminar de leer un plano que todavía no tiene `regiones.json`,
 * para que la persona encuentre los polígonos ya puestos en el asistente. Un archivo existente, aunque esté dañado, no
 * se toca: puede llevar trabajo de la persona. Nunca lanza: si no se puede proponer, el plano igual queda leído.
 */
export async function proponerRegionesSiFaltan(id: string): Promise<void> {
  try {
    if (proponiendo(id)) return;
    const existe = await access(/* turbopackIgnore: true */ archivo(id)).then(
      () => true,
      () => false,
    );
    if (existe) return;
    await proponerRegiones(id);
  } catch (e) {
    console.warn(`[regiones] ${id}: propuesta automática no lanzada: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`);
  }
}

/** Para pruebas: espera a que termine la cola de propuestas. */
export const esperarRegiones = () => esperar("regiones");
