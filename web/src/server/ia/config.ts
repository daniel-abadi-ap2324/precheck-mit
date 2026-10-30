import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { partirComando } from "@/server/planos/procesar";
import { leerGasto, MODELO_DEEPSEEK, TOPE_USD } from "./deepseek";

/**
 * Configuración de la revisión con IA (PreCheck IA), editable desde la web:
 * - «claude-code»: lanza el agente revisor-planos con Claude Code instalado en este equipo (desarrollo).
 * - «anthropic-api»: llama a la API de Anthropic con una llave.
 * - «deepseek-api»: llama a la API de DeepSeek (compatible con OpenAI) con la llave de DEEPSEEK_API_KEY o de
 *   ~/.config/precheck/deepseek.env; la IA trabaja con herramientas propias de la web (ver deepseek.ts).
 * - «ninguno»: la revisión con IA está apagada.
 *
 * La configuración va en .data/ia.json y la llave en .data/ia.secreto.json (fuera del repositorio). La llave nunca
 * sale del servidor: la web solo sabe si hay una configurada. ANTHROPIC_API_KEY del entorno sirve de respaldo.
 */
export const PROVEEDORES = ["ninguno", "claude-code", "anthropic-api", "deepseek-api"] as const;
export type Proveedor = (typeof PROVEEDORES)[number];
/** Proveedores que llaman a modelos Claude (Claude Code en el equipo o la API de Anthropic). */
const CLAUDE = ["claude-code", "anthropic-api"] as const;
export const MODELOS = [
  { id: "claude-haiku-5-5", nombre: "Claude Haiku 5.5 (el más barato; para pruebas)", proveedores: CLAUDE },
  { id: "claude-sonnet-5-5", nombre: "Claude Sonnet 5.5 (rápido y económico)", proveedores: CLAUDE },
  { id: "claude-opus-5-5", nombre: "Claude Opus 5.5 (más capaz)", proveedores: CLAUDE },
  { id: "claude-fable-5-1", nombre: "Claude Fable 5.1 (el más capaz; más lento y más caro)", proveedores: CLAUDE },
  { id: MODELO_DEEPSEEK, nombre: "DeepSeek Flash (muy barato; en prueba)", proveedores: ["deepseek-api"] },
] as const satisfies readonly { id: string; nombre: string; proveedores: readonly Proveedor[] }[];
export type Modelo = (typeof MODELOS)[number]["id"];

/** Modelo que se toma al pasar a cada proveedor: el económico de Claude, o el único de DeepSeek. */
const MODELO_POR_DEFECTO: Record<Exclude<Proveedor, "ninguno">, Modelo> = {
  "claude-code": "claude-sonnet-5-5",
  "anthropic-api": "claude-sonnet-5-5",
  "deepseek-api": MODELO_DEEPSEEK,
};

/**
 * Modelos que sirve cada proveedor. Antes la lista era una sola y se podía guardar DeepSeek con un modelo Claude (o al
 * revés): la revisión corría con otro modelo del que mostraba la web. Con la IA apagada el modelo no se usa, así que
 * valen todos y se conserva el que hubiera.
 */
export function modelosDe(proveedor: Proveedor): { id: Modelo; nombre: string }[] {
  return MODELOS.filter((m) => proveedor === "ninguno" || (m.proveedores as readonly Proveedor[]).includes(proveedor)).map(({ id, nombre }) => ({ id, nombre }));
}
export const modeloPorDefecto = (proveedor: Proveedor): Modelo => (proveedor === "ninguno" ? POR_DEFECTO_MODELO : MODELO_POR_DEFECTO[proveedor]);
export const esModeloDe = (proveedor: Proveedor, modelo: unknown): modelo is Modelo => modelosDe(proveedor).some((m) => m.id === modelo);
/**
 * Proveedor con el que corre un modelo pedido para una revisión concreta: el configurado si lo sirve; si no, el primero
 * que lo sirva (DeepSeek para deepseek-flash, Claude Code para los Claude). Así una prueba con DeepSeek y otra con
 * Claude pueden encolarse a la vez sin cambiar la configuración entre una y otra (antes: 400 «modelo ajeno»). Con la IA
 * apagada devuelve «ninguno»: encolar decide qué hacer.
 */
