import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buscarEjemplo } from "@/server/planos/ejemplos";
import { ID_PREFIJO, idDeProyecto, slugDeCarpeta, traducirExpediente, type ExpedienteTraducido } from "./traductor";

/**
 * Expedientes reales revisados por el agente revisor-planos: una carpeta por caso con resultado.json (y
 * hechos.json, lote.json, extraccion.json, informe.md, dictamen.json…). Se leen en tiempo de ejecución; su contenido tiene datos
 * personales y nunca se copia a archivos versionados.
 *
 * Carpeta: PRECHECK_EXPEDIENTES, o ../expedientes relativa al directorio de trabajo (web/).
 */
export const carpetaExpedientes = () =>
  resolve(/* turbopackIgnore: true */ process.env.PRECHECK_EXPEDIENTES ?? join(/* turbopackIgnore: true */ process.cwd(), "..", "expedientes"));

/** Tope de informe.md: un informe narrativo no necesita más; evita cargar archivos enormes por error. */
export const MAX_INFORME_BYTES = 512 * 1024;
const ID_VALIDO = /^exp-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface EntradaListado {
  id: string;
  carpeta: string;
  ruta: string;
}

/**
 * Carpetas con resultado.json, en orden alfabético. El id es el slug del nombre; si dos nombres dan el mismo
 * slug, el segundo lleva «-2», el tercero «-3»… (estable mientras no cambien las carpetas).
 */
export async function listarCarpetas(raiz = carpetaExpedientes()): Promise<EntradaListado[]> {
  const entradas = await readdir(/* turbopackIgnore: true */ raiz, { withFileTypes: true }).catch(() => []);
  const carpetas = entradas
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, "es"));
  const usados = new Set<string>();
  const lista: EntradaListado[] = [];
  for (const carpeta of carpetas) {
    const ruta = join(/* turbopackIgnore: true */ raiz, carpeta);
    if (!(await stat(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ ruta, "resultado.json")).then((s) => s.isFile(), () => false))) continue;
    const base = slugDeCarpeta(carpeta) || "expediente";
    let slug = base;
    for (let n = 2; usados.has(slug); n += 1) slug = `${base}-${n}`;
    usados.add(slug);
    lista.push({ id: idDeProyecto(slug), carpeta, ruta });
  }
  return lista;
}

const leerJson = async (ruta: string): Promise<unknown> => JSON.parse(await readFile(/* turbopackIgnore: true */ ruta, "utf8"));
const leerJsonOpcional = (ruta: string) => leerJson(ruta).catch(() => undefined);

async function leerInforme(ruta: string): Promise<string | null> {
  const info = await stat(/* turbopackIgnore: true */ ruta).catch(() => null);
  if (!info?.isFile()) return null;
  if (info.size > MAX_INFORME_BYTES) return `[El informe del revisor supera ${MAX_INFORME_BYTES / 1024} KB y no se muestra.]`;
  return readFile(/* turbopackIgnore: true */ ruta, "utf8");
}

/** Tope de dictamen.json: un dictamen razonable pesa pocos KB. */
export const MAX_DICTAMEN_BYTES = 2 * 1024 * 1024;

const avisar = (carpeta: string, texto: string) => console.warn(`[expedientes] ${carpeta}: ${texto.slice(0, 300)}`);

/**
 * dictamen.json sin validar (lo valida el traductor), o undefined si no existe. Si no se puede leer o no es JSON, se
 * registra un aviso y se sigue con el resultado del motor: un dictamen dañado nunca rompe el expediente.
 */
export async function leerDictamenCrudo(ruta: string, carpeta: string): Promise<unknown> {
  const info = await stat(/* turbopackIgnore: true */ ruta).catch(() => null);
  if (!info?.isFile()) return undefined;
  if (info.size > MAX_DICTAMEN_BYTES) {
    avisar(carpeta, `dictamen.json supera ${MAX_DICTAMEN_BYTES / 1024 / 1024} MB; se usa el resultado del motor`);
    return undefined;
  }
  try {
    return await leerJson(ruta);
  } catch (err) {
    avisar(carpeta, `dictamen.json no es JSON válido; se usa el resultado del motor (${err instanceof Error ? err.message : "error"})`);
    return undefined;
  }
}

/** Caché por carpeta: se vuelve a traducir solo si cambian resultado.json, informe.md o dictamen.json. */
const cache = new Map<string, { firma: string; datos: ExpedienteTraducido }>();

async function firmaDe(ruta: string): Promise<string> {
  const archivos = ["resultado.json", "hechos.json", "lote.json", "informe.md", "dictamen.json"];
  const tiempos = await Promise.all(archivos.map((a) => stat(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ ruta, a)).then((s) => `${s.mtimeMs}:${s.size}`, () => "-")));
  return tiempos.join(/* turbopackIgnore: true */ "|");
}

/** Miniatura de una página: solo «p<N>.png» con N entero de 1 a 999 (nunca otro nombre). */
export const NUMERO_PAGINA = /^[1-9]\d{0,2}$/;
const MINIATURA = /^p([1-9]\d{0,2})\.png$/;