export function proveedorDelModelo(modelo: Modelo, configurado: Proveedor): Proveedor {
  if (configurado === "ninguno" || esModeloDe(configurado, modelo)) return configurado;
  return MODELOS.find((m) => m.id === modelo)?.proveedores[0] ?? configurado;
}
/** Nombre del proveedor para los mensajes de error. */
export const NOMBRE_PROVEEDOR: Record<Proveedor, string> = {
  ninguno: "la IA apagada",
  "claude-code": "Claude Code",
  "anthropic-api": "la API de Anthropic",
  "deepseek-api": "DeepSeek",
};
/** Mensaje claro para una pareja proveedor/modelo que no va junta. */
export const mensajeModeloAjeno = (proveedor: Proveedor, modelo: string) =>
  `El modelo ${modelo} no está disponible con ${NOMBRE_PROVEEDOR[proveedor]}. Modelos posibles: ${modelosDe(proveedor).map((m) => m.id).join(", ")}.`;

export interface ConfigIa {
  proveedor: Proveedor;
  modelo: Modelo;
  /**
   * Modelo para revisar planos escaneados (más de la mitad de las hojas sin capa de texto), o null para usar el mismo
   * de la revisión. Por defecto null: desde el 21-oct cada modelo revisa todo, también los escaneados (commit d67cb0d).
   * Va en ia.json y no en una variable de entorno, para que ninguna corrida dependa de con qué variables arrancó el
   * servidor.
   */
  modeloEscaneados: Modelo | null;
}

/** Estado de DeepSeek para la pantalla: si hay llave (nunca su valor) y cuánto se lleva gastado frente al tope. */
export interface EstadoDeepSeek {
  llave: boolean;
  gastoUsd: number;
  topeUsd: number;
  llamadas: number;
}

export interface EstadoConfigIa extends ConfigIa {
  /** Solo los modelos del proveedor elegido. */
  modelos: { id: string; nombre: string }[];
  /** Todos los modelos: el de los escaneados puede ser de otro proveedor (corre con el que lo sirva). */
  modelosEscaneados: { id: string; nombre: string }[];
  llaveConfigurada: boolean;
  /** De dónde sale la llave: el archivo que se guarda desde la web o la variable de entorno. */
  origenLlave: "web" | "entorno" | null;
  claudeCodeDisponible: boolean;
  deepseek: EstadoDeepSeek;
}

const POR_DEFECTO_MODELO: Modelo = "claude-sonnet-5-5";
const POR_DEFECTO: ConfigIa = { proveedor: "claude-code", modelo: POR_DEFECTO_MODELO, modeloEscaneados: null };
const LLAVE = /^sk-ant-[A-Za-z0-9_-]{20,300}$/;

/** Carpeta de datos de la IA (.data o IA_DIR): config, llave y gasto de DeepSeek. */
export const raiz = () => resolve(/* turbopackIgnore: true */ process.env.IA_DIR ?? join(/* turbopackIgnore: true */ process.cwd(), ".data"));
const archivoConfig = () => join(/* turbopackIgnore: true */ raiz(), "ia.json");
const archivoLlave = () => join(/* turbopackIgnore: true */ raiz(), "ia.secreto.json");

export const esProveedor = (v: unknown): v is Proveedor => typeof v === "string" && (PROVEEDORES as readonly string[]).includes(v);
export const esModelo = (v: unknown): v is Modelo => typeof v === "string" && MODELOS.some((m) => m.id === v);
export const esLlaveValida = (v: unknown): v is string => typeof v === "string" && LLAVE.test(v.trim());

export async function leerConfig(): Promise<ConfigIa> {
  try {
    const crudo = JSON.parse(await readFile(/* turbopackIgnore: true */ archivoConfig(), "utf8")) as Partial<ConfigIa>;
    const proveedor = esProveedor(crudo.proveedor) ? crudo.proveedor : POR_DEFECTO.proveedor;
    // Una pareja guardada antes de que se filtrara por proveedor (p. ej. DeepSeek con un modelo Claude) se corrige al leer.
    return {
      proveedor,
      modelo: esModeloDe(proveedor, crudo.modelo) ? crudo.modelo : modeloPorDefecto(proveedor),
      modeloEscaneados: esModelo(crudo.modeloEscaneados) ? crudo.modeloEscaneados : null,
    };
  } catch {
    return { ...POR_DEFECTO };
  }
}

export async function guardarConfig(cambios: Partial<ConfigIa>): Promise<ConfigIa> {
  const config = { ...(await leerConfig()), ...cambios };
  await mkdir(/* turbopackIgnore: true */ raiz(), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ archivoConfig(), JSON.stringify(config, null, 1));
  return config;
}

async function llaveDeArchivo(): Promise<string | null> {
  try {
    const { llave } = JSON.parse(await readFile(/* turbopackIgnore: true */ archivoLlave(), "utf8")) as { llave?: unknown };
    return esLlaveValida(llave) ? llave.trim() : null;
  } catch {
    return null;
  }
}

/** Solo para el servidor: la llave que se usa al llamar a la API (la de la web primero, luego la del entorno). */
export async function leerLlave(): Promise<string | null> {
  return (await llaveDeArchivo()) ?? (esLlaveValida(process.env.ANTHROPIC_API_KEY) ? process.env.ANTHROPIC_API_KEY.trim() : null);
}

/** Llave de DeepSeek: variable de entorno o ~/.config/precheck/deepseek.env (línea DEEPSEEK_API_KEY=…). Nunca se muestra. */
export async function leerLlaveDeepSeek(): Promise<string | null> {
  const env = process.env.DEEPSEEK_API_KEY?.trim();
  if (env) return env;
  try {
    const texto = await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ homedir(), ".config", "precheck", "deepseek.env"), "utf8");
    const linea = texto.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith("DEEPSEEK_API_KEY="));
    const v = linea?.slice("DEEPSEEK_API_KEY=".length).trim().replace(/^"|"$/g, "");
    return v && v.length >= 10 ? v : null;
  } catch {
    return null;
  }
}

/** Guarda la llave escrita en la web, o la borra con null. */
export async function guardarLlave(llave: string | null): Promise<void> {
  if (llave === null) {
    await rm(/* turbopackIgnore: true */ archivoLlave(), { force: true });
    return;
  }
  await mkdir(/* turbopackIgnore: true */ raiz(), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ archivoLlave(), JSON.stringify({ llave: llave.trim() }), { mode: 0o600 });
}

/**
 * Comando de Claude Code. En Windows `claude` es un .cmd que solo corre con shell; para no pasar por la shell se usa
 * el claude.exe que instala npm. PRECHECK_CLAUDE_BIN permite otro comando (pruebas), con comillas si lleva espacios.
 */
export function comandoClaude(): [string, string[]] {
  const propio = partirComando(process.env.PRECHECK_CLAUDE_BIN);
  if (propio?.length) return [propio[0], propio.slice(1)];
  if (process.platform === "win32" && process.env.APPDATA) {
    const exe = join(/* turbopackIgnore: true */ process.env.APPDATA, "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
    if (existsSync(/* turbopackIgnore: true */ exe)) return [exe, []];
  }
  return ["claude", []];
}

let disponible: { valor: boolean; hasta: number } | null = null;
/** Para pruebas: olvida la última comprobación. */
export const olvidarDisponibilidad = () => {
  disponible = null;
};

/** ¿Responde `claude --version`? Se recuerda un minuto. */
export function claudeCodeDisponible(): Promise<boolean> {
  if (disponible && disponible.hasta > Date.now()) return Promise.resolve(disponible.valor);
  return new Promise((fin) => {
    const [bin, prefijo] = comandoClaude();
    const p = spawn(/* turbopackIgnore: true */ bin, [...prefijo, "--version"], { stdio: "ignore" });
    const reloj = setTimeout(() => p.kill("SIGKILL"), 15_000);
    const listo = (valor: boolean) => {
      clearTimeout(reloj);
      disponible = { valor, hasta: Date.now() + 60_000 };
      fin(valor);
    };
    p.on("error", () => listo(false));
    p.on("close", (code) => listo(code === 0));
  });
}

export async function estadoConfig(): Promise<EstadoConfigIa> {
  const [config, archivo, cc, llaveDs, gasto] = await Promise.all([leerConfig(), llaveDeArchivo(), claudeCodeDisponible(), leerLlaveDeepSeek(), leerGasto(raiz())]);
  const entorno = esLlaveValida(process.env.ANTHROPIC_API_KEY);
  return {
    ...config,
    modelos: modelosDe(config.proveedor),
    modelosEscaneados: MODELOS.map(({ id, nombre }) => ({ id, nombre })),
    llaveConfigurada: Boolean(archivo) || entorno,
    origenLlave: archivo ? "web" : entorno ? "entorno" : null,
    claudeCodeDisponible: cc,
    // De la llave solo se dice si existe: su valor nunca sale de esta función.
    deepseek: { llave: Boolean(llaveDs), gastoUsd: Number(gasto.usd) || 0, topeUsd: TOPE_USD, llamadas: Number(gasto.llamadas) || 0 },
  };
}