/** Páginas con miniatura en la carpeta del expediente, en orden. */
async function miniaturasDe(ruta: string): Promise<number[]> {
  const entradas = await readdir(/* turbopackIgnore: true */ ruta, { withFileTypes: true }).catch(() => []);
  // Solo archivos regulares (un enlace simbólico no se sirve; ver leerMiniatura).
  return entradas
    .filter((d) => d.isFile())
    .map((d) => MINIATURA.exec(d.name)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * Lee y traduce un expediente, con lo que depende de la carpeta y no de resultado.json: las miniaturas de páginas y
 * si el PDF original está en la carpeta de anteproyectos.
 */
export async function leerExpediente(entrada: EntradaListado): Promise<ExpedienteTraducido> {
  const datos = await traducirCarpeta(entrada);
  const info = datos.project.expediente;
  if (!info) return datos;
  const [miniaturas, pdf] = await Promise.all([miniaturasDe(entrada.ruta), buscarEjemplo(info.documento)]);
  return { ...datos, project: { ...datos.project, expediente: { ...info, miniaturas, documentoDisponible: Boolean(pdf) } } };
}

/** Lee y traduce resultado.json (y hechos, extracción, informe). Lanza si resultado.json no tiene la forma esperada. */
async function traducirCarpeta(entrada: EntradaListado): Promise<ExpedienteTraducido> {
  const firma = await firmaDe(entrada.ruta);
  const enCache = cache.get(entrada.ruta);
  if (enCache && enCache.firma === firma) return enCache.datos;
  const ruta = (a: string) => join(/* turbopackIgnore: true */ entrada.ruta, a);
  const [resultado, hechos, lote, extraccion, informe, info, dictamen] = await Promise.all([
    leerJson(ruta("resultado.json")),
    leerJsonOpcional(ruta("hechos.json")),
    leerJsonOpcional(ruta("lote.json")),
    leerJsonOpcional(ruta("extraccion.json")),
    leerInforme(ruta("informe.md")),
    stat(/* turbopackIgnore: true */ ruta("resultado.json")),
    leerDictamenCrudo(ruta("dictamen.json"), entrada.carpeta),
  ]);
  const { avisos, ...datos } = traducirExpediente({
    slug: entrada.id.slice(ID_PREFIJO.length),
    carpeta: entrada.carpeta,
    resultado,
    hechos: hechos ?? lote,
    extraccion,
    informe,
    fecha: info.mtime.toISOString(),
    dictamen,
  });
  // Los avisos van al registro del servidor (una vez por cambio de archivos), no a la respuesta de la API.
  for (const aviso of avisos ?? []) avisar(entrada.carpeta, aviso);
  cache.set(entrada.ruta, { firma, datos });
  return datos;
}

/** Todos los expedientes legibles. Uno dañado se omite (y se anota en el registro del servidor), no rompe la lista. */
export async function listarExpedientes(raiz = carpetaExpedientes()): Promise<ExpedienteTraducido[]> {
  const lista = await listarCarpetas(raiz);
  const leidos = await Promise.all(
    lista.map((e) =>
      leerExpediente(e).catch((err: unknown) => {
        console.warn(`[expedientes] se omite ${e.id}: ${err instanceof Error ? err.message.slice(0, 200) : "error"}`);
        return null;
      }),
    ),
  );
  return leidos.filter((x): x is ExpedienteTraducido => x !== null);
}

/** Carpeta de un expediente por id. El id se valida por forma y contra el listado (nunca se usa como ruta). */
export async function buscarEntrada(id: string, raiz = carpetaExpedientes()): Promise<EntradaListado | null> {
  if (!ID_VALIDO.test(id) || id.length > 120) return null;
  return (await listarCarpetas(raiz)).find((e) => e.id === id) ?? null;
}

/** Un expediente por id (validado como en buscarEntrada). */
export async function buscarExpediente(id: string, raiz = carpetaExpedientes()): Promise<ExpedienteTraducido | null> {
  const entrada = await buscarEntrada(id, raiz);
  if (!entrada) return null;
  return leerExpediente(entrada).catch(() => null);
}

/** PNG de la página n de un expediente, o null (id fuera del listado, n no entero, archivo ausente o no regular). */
export async function leerMiniatura(id: string, n: string, raiz = carpetaExpedientes()): Promise<Buffer | null> {
  if (!NUMERO_PAGINA.test(n)) return null;
  const entrada = await buscarEntrada(id, raiz);
  if (!entrada) return null;
  const ruta = join(/* turbopackIgnore: true */ entrada.ruta, `p${n}.png`);
  // lstat: un enlace simbólico no se sigue (podría apuntar fuera de la carpeta del expediente).
  const info = await lstat(/* turbopackIgnore: true */ ruta).catch(() => null);
  if (!info?.isFile()) return null;
  return readFile(/* turbopackIgnore: true */ ruta).catch(() => null);
}
