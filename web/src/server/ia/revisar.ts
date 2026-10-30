import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { leerDictamen } from "@/server/expedientes/traductor";
import { carpetaDe, esComplementario } from "@/server/planos/almacen";
import { textoDefinidas } from "./definidas-texto";
import { PYTHON, REPO } from "@/server/planos/procesar";
import { carpetaPreCheck, DICTAMEN_PARCIAL, escribirEstadoPreCheck, leerEstadoPreCheck, valoresDefinidos, type EstadoIaVigente, type EstadoPreCheck, type EstadoXtra } from "@/server/prechecks/almacen";
import { prepararEntradas, reevaluar } from "@/server/prechecks/motor";
import { cancelarEnEspera, enCurso, enEspera, encolarLimitado, esperarPrefijo, estadoLimite } from "@/server/trabajos";
import { RegistroIa, ultimaActividadRegistro } from "./registro";
import { enGrupos, instruccionesMaestro, prepararCarpetaEmpleado, type PedidoXtra } from "./xtra";
import { ARCHIVO_IA, leerFicha, leerLista, reglasSinDecision, resumenDelAlcance, textoFicha } from "./alcance";
import { contrato, conocimientoVigente, FORMA_ALCANCE_IA, type Verbos } from "./contrato";
import { comandoClaude, esModelo, esModeloDe, leerConfig, leerLlave, leerLlaveDeepSeek, mensajeModeloAjeno, proveedorDelModelo, raiz as raizIa, type Modelo, type Proveedor } from "./config";
import { clienteHttp, revisarConDeepSeek as bucleDeepSeek } from "./deepseek";
import { normalizarDecisiones, reglasDeDocumentoExterno, reglasSoloDelPlano, type Decision } from "./dictamen-normalizar";
import { type ContextoHerramientas, MEDIR_DIBUJO, prepararOcr, textoPagina } from "./herramientas-deepseek";
import { calcularPendientes, DATOS_AJENOS_AL_PLANO, mensajeDeSegundaPasada } from "./pendientes";

/**
 * Revisión con IA de un PreCheck ya evaluado por el motor: decide las reglas que quedaron en REQUIERE_REVISION y
 * escribe dictamen.json en la carpeta del PreCheck (la web lo superpone al resultado del motor). Dos proveedores:
 * - claude-code: el agente revisor-planos de este repositorio, con Claude Code instalado en el equipo;
 * - anthropic-api: una llamada a la API de Anthropic con el contexto del motor (sin imágenes de los planos).
 * Una revisión a la vez. El resultado sigue siendo preliminar y no oficial (CLAUDE.md, principio 3).
 */
const LIMITE_MS = 20 * 60_000;
/** Espera antes de reintentar tras una caída de red. */
const esperaReintentoMs = () => Number(process.env.PRECHECK_IA_ESPERA_REINTENTO_MS ?? 30_000);
/** El agente mide láminas y escribe informe: en un plano de 9 láminas tarda 20–30 minutos. */
const LIMITE_CLAUDE_CODE_MS = 45 * 60_000;
const MAX_REGLAS = 150;
const MAX_CITA = 1500;
const REVISOR = "PreCheck IA (agente revisor-planos)";


export class ErrorIa extends Error {
  /** Fallo de red o DNS hacia la API: vale la pena reintentar. */
  constructor(
    mensaje: string,
    readonly red = false,
  ) {
    super(mensaje);
  }
}
/** El modelo pedido no está en la lista de modelos permitidos, o no es del proveedor configurado. */
export class ErrorModeloIa extends ErrorIa {
  constructor(mensaje = "Modelo no válido.") {
    super(mensaje);
  }
}

const leerJson = async (ruta: string): Promise<unknown> => JSON.parse(await readFile(/* turbopackIgnore: true */ ruta, "utf8"));

/** Valida dictamen.json con el mismo esquema que usa la web; lanza con un mensaje legible si no sirve. */
async function comprobarDictamen(ruta: string): Promise<void> {
  const crudo = await leerJson(ruta).catch(() => undefined);
  if (crudo === undefined) throw new ErrorIa("La IA terminó sin escribir un dictamen válido.");
  const avisos: string[] = [];
  if (!leerDictamen(crudo, avisos)) throw new ErrorIa(`El dictamen de la IA no tiene la forma esperada: ${avisos[0] ?? ""}`.trim());
}

/**
 * Después de un dictamen válido: anota en el registro las decisiones que contradicen al motor (prevalece el motor; el
 * archivo no se toca para que la contradicción quede medible) y pasa a INFORMACION_REQUERIDA las reglas de documento
 * externo (ver dictamen-normalizar.ts). Nunca falla la revisión: si algo no se puede leer, se deja como está.
 */
async function normalizarDictamen(ruta: string, dir: string, registro: RegistroIa): Promise<void> {
  try {
    const dictamen = (await leerJson(ruta)) as { decisiones?: Decision[] };
    if (!Array.isArray(dictamen.decisiones)) return;
    const resultado = await leerResultado(dir);
    const motor = new Map((resultado.resultados ?? []).flatMap((r) => (typeof r.regla_id === "string" && typeof r.resultado === "string" ? [[r.regla_id, r.resultado] as const] : [])));
    const entradas = await entradasPorRegla(join(REPO, "reglas"), new Set(motor.keys())).catch(() => new Map<string, string[]>());
    const { decisiones, cambios } = normalizarDecisiones(dictamen.decisiones, motor, reglasDeDocumentoExterno(entradas), reglasSoloDelPlano(entradas));
    if (cambios.prevaleceMotor.length) registro.texto(`Jerarquía motor → IA: ${cambios.prevaleceMotor.length} decisión(es) sobre reglas que el motor ya decidió; prevalece el motor: ${cambios.prevaleceMotor.join("; ")}.`);
    if (cambios.informacionRequerida.length) registro.texto(`Documentos externos: ${cambios.informacionRequerida.length} regla(s) pasan a INFORMACION_REQUERIDA (falta un documento, no falla el plano): ${cambios.informacionRequerida.join(", ")}.`);
    if (cambios.sinInformacionRequerida.length) registro.texto(`Sin información requerida: ${cambios.sinInformacionRequerida.length} regla(s) cuyos datos salen del plano la traían; queda la decisión como observación: ${cambios.sinInformacionRequerida.join(", ")}.`);
    if (cambios.informacionRequerida.length || cambios.sinInformacionRequerida.length) {
      // Temporal + rename: un fallo a medias no deja un dictamen truncado (correr() lo borraría como inválido).
      const temporal = `${ruta}.tmp`;
      await writeFile(/* turbopackIgnore: true */ temporal, JSON.stringify({ ...dictamen, decisiones }, null, 1));
      await rename(/* turbopackIgnore: true */ temporal, ruta);
    }
  } catch (e) {
    registro.texto(`No se pudo comprobar el dictamen contra el motor (${e instanceof Error ? e.message.slice(0, 120) : "error"}); se deja como está.`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Proveedor A: Claude Code con el agente revisor-planos
// ---------------------------------------------------------------------------------------------------------------

/**
 * El archivo del agente trae rutas del servidor Linux (/home/app/…, ~/.venvs/…). Aquí se le dan las de este equipo
 * en el prompt, sin tocar el archivo del equipo. Se omite el registro del aprendizaje: una revisión lanzada desde la
 * web no modifica conocimiento/.
 */
export interface DatoPedido {
  clave: string;
  /** Cuántas reglas que aplican a este plano lo usan. */
  reglas: number;
  /** Qué hay que comprobar (solo para los datos documentales de scripts/hechos_documentales.json), con su tipo. */
  definicion?: string;
}

/** Un criterio que pide ejecutar una herramienta (`$PY scripts/x.py`) la recibe con el Python y la ruta reales. */
const conRutas = (criterio: string) => criterio.replaceAll("$PY scripts/", `${PYTHON} ${join(REPO, "scripts")}/`);

/**
 * Definiciones de los datos documentales de los Anexos III y IV (scripts/hechos_documentales.json); vacío si no se puede leer.
 * Si el dato tiene `criterio` (regla de decisión operativa: qué cuenta como sí, qué como no y cómo comprobarlo), va detrás de la
 * definición: sin él, cada modelo interpretaba a su manera la cita de la norma y las corridas discrepaban.
 */
async function definicionesDocumentales(archivo: string): Promise<Map<string, string>> {
  try {
    const { datos } = JSON.parse(await readFile(/* turbopackIgnore: true */ archivo, "utf8")) as { datos?: { clave?: string; tipo?: string; definicion?: string; criterio?: string; valores?: string[]; cerrada?: boolean }[] };
    return new Map(
      (datos ?? [])
        .filter((d) => d.clave && d.definicion)
        .map((d) => [d.clave as string, `${tipoLegible(d)}: ${d.definicion}${d.criterio ? ` CRITERIO: ${conRutas(d.criterio)}` : ""}`]),
    );
  } catch {
    return new Map();
  }
}

/**
 * Cómo se escribe el dato: número, sí/no o un texto. Con lista cerrada (ADR-0019), solo uno de sus valores; con lista
 * abierta, los valores son la escritura con que comparan las reglas (p. ej. profesional.disciplina = "arquitectura").
 */
export const tipoLegible = (d: { tipo?: string; valores?: string[]; cerrada?: boolean }): string => {
  if (d.tipo === "numero") return "número";
  if (d.tipo !== "texto") return "sí/no";
  const valores = d.valores?.map((v) => `"${v}"`).join(", ");
  if (!valores) return "texto, no sí/no";
  return d.cerrada ? `texto, solo uno de: ${valores} (esa palabra sola, sin otras)` : `texto, no sí/no (las reglas lo comparan escrito así: ${valores})`;
};

/** Tipo («bool», «numero» o «texto») de cada dato documental según el contrato; vacío si no se puede leer. */
export async function tiposDocumentales(archivo = join(REPO, "scripts", "hechos_documentales.json")): Promise<Map<string, string>> {
  try {
    const { datos } = JSON.parse(await readFile(/* turbopackIgnore: true */ archivo, "utf8")) as { datos?: { clave?: string; tipo?: string }[] };
    return new Map((datos ?? []).filter((d): d is { clave: string; tipo: string } => typeof d.clave === "string" && typeof d.tipo === "string").map((d) => [d.clave, d.tipo]));
  } catch {
    return new Map();
  }
}

/** Valores de cada dato de lista cerrada del contrato (p. ej. lote.orden_conservacion); vacío si no se puede leer. */
export async function listasCerradas(archivo = join(REPO, "scripts", "hechos_documentales.json")): Promise<Map<string, string[]>> {
  try {
    const { datos } = JSON.parse(await readFile(/* turbopackIgnore: true */ archivo, "utf8")) as { datos?: { clave?: string; cerrada?: boolean; valores?: string[] }[] };
    return new Map((datos ?? []).filter((d) => typeof d.clave === "string" && d.cerrada && d.valores?.length).map((d) => [d.clave as string, d.valores as string[]]));
  } catch {
    return new Map();
  }
}

/**
 * Los datos que piden las reglas que aplican a ESTE plano, sacados del propio motor, más la lista universal de todo anteproyecto: se toman las
 * reglas que evaluó (`resultado.json`), se busca cada una en los catálogos de `reglas/` y se juntan sus `entradas`. Así la
 * lista depende de la norma y la zona del plano, y funciona con cualquier plano que se suba. Se omiten los datos que no
 * salen del plano (norma, zona, trámite, registro público). Ordenados por cuántas reglas los usan.
 */
/**
 * Lista fija de datos que todo anteproyecto debe poder dar (scripts/datos_universales.json), con su criterio de medida si lo
 * tiene (p. ej. cuál es el lindero posterior); vacía si no se puede leer.
 */
async function datosUniversales(archivo: string): Promise<{ clave: string; criterio?: string }[]> {
  try {
    const { datos } = JSON.parse(await readFile(/* turbopackIgnore: true */ archivo, "utf8")) as { datos?: { clave?: string; criterio?: string }[] };
    return (datos ?? []).filter((d): d is { clave: string; criterio?: string } => typeof d.clave === "string");
  } catch {
    return [];
  }
}

/** Entradas de las reglas `ids` según los catálogos de reglas/ (con las opcionales: datos que la condición solo lee en una rama de un «or»). */
async function entradasPorRegla(carpetaReglas: string, ids: Set<string>): Promise<Map<string, string[]>> {
  const entradasDe = new Map<string, string[]>();
  for (const nombre of (await readdir(/* turbopackIgnore: true */ carpetaReglas)).filter((n) => n.endsWith(".json"))) {
    const catalogo = JSON.parse(await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ carpetaReglas, nombre), "utf8")) as { id?: string; entradas?: string[]; entradas_opcionales?: string[] }[];
    if (Array.isArray(catalogo))
      for (const r of catalogo) if (r.id && ids.has(r.id) && Array.isArray(r.entradas)) entradasDe.set(r.id, [...r.entradas, ...(r.entradas_opcionales ?? [])]);
  }
  return entradasDe;
}

/**
 * Datos de alcance (siempre, desde el 21-oct; antes con PRECHECK_DEEPSEEK_ALCANCE=1): las claves que aparecen en el `aplica_si` de cualquier regla del
 * catálogo (si hay rampa, si es obra nueva, si el lote está en el área del Metro…), sin los datos ajenos al plano. No
 * son pendientes del motor, pero deciden qué reglas aplican: Opus las escribe por su cuenta y DeepSeek no podía (en la
 * ronda 59, «rampa.sentidos no está entre los datos pedidos; no se escribe»).
 */
export async function datosDeAlcance(carpetaReglas = join(REPO, "reglas")): Promise<string[]> {
  const claves = new Set<string>();
  for (const nombre of (await readdir(/* turbopackIgnore: true */ carpetaReglas)).filter((n) => n.endsWith(".json"))) {
    const d = JSON.parse(await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ carpetaReglas, nombre), "utf8")) as unknown;
    const lista = Array.isArray(d) ? d : Array.isArray((d as { reglas?: unknown })?.reglas) ? (d as { reglas: unknown[] }).reglas : [];
    for (const r of lista as { aplica_si?: unknown }[])
      if (typeof r?.aplica_si === "string") for (const m of r.aplica_si.matchAll(/\b([a-z_]+\.[a-z_][a-z0-9_.]*)/g)) if (!DATOS_AJENOS_AL_PLANO.test(m[1])) claves.add(m[1]);
  }
  return [...claves].sort();
}

type ResultadoDeRegla = { regla_id?: string; resultado?: string; causa?: { en?: string; tipo?: string; campo?: string } };

/**
 * Reglas cuyas entradas se piden y datos que deciden si aplican las demás (como scripts/datos_pedidos.py). Una regla
 * NO_APLICA no pide sus entradas, ni una que quedó en revisión porque no se sabe si aplica: de esa se pide el dato que lo
 * decide, si falta. Así el dato sí/no de un requisito que no existe (la rampa de un proyecto sin rampas) deja de pedirse
 * y el modelo no tiene que elegir entre «sí» y «no» para decir «no aplica» (ADR-0018).
 */
export function reglasQuePiden(resultados: ResultadoDeRegla[]): { aplican: Set<string>; deAlcance: string[] } {
  const aplican = new Set<string>();
  const deAlcance: string[] = [];
  for (const r of resultados) {
    if (typeof r.regla_id !== "string" || r.resultado === "NO_APLICA") continue;
    if (r.causa?.en === "aplica_si") {
      if (r.causa.tipo === "faltante" && r.causa.campo) deAlcance.push(r.causa.campo);
      continue;
    }
    aplican.add(r.regla_id);
  }
  return { aplican, deAlcance };
}

export async function datosQuePidenLasReglas(
  dir: string,
  carpetaReglas = join(REPO, "reglas"),
  carpetaUniversales = join(REPO, "scripts", "datos_universales.json"),
  archivoDefiniciones = join(REPO, "scripts", "hechos_documentales.json"),
): Promise<DatoPedido[]> {
  const resultado = JSON.parse(await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, "resultado.json"), "utf8")) as { resultados?: ResultadoDeRegla[] };
  const { aplican, deAlcance } = reglasQuePiden(resultado.resultados ?? []);
  const entradasDe = await entradasPorRegla(carpetaReglas, aplican);
  const cuenta = new Map<string, number>();
  for (const entradas of entradasDe.values()) for (const e of new Set(entradas)) if (!DATOS_AJENOS_AL_PLANO.test(e)) cuenta.set(e, (cuenta.get(e) ?? 0) + 1);
  for (const campo of deAlcance) if (!DATOS_AJENOS_AL_PLANO.test(campo)) cuenta.set(campo, (cuenta.get(campo) ?? 0) + 1);
  // Datos universales de todo anteproyecto (Acuerdo 110, Anexos III y IV): se piden aunque ninguna regla aplicable los use.
  const universales = await datosUniversales(carpetaUniversales);
  for (const { clave } of universales) if (!cuenta.has(clave)) cuenta.set(clave, 0);
  const definiciones = await definicionesDocumentales(archivoDefiniciones);
  for (const { clave, criterio } of universales) if (criterio && !definiciones.has(clave)) definiciones.set(clave, `CRITERIO: ${conRutas(criterio)}`);
  return [...cuenta.entries()]
    .map(([clave, reglas]) => ({ clave, reglas, ...(definiciones.has(clave) ? { definicion: definiciones.get(clave) } : {}) }))
    .sort((a, b) => b.reglas - a.reglas || a.clave.localeCompare(b.clave));
}

/** Lo que se le dice a la IA de la zona: el código del usuario es un dato por verificar, no una verdad, y si el plano dice otra cosa se le avisa. */
export function textoDeZona(codigoUsuario: string | undefined, zona: ZonaLeida): string {
  const aviso = zona.avisos.find((a) => a.startsWith("ZONA_DISCREPANTE"));
  const plano = zona.codigoPlano ? ` El plano declara la zona «${zona.codigoPlano}» (leída por el extractor).` : "";
  if (aviso) return `Código de zona indicado por el usuario: ${codigoUsuario}.${plano} NO COINCIDEN: no des por cierto ninguno de los dos. Comprueba la zona del polígono del lote en el mapa regional (el lote achurado o rotulado «PROYECTO», no los lotes vecinos), con el cuadro de áreas, el membrete y la CEUS si hay, y deja los tres valores en supuestos.`;
  if (codigoUsuario) return `Código de zona indicado por el usuario: ${codigoUsuario} (compruébalo contra el plano y el mapa).${plano}`;
  return `El usuario no indicó el código de zona: determínalo tú con el mapa regional (el polígono del lote, no los vecinos), el cuadro de áreas y el membrete.${plano}`;
}

export interface ZonaLeida {
  /** Código de zona que el extractor leyó del plano (cuadro de áreas o membrete), si lo halló. */
  codigoPlano: string | null;
  /** Avisos del motor (resultado.json), entre ellos ZONA_DISCREPANTE. */
  avisos: string[];
}

/** Lo que el motor y el extractor ya saben de la zona: el código del plano y los avisos de resultado.json. Vacío si no se puede leer. */
export async function leerZonaDelPlano(dir: string): Promise<ZonaLeida> {
  const leer = async (nombre: string) => JSON.parse(await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, nombre), "utf8")) as Record<string, unknown>;
  const [extraccion, resultado] = await Promise.all([leer("extraccion.json").catch(() => ({})), leer("resultado.json").catch(() => ({}))]);
  const hechos = (extraccion as { hechos?: { hecho?: string; valor?: unknown; estado?: string }[] }).hechos ?? [];
  const zona = hechos.find((h) => h.hecho === "plano.zonificacion_declarada" && h.estado === "ok" && typeof h.valor === "string");
  const avisos = ((resultado as { avisos?: unknown[] }).avisos ?? []).filter((x): x is string => typeof x === "string");
  return { codigoPlano: zona ? (zona.valor as string) : null, avisos };
}

/**
 * Instrucciones del paso 3 sobre las regiones del plano (regiones.json en la carpeta): son hipótesis con confianza
 * < 0.85, evidencia que se contrasta con la lámina y con lo declarado, nunca prueba única de CUMPLE.
 */
export const INSTRUCCIONES_REGIONES = [
  "- REGIONES DEL PLANO: la carpeta trae regiones.json (polígonos por tipo: lote, huella, retiros, estacionamientos, acera, área verde, tinaquera, acceso vehicular, escalera o rampa…, en fracciones 0–1 de la página como las marcas, con origen vectorial, visión o humano y su confianza) y sus imágenes r<N>.png; si existe, regiones_resumen.json (lo escribe el motor) trae los conteos, las medidas en metros cuando la escala es conocida y las discrepancias entre lo declarado y lo dibujado.",
  "- Las regiones son HIPÓTESIS (confianza < 0.85 siempre, también las confirmadas por la persona): verifícalas contra la lámina igual que las marcas (dibuja el polígono con Pillow sobre p<N>.png o r<N>.png y míralo con Read). Nunca uses una región como única prueba de un CUMPLE: el CUMPLE necesita la lectura o la medición de la lámina.",
  "- Antes de decidir sobre la presencia o la cantidad de un elemento (estacionamientos, tinaquera, acceso vehicular, área verde…), contrasta con el conteo de regiones de regiones_resumen.json si existe: si hay regiones de ese tipo dibujadas (p. ej. 369 estacionamientos) y vas a decidir que falta o que hay muchos menos, amplía la lámina donde están esas regiones antes de decidir y explica la diferencia en la justificación. El conteo es contraste, no prueba: no basta ni para un CUMPLE ni para un NO_CUMPLE. Un número rotulado no es un conteo: la numeración de plazas puede tener huecos o saltos; si el último número no coincide con el conteo de regiones, busca los números que faltan en la lámina antes de atribuir la diferencia a las regiones.",
  "- Si una discrepancia de regiones_resumen.json (o una que veas entre las regiones y lo declarado) se confirma en la lámina, la decisión de la regla afectada es OBSERVACION, con una marca en la lámina sobre el elemento. Si no se confirma (la región está mal dibujada), sigue con la lámina y dilo en la justificación.",
  '- Anota en el dictamen `regiones_discrepantes`: [{"region_id": "r-3f2a1c" o "dato": "proyecto.estacionamientos", "detalle": "qué no coincide y qué confirmaste en la lámina"}], una entrada por discrepancia revisada (confirmada o descartada; dilo en detalle). Si no hubo ninguna, una lista vacía.',
];

/**
 * Retiro posterior medido en el servidor con scripts/medir_retiro.py sobre las regiones del PreCheck, como una línea para
 * el prompt. En la tanda 7 ningún modelo ejecutó la herramienta aunque el criterio lo pedía (Bella Vista: 2.50 de la torre
 * en vez de 0 del podio adosado), así que la medida se le da hecha. Null si no hay regiones o el script no mide.
 */
export async function retiroMedidoEnServidor(dir: string, pdf: string | null): Promise<string | null> {
  if (!(await tieneRegiones(dir))) return null;
  try {
    const { stdout } = await ejecutarPython([join(REPO, "scripts", "medir_retiro.py"), dir, ...(pdf ? ["--pdf", pdf] : [])]);
    const r = JSON.parse(stdout) as { retiro_posterior_m?: unknown; resultado?: unknown; metodo?: unknown };
    if (typeof r.retiro_posterior_m !== "number") return null;
    return `scripts/medir_retiro.py midió sobre las regiones proyecto.retiro_posterior_m = ${r.retiro_posterior_m} m (${typeof r.resultado === "string" ? r.resultado : "distancia mínima de la huella al lindero opuesto al frente"}). Es la distancia del lindero posterior al elemento construido más cercano en CUALQUIER nivel (un podio o muro adosado da 0 aunque la torre esté retirada): escríbela tal cual con método «medicion» y confianza 0.9, con el desglose por nivel en el detalle si la torre está más lejos. No la sustituyas por la cota rotulada «RETIRO» de un nivel superior ni por una terraza, losa a nivel de terreno, pérgola o alero (no cuentan: en Panamá Norte una corrida escribió 7.0 por una pérgola cuando el muro está a 9.27). Solo si la huella de regiones.json está claramente mal dibujada (lo compruebas sobre r<N>.png) mides tú, y lo dices en el detalle.`;
  } catch {
    return null;
  }
}

const ejecutarPython = (args: string[]) => promisify(execFile)(PYTHON, args, { cwd: REPO, timeout: 120_000, maxBuffer: 20 * 1024 * 1024, windowsHide: true });

/** El PreCheck tiene regiones del plano (las copia prepararEntradas desde la carpeta del plano). */
export const tieneRegiones = (dir: string) => access(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, "regiones.json")).then(
  () => true,
  () => false,
);

/**
 * Lecciones y criterios vigentes de conocimiento/ (`python -m precheck.aprendizaje contexto`), los mismos para los tres
 * proveedores. Antes solo los leía Claude, y solo si el agente se acordaba del paso 0. Vacío si no se pueden leer.
 */
export async function leerConocimiento(): Promise<string> {
  try {
    const { stdout } = await ejecutarPython(["-m", "precheck.aprendizaje", "contexto"]);
    return conocimientoVigente(stdout);
  } catch {
    return "";
  }
}

/** Cómo hace Claude Code, con Python y sus herramientas, lo que pide el contrato común (contrato.ts). */
export function verbosClaude(dir: string, pdf: string | null): Verbos {
  const plano = pdf ?? "<plano.pdf>";
  return {
    buscarTexto: "el texto de todas las láminas con pymupdf (page.get_text()) y grep",
    ampliar: `render del PDF a 150 ppp o más de esa zona, recortada, mirado con Read: ${PYTHON} -c "import pymupdf; d=pymupdf.open(r'${plano}'); p=d[<n>-1]; r=p.rect; p.get_pixmap(dpi=200, clip=pymupdf.Rect(r.x0, r.y0, r.x0+r.width/2, r.y0+r.height/2)).save(r'${join(dir, "tmp", "z<n>.png")}')"`,
    medir: `${PYTHON} ${join(REPO, "scripts", "medir_dibujo.py")} --pdf ${plano} --pagina N --zona x0,y0,x1,y1 [--de x,y --a x,y] --carpeta ${dir} (lee las líneas del PDF, compara la escala con las cotas impresas y dice si quedó «comprobada»), o la geometría de page.get_drawings() con la escala comprobada`,
    escribirDato: "en lote.json, con la forma de hechos del motor",
    reevaluar: `${PYTHON} -m precheck.planos.revisar --extraccion ${join(dir, "extraccion.json")} --lote ${join(dir, "lote.json")} --salida ${dir}`,
    fijarAlcance: [
      `Escríbelo en ${join(dir, "alcance_ia.json")} con esta forma y reevalúa:`,
      FORMA_ALCANCE_IA,
      "El motor comprueba cada cita contra el texto de esa página (capa de texto u OCR), aplica lo que se puede seguir y escribe reglas_a_evaluar.json, la lista cerrada de reglas vigentes que evalúas en el paso 2. Lo que no se puede seguir vuelve como aviso ALCANCE_IA en resultado.json: corrígelo y reevalúa. Los datos que define el arquitecto siguen mandando.",
    ].join("\n"),
    leerDocumento: "saca el texto con pymupdf y, en CADA página sin capa de texto (get_text() vacío o casi vacío), renderízala a 150 ppp y mírala con Read",
  };
}

export function promptClaudeCode(
  dir: string,
  pdf: string | null,
  estado: EstadoPreCheck,
  datosPedidos: DatoPedido[] = [],
  zona: ZonaLeida = { codigoPlano: null, avisos: [] },
  regiones = false,
  retiroMedido: string | null = null,
  documentos: { archivo: string; nombre: string }[] = [],
  conocimiento = "",
): string {
  const d = estado.datos;
  const definidas = textoDefinidas(valoresDefinidos(d));
  return [
    "Revisa este PreCheck lanzado desde la web local. Sigue tus instrucciones con estos ajustes para este equipo (Windows):",
    `- Python: usa \`${PYTHON}\` en lugar de ~/.venvs/precheck-dev/bin/python.`,
    `- Carpeta del caso: \`${dir}\` (en lugar de expedientes/<caso>). Ya tiene extraccion.json (con las correcciones del usuario: los hechos con fuente.metodo "humano" los escribió una persona y valen como dato del expediente), lote.json, hechos.json, resultado.json, resumen.md y las miniaturas p<N>.png.`,
    pdf ? `- PDF original: \`${pdf}\`. No vuelvas a extraerlo (el paso 2 ya está hecho); úsalo solo para leer o medir con más resolución.` : "- El PDF original no está disponible: trabaja con la extracción y las miniaturas.",
    `- Datos indicados por el usuario: trámite ${d.tramite}, fecha de presentación ${d.fechaPresentacion}, norma ${d.normaAplicable}. ${textoDeZona(d.codigoZona, zona)}`,
    "- Esta carpeta está en su estado inicial (la web reescribió extraccion.json y lote.json y evaluó el motor justo antes de empezar): nada de lo que ves viene de una revisión anterior.",
    "- Si corriges lote.json, vuelve a evaluar con precheck.planos.revisar sobre esa misma carpeta.",
    "- Requisitos documentales con regla en el catálogo (A110-AIII-*, A110-AIV-*): su dato es un hecho `plano.…` o `expediente.…` de la lista de datos de abajo. No los decidas en decisiones (salvo que el CRITERIO de su dato te pida decidir una regla, como las curvas de nivel sin topografía) ni abras un hallazgo tipificado para ellos: escribe el hecho en lote.json (true si el plano lo muestra; false solo si lo buscaste en todas las láminas, ampliaste la pertinente a 150 ppp o más y no está, con confianza >= 0.85; si no puedes comprobarlo, confianza <= 0.6 y el motivo) y el motor decide. Si el dato trae CRITERIO, aplícalo tal cual: ya resuelve la duda de interpretación. Con la zona ampliada y legible, escribe sí o no con confianza >= 0.85 aunque el resultado te parezca discutible; deja confianza baja solo si la zona es ilegible, y dilo en el detalle.",
    "- NO_CUMPLE POR AUSENCIA (\"no hay estacionamientos numerados\", \"no tiene tinaquera\", \"sin plazas accesibles\"…): la miniatura p<N>.png no basta para decir que algo falta (no se leen los números de las plazas, las cotas ni los símbolos pequeños; en Tocumen una revisión dio NO_CUMPLE \"estacionamientos sin numerar ni acotar\" y el plano los numera del 1 al 373). Solo decide NO_CUMPLE por ausencia si (a) ampliaste la lámina pertinente: render del PDF a 150 ppp o más de la zona donde debería estar el elemento, recortada con pymupdf (get_pixmap(dpi=200, clip=…)) y mirada con Read, y (b) tu confianza en que falta es >= 0.85. Di en la justificación qué lámina y qué zona ampliaste y a cuántos ppp. Si no, la decisión es OBSERVACION y el subsanar pide que se indique en el plano (p. ej. \"Indique en la planta de estacionamientos la numeración y las dimensiones de cada plaza\").",
    datosPedidos.length
      ? `- Datos que piden las reglas que aplican a ESTE plano (los sacó el motor de sus reglas, más los universales de todo anteproyecto del Acuerdo 110, Anexos III y IV; entre paréntesis, cuántas reglas del plano lo usan: 0 = dato universal que ninguna regla aplicable usa todavía): ${datosPedidos.map((d) => `${d.clave} (${d.reglas})`).join(", ")}. Escribe SIEMPRE cada uno en lote.json, con método, confianza y rango en detalle. Si un dato numérico no aplica a este plano (p. ej. no hay estacionamientos), escríbelo con valor 0 y di por qué. Un dato sí/no de un requisito que no existe en el proyecto (rampa, estacionamientos, otros anteproyectos en la finca, tinaquera) no se escribe: escribe el dato que decide si su regla aplica (rampa.ancho_m = 0, proyecto.estacionamientos = 0, lote.otros_anteproyectos_misma_finca = false, plano.tinaquera.presente = false) y la regla queda NO_APLICA. Si no se puede leer ni medir, escríbelo igual con confianza <= 0.6 y el motivo, sin dejarlo fuera. Después de CADA reevaluación del motor, ejecuta "${PYTHON} ${join(REPO, "scripts", "datos_pedidos.py")} ${dir}": lista los datos que piden las reglas que el motor evalúa AHORA y marca los que faltan (al escribir datos pueden volverse aplicables reglas nuevas que piden datos nuevos). Repite hasta que no falte ninguno.`
      : "- Datos obligatorios: escribe en lote.json cada dato que piden las reglas que aplican a este plano (mira las entradas de esas reglas con grep en reglas/), con método, confianza y rango en detalle; si no se puede leer ni medir, escríbelo con confianza <= 0.6 y el motivo, sin dejarlo fuera.",
    ...(datosPedidos.some((d) => d.definicion)
      ? [`- Qué comprobar en los datos documentales (requisitos de los Anexos III y IV; hecho sí/no salvo que diga número): ${datosPedidos.filter((d) => d.definicion).map((d) => `${d.clave} = ${d.definicion}`).join(" | ")}.`]
      : []),
    "- Escribe dictamen.json en la carpeta del caso. informe.md es opcional.",
    "- MARCAS (contrato, C-MARCAS): antes de dar por buena una marca, compruébala: dibuja el rectángulo con Pillow sobre p<N>.png (o sobre una imagen ampliada de esa página), guarda la imagen y míralo con Read. Si no cae sobre el elemento, corrígela. Cada NO_CUMPLE y OBSERVACION debe llevar al menos una marca. Si el hallazgo es algo que FALTA en el plano (curvas de nivel, cuadro de acabados, cortes, drenaje, norte…), marca la zona de la lámina donde debería estar o donde lo buscaste (la localización general, el cuadro de áreas, el pie de plano, la planta correspondiente) y empieza la etiqueta con «Falta:» (p. ej. «Falta: curvas de nivel en la localización general»). Solo omite la marca cuando de verdad no puedas ubicar ni el elemento ni la zona; nunca inventes una posición. Una evidencia puede llevar varias marcas.",
    ...(regiones ? INSTRUCCIONES_REGIONES : []),
    ...(retiroMedido ? [`- RETIRO POSTERIOR YA MEDIDO: ${retiroMedido}`] : []),
    ...(definidas ? [`- ${definidas}`] : []),
    ...(documentos.length
      ? [
          `- DOCUMENTOS COMPLEMENTARIOS que aportó el profesional con el plano: ${documentos.map((x) => `\`${join(dir, x.archivo)}\` («${x.nombre}»)`).join(", ")}. Léelos COMPLETOS, página por página: saca el texto con pymupdf y, en CADA página sin capa de texto (escaneo: get_text() vacío o casi vacío), renderízala a 150 ppp y mírala con Read. Un mismo PDF suele mezclar páginas con texto y escaneadas (p. ej. la consulta del arquitecto con texto y la respuesta firmada de la autoridad escaneada): nunca digas que un documento no contiene algo (una respuesta, una aprobación, una firma) sin haber mirado todas sus páginas, y di en el detalle qué páginas miraste. los arquitectos ponen ahí datos que el plano no trae (cuadro de áreas, personas, ocupación, profesional, descripción del trabajo). Un dato que tomes de ahí va en lote.json con fuente.documento = el nombre del documento y la página en el detalle. Si el documento y el plano dicen distinto, gana el plano y lo anotas en el detalle. Los hechos de extraccion.json con el campo «documento» ya vienen de estos documentos.`,
        ]
      : []),
    "- No ejecutes `precheck.aprendizaje registrar` ni modifiques conocimiento/, reglas/, normativa/ ni el código. Deja la sección `aprendizaje` vacía.",
    "- No muevas versiones a v<N>/: esta carpeta es una ejecución nueva.",
    "- Estás en una sesión desatendida y sin permisos para pedir aprobaciones: cada llamada a Bash debe ser UNA sola operación con la ruta absoluta del Python y rutas absolutas (sin `cd`, `;`, `&&`, `|`, `$VARIABLES` ni `mkdir` encadenados); si no, se rechaza. Para varios pasos, escribe un script .py en una carpeta temporal y ejecútalo.",
    "- Independencia: decide solo con este plano y los archivos de esta carpeta. NO leas dictámenes, resultados ni informes de otras revisiones del mismo plano (la carpeta expedientes/ ni otras carpetas de web/.data/prechecks/): así cada ejecución se puede comparar con las demás. Sí puedes leer conocimiento/ (lecciones y criterios generales), reglas/ y normativa/.",
    `- Archivos temporales (recortes, imágenes ampliadas, scripts): solo en ${dir}\tmp (créala si no existe). No uses otras carpetas: varias revisiones corren a la vez y no deben pisarse los archivos.`,
    "- Termina SIEMPRE habiendo escrito dictamen.json. Si una comprobación tuya falla, corrige o ignórala, pero escribe el dictamen: un dictamen con lo decidido vale más que ninguno.",
    `- Tienes ${LIMITE_CLAUDE_CODE_MS / 60_000} minutos como máximo. Escribe dictamen.json en cuanto tengas todas las decisiones (antes que informe.md) y borra la carpeta tmp al terminar.`,
    "- El conocimiento vigente (lecciones y criterios) ya viene al final de este mensaje: no hace falta que corras el paso 0.",
    "",
    "CONTRATO DE REVISIÓN (el mismo para todos los modelos; si algo de tus instrucciones choca con él, manda el contrato):",
    "",
    contrato(verbosClaude(dir, pdf), conocimiento),
  ].join("\n");
}

/**
 * Mensaje para el usuario según lo que Claude Code escribió al fallar. Antes todo error decía «revise la sesión»,
 * aunque la causa fuera otra (p. ej. el agente no se encontraba).
 */
export function explicarFalloClaude(stderr: string, agente = "revisor-planos"): string {
  // Colores ANSI de la terminal (ESC [ …m) fuera del mensaje.
  const t = stderr.replace(new RegExp(`${String.fromCharCode(27)}\[[0-9;]*m`, "g"), "").replace(/\s+/g, " ").trim();
  if (/--agent .* not found|agent .* not found/i.test(t)) {
    return `Claude Code no encontró el agente ${agente} (.claude/agents/${agente}.md en la raíz del proyecto). Compruebe que el archivo exista y que su primera línea sea «---» sin retorno de carro (saltos de línea LF).`;
  }
  if (/\/login|not logged in|invalid api key|authentication|unauthorized|credentials|401/i.test(t)) {
    return "Claude Code no tiene la sesión iniciada. Abra una terminal y ejecute «claude /login».";
  }
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|can'?t reach the api|check your internet|dns/i.test(t)) {
    return "Se perdió la conexión con la API de Anthropic (internet o DNS). Revise la red y vuelva a lanzar la revisión.";
  }
  if (/rate limit|overloaded|529|usage limit|quota/i.test(t)) return "Anthropic rechazó la solicitud por límite de uso o saturación. Inténtelo en unos minutos.";
  if (/model.*(not found|invalid|unavailable)|invalid model/i.test(t)) return "Claude Code no reconoce el modelo elegido. Elija otro en Configuración → Revisión con IA.";
  if (/ENOENT|not recognized|cannot find/i.test(t)) return "No se pudo ejecutar Claude Code (no se encontró el programa).";
  return t ? `Claude Code terminó con error: ${t.slice(0, 280)}${t.length > 280 ? "…" : ""} (el detalle está en el registro de la IA).` : "Claude Code terminó con error sin dar detalle (revise el registro de la IA).";
}

const esFalloDeRed = (t: string) => /ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|can'?t reach the api|check your internet/i.test(t);

interface OpcionesClaude {
  /** Id de la sesión (UUID). Sin él la sesión no se guarda y no se puede reanudar (como antes). */
  sesion?: string;
  /** Reanudar la sesión `sesion` con el mensaje dado en vez de empezar una nueva. */
  reanudar?: boolean;
  /** Tiempo máximo de este proceso; por defecto el de una revisión completa. */
  limiteMs?: number;
}

/**
 * Las rutas de Windows del texto, con «/». El agente las usa en Git Bash, que se come las «\» de un argumento sin
 * comillas: `--carpeta C:\Users\…\pck-…\tmp` creaba carpetas vacías «C:Usersusuario…tmp» en la raíz del proyecto.
 * Python y las herramientas de Claude Code aceptan «/» en Windows; en Linux no hay nada que cambiar.
 */
export function rutasConBarras(texto: string): string {
  return texto.replace(/[A-Za-z]:\\[^\s`'"«»()|,;]*/g, (ruta) => ruta.replaceAll("\\", "/"));
}

function revisarConClaudeCode(dir: string, prompt: string, modelo: Modelo, registro: RegistroIa, opciones: OpcionesClaude = {}): Promise<void> {
  const limiteMs = opciones.limiteMs ?? LIMITE_CLAUDE_CODE_MS;
  // Reanudable: la primera pasada fija el id con --session-id y la segunda usa --resume. Sin id, nada se guarda en disco.
  const sesion = opciones.sesion ? (opciones.reanudar ? ["--resume", opciones.sesion] : ["--session-id", opciones.sesion]) : ["--no-session-persistence"];
  const args = [
    "-p",
    ...(opciones.reanudar ? sesion : []),
    "--agent",
    "revisor-planos",
    "--model",
    modelo,
    "--permission-mode",
    "acceptEdits",
    "--allowedTools",
    "Read",
    "Write",
    "Edit",
    "Glob",
    "Grep",
    `Bash(${PYTHON}:*)`,
    `Bash(${rutasConBarras(PYTHON)}:*)`,
    "--add-dir",
    dir,
    ...(opciones.reanudar ? [] : sesion),
    // Cada mensaje y llamada a herramienta llega por stdout como una línea JSON: es el registro de la revisión.
    "--output-format",
    "stream-json",
    "--verbose",
    // Los hooks de los plugins del proyecto (appsec revisa con un modelo cada archivo que se escribe) no tienen sentido
    // en una revisión desatendida: una llamada fallida de un hook detuvo a la IA antes de escribir el dictamen.
    "--settings",
    JSON.stringify({ disableAllHooks: true }),
  ];
  return new Promise((ok, falla) => {
    const [bin, prefijo] = comandoClaude();
    const p = spawn(/* turbopackIgnore: true */ bin, [...prefijo, ...args], { cwd: REPO, stdio: ["pipe", "pipe", "pipe"] });
    registro.texto(`Claude Code (${modelo}) lanzado sobre ${dir}`);
    p.stdout.on("data", (c: Buffer) => registro.stdout(c.toString("utf8")));
    let stderr = "";
    p.stderr.on("data", (c: Buffer) => {
      stderr = (stderr + c.toString("utf8")).slice(-2000);
    });
    let vencido = false;
    const reloj = setTimeout(() => {
      vencido = true;
      p.kill("SIGKILL");
    }, limiteMs);
    p.on("error", () => {
      clearTimeout(reloj);
      falla(new ErrorIa("No se pudo lanzar Claude Code. Revise que esté instalado y con la sesión iniciada."));
    });
    p.on("close", (code) => {
      clearTimeout(reloj);
      registro.texto(`Proceso terminado (código ${code}${vencido ? ", tiempo agotado" : ""}).`);
      if (stderr.trim()) registro.texto(`Errores: ${stderr.slice(-500)}`);
      void registro.cerrar();
      if (code === 0) ok();
      else {
        console.warn(`[ia] claude-code salió con ${code}${vencido ? " (tiempo agotado)" : ""}: ${stderr.slice(-300)}`);
        falla(
          new ErrorIa(
            vencido
              ? `La IA superó el tiempo límite (${limiteMs / 60_000} minutos) sin terminar.`
              : explicarFalloClaude(stderr.trim() ? stderr : (registro.errorFinal ?? "")),
            esFalloDeRed(stderr.trim() ? stderr : (registro.errorFinal ?? "")),
          ),
        );
      }
    });
    p.stdin.end(rutasConBarras(prompt));
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Proveedor B: API de Anthropic
// ---------------------------------------------------------------------------------------------------------------

export const SISTEMA_API = `Eres PreCheck IA, revisor técnico y normativo de planos de construcción para la Dirección de Obras y Construcciones (DOYC) del Municipio de Panamá.

Recibes en JSON el resultado de un motor de reglas determinístico sobre un anteproyecto: los hechos leídos del plano (con su procedencia y confianza; los de fuente.metodo "humano" los corrigió una persona y valen como dato del expediente), los datos que confirmó el usuario y las reglas que el motor dejó en REQUIERE_REVISION, cada una con su cita textual de la norma.

Tu trabajo: decidir cada una de esas reglas. Estados posibles en "decision": CUMPLE, NO_CUMPLE, OBSERVACION o NO_APLICA. Cuando la decisión es imposible porque falta un dato externo indispensable que no está en el expediente (p. ej. la certificación de uso de suelo, CEUS, o el área del Registro Público), usa "decision": "OBSERVACION" con "estado": "INFORMACION_REQUERIDA" y di en "subsanar" qué documento y qué dato faltan.

Reglas de trabajo:
- Decide con los hechos y la cita que recibes. Nunca inventes datos, factores, límites ni normas. Si el límite no está en la cita, no lo supongas.
- Una confianza baja del lector no es por sí sola INFORMACION_REQUERIDA: si el valor está y es coherente, decide y explica la confianza; si no se puede leer, pide el dato del plano en "subsanar" como OBSERVACION.
- Decide solo las reglas de "reglas_a_decidir". Las de "decididas_por_el_motor" ya están resueltas con los datos del expediente y no se cambian: si crees que un dato está mal, dilo en "supuestos".
- Reglas cuyo dato es un documento del expediente que no es el plano (certificado del Registro Público, CEUS, memorial, resolución, paz y salvo, aprobación de otra entidad…): si el documento no consta, "decision": "OBSERVACION" con "estado": "INFORMACION_REQUERIDA" y en "subsanar" el documento exacto que debe aportarse. No es una falla del plano. Al revés también: lo que falta EN EL PLANO (un tendedero, una cota, las bicicletas, la vegetación) nunca es información requerida; es OBSERVACION o NO_CUMPLE con "estado": "".
- Las reglas de otras zonas ("grupo": "zona_por_confirmar") son NO_APLICA cuando la zona confirmada por el usuario es otra.
- Un requisito de presentación que el plano no trae (curvas de nivel, cortes, cuadro de áreas…) es NO_CUMPLE, con lo que hay que agregar.
- Cada decisión lleva una justificación con la operación (valor leído, límite, comparación) y "subsanar" accionable en NO_CUMPLE, OBSERVACION e INFORMACION_REQUERIDA.
- Usa "valor_leido" y "limite" como texto con unidades, o "" si no aplica. "evidencia" lista páginas del plano (0 si es un dato del usuario).
- Decide todas las reglas que recibes, una vez cada una, con su regla_id exacto.
- "conclusion": primera línea con el veredicto (CUMPLE LAS REGLAS EVALUADAS, CUMPLE CON OBSERVACIONES o NO CUMPLE) y 2 a 4 líneas sobre si el plano puede seguir o qué debe corregir.
- El resultado es preliminar: el visto bueno oficial es del Revisor DOYC (Acuerdo 110, Art. 3). Nunca copies nombres, cédulas ni datos personales.

Escribe en español.`;

/** Con la API no se ve el plano ni se escriben datos: el contrato se lo dice con estos verbos. */
export const VERBOS_API: Verbos = {
  buscarTexto: "no tienes el texto de las láminas: usa los hechos que recibes",
  ampliar: null,
  medir: null,
  escribirDato: null,
  reevaluar: null,
  fijarAlcance: "Regístralo en supuestos (hecho: lote.norma_aplicable, lote.codigo_zona, el dato de alcance o «permiso:PERM-1»), con el valor y en fundamento el documento, la página y la cita; decide con él las reglas que alcanza.",
  leerDocumento: "no recibes los documentos; usa los hechos que vienen de ellos (llevan el campo documento)",
};
/** Prompt de sistema de la vía API: su formato de entrada y salida y después el contrato común con el conocimiento vigente. */
export const sistemaApi = (conocimiento = ""): string =>
  `${SISTEMA_API}\n\nCONTRATO DE REVISIÓN (el mismo para todos los modelos; si algo de arriba choca con él, manda el contrato):\n\n${contrato(VERBOS_API, conocimiento)}`;

/** Esquema de salida estructurada (JSON) del dictamen: lo que la web sabe leer (dictamenSchema). */
export const ESQUEMA_DICTAMEN = {
  type: "object",
  additionalProperties: false,
  required: ["conclusion", "supuestos", "decisiones", "objeciones"],
  properties: {
    conclusion: { type: "string" },
    objeciones: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["regla_id", "motivo", "cita"],
        properties: { regla_id: { type: "string" }, motivo: { type: "string" }, cita: { type: "string" } },
      },
    },
    supuestos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hecho", "valor", "fundamento"],
        properties: { hecho: { type: "string" }, valor: { type: "string" }, fundamento: { type: "string" } },
      },
    },
    decisiones: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["regla_id", "decision", "estado", "valor_leido", "limite", "justificacion", "subsanar", "evidencia"],
        properties: {
          regla_id: { type: "string" },
          decision: { type: "string", enum: ["CUMPLE", "NO_CUMPLE", "OBSERVACION", "NO_APLICA"] },
          estado: { type: "string", enum: ["", "INFORMACION_REQUERIDA"] },
          valor_leido: { type: "string" },
          limite: { type: "string" },
          justificacion: { type: "string" },
          subsanar: { type: "string" },
          evidencia: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["pagina", "detalle"],
              properties: { pagina: { type: "integer" }, detalle: { type: "string" } },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * Evidencia de la salida de la API o de DeepSeek con la forma del dictamen: página 0 → null (dato del usuario) y las
 * marcas sobre la lámina tal cual (la web las valida en marcasDeEvidencia). Antes se descartaban.
 */
export function evidenciaDeSalida(evidencia: unknown): { pagina: number | null; detalle: string; marcas?: unknown[] }[] {
  if (!Array.isArray(evidencia)) return [];
  return (evidencia as { pagina?: number; detalle?: string; marcas?: unknown }[]).map((e) => ({
    pagina: e.pagina && e.pagina > 0 ? e.pagina : null,
    detalle: e.detalle ?? "",
    ...(Array.isArray(e.marcas) && e.marcas.length ? { marcas: e.marcas } : {}),
  }));
}

type ReglaMotor = {
  regla_id: string;
  resultado: string;
  titulo?: string;
  motivo?: string;
  grupo?: string;
  fuente_norma?: { norma?: string; articulo?: string; cita_textual?: string };
  valores_usados?: unknown;
};

/** Lo que se envía a la API: solo lo que necesita para decidir (sin el PDF ni datos personales del membrete). */
export async function contextoApi(dir: string, estado: EstadoPreCheck) {
  const resultado = (await leerJson(join(/* turbopackIgnore: true */ dir, "resultado.json"))) as {
    norma_aplicable?: string;
    codigo_zona?: string;
    avisos?: unknown[];
    resultados: ReglaMotor[];
  };
  const hechos = await leerJson(join(/* turbopackIgnore: true */ dir, "hechos.json")).catch(() => ({}));
  const pendientes = resultado.resultados.filter((r) => r.resultado === "REQUIERE_REVISION");
  const reglas = pendientes.slice(0, MAX_REGLAS).map((r) => ({
    regla_id: r.regla_id,
    titulo: r.titulo ?? null,
    motivo_motor: r.motivo ?? null,
    grupo: r.grupo ?? null,
    norma: r.fuente_norma?.norma ?? null,
    articulo: r.fuente_norma?.articulo ?? null,
    cita_textual: r.fuente_norma?.cita_textual?.slice(0, MAX_CITA) ?? null,
    valores_usados: r.valores_usados ?? null,
  }));
  return {
    datos_confirmados: estado.datos,
    norma_aplicable: resultado.norma_aplicable ?? null,
    codigo_zona: resultado.codigo_zona ?? null,
    avisos_motor: resultado.avisos ?? [],
    hechos,
    reglas_a_decidir: reglas,
    reglas_omitidas: Math.max(0, pendientes.length - reglas.length),
    decididas_por_el_motor: resultado.resultados.filter((r) => r.resultado !== "REQUIERE_REVISION").map((r) => ({ regla_id: r.regla_id, resultado: r.resultado })),
  };
}

async function revisarConApi(dir: string, estado: EstadoPreCheck, modelo: Modelo, registro: RegistroIa): Promise<object> {
  const apiKey = await leerLlave();
  if (!apiKey) throw new ErrorIa("No hay una llave de la API de Anthropic configurada (Configuración → Revisión con IA).");
  const contexto = await contextoApi(dir, estado);
  const conocimiento = await leerConocimiento();
  if (!contexto.reglas_a_decidir.length) {
    return { decisiones: [], supuestos: [], conclusion: "El motor decidió todas las reglas; no hay reglas en revisión para la IA." };
  }
  registro.texto(`Solicitud a la API de Anthropic: ${contexto.reglas_a_decidir.length} reglas en revisión (${contexto.reglas_omitidas} omitidas), esfuerzo high.`);
  registro.texto(`Reglas enviadas: ${contexto.reglas_a_decidir.map((r) => r.regla_id).join(", ")}`);
  const client = new Anthropic({ apiKey, timeout: LIMITE_MS, maxRetries: 2 });
  let mensaje;
  try {
    // Streaming: la respuesta puede ser larga. Con «fallbacks: default», si el modelo declina, la API reintenta con otro.
    mensaje = await client.beta.messages
      .stream({
        model: modelo,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: sistemaApi(conocimiento),
        output_config: { effort: "high", format: { type: "json_schema", schema: ESQUEMA_DICTAMEN } },
        messages: [{ role: "user", content: `Contexto del PreCheck (JSON):\n${JSON.stringify(contexto)}` }],
      })
      .finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ErrorIa("La API rechazó la llave. Revísela en Configuración.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new ErrorIa("La llave no tiene permiso para usar ese modelo.");
    if (e instanceof Anthropic.RateLimitError) throw new ErrorIa("La API está limitando las solicitudes. Inténtelo en unos minutos.");
    if (e instanceof Anthropic.APIConnectionError) throw new ErrorIa("No se pudo conectar con la API de Anthropic.");
    if (e instanceof Anthropic.APIError) throw new ErrorIa(`La API respondió con error ${e.status ?? ""}.`.trim());
    throw e;
  }
  if (mensaje.stop_reason === "refusal") throw new ErrorIa("El modelo declinó revisar este PreCheck.");
  if (mensaje.stop_reason === "max_tokens") throw new ErrorIa("La respuesta de la IA quedó incompleta (demasiadas reglas). Intente con menos reglas en revisión.");
  const texto = mensaje.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  registro.texto(`Respuesta de ${mensaje.model} (${mensaje.stop_reason}): ${texto}`);
  let salida: { conclusion: string; supuestos: unknown[]; decisiones: Record<string, unknown>[]; objeciones?: unknown[] };
  try {
    salida = JSON.parse(texto);
  } catch {
    throw new ErrorIa("La IA no devolvió un JSON válido.");
  }
  // Solo decisiones de reglas que se enviaron; «estado» vacío no se guarda.
  const enviadas = new Set(contexto.reglas_a_decidir.map((r) => r.regla_id));
  const decisiones = salida.decisiones
    .filter((d) => typeof d.regla_id === "string" && enviadas.has(d.regla_id) && typeof d.justificacion === "string" && d.justificacion.trim())
    .map(({ estado: est, evidencia, ...d }) => ({
      ...d,
      ...(est ? { estado: est } : {}),
      // Página 0 = dato del usuario, no una lámina.
      evidencia: evidenciaDeSalida(evidencia),
      nivel: 2,
      metodo: "análisis con la API de Anthropic",
    }));
  return { conclusion: salida.conclusion, supuestos: salida.supuestos, decisiones, ...(salida.objeciones?.length ? { objeciones: salida.objeciones } : {}), modelo: mensaje.model };
}

/**
 * Proveedor deepseek-api: arma el mismo contexto que el agente (datos pedidos con CRITERIO, zona, reglas en revisión,
 * regiones) y corre el bucle de herramientas de deepseek.ts. Escribe lote.json a través de las herramientas y deja el
 * motor reevaluado; devuelve la salida con la forma de las decisiones del dictamen.
 */
async function revisarConDeepSeek(id: string, dir: string, estado: EstadoPreCheck, registro: RegistroIa): Promise<object> {
  const apiKey = await leerLlaveDeepSeek();
  if (!apiKey) throw new ErrorIa("Falta la llave de DeepSeek (DEEPSEEK_API_KEY o ~/.config/precheck/deepseek.env).");
  const pdf = await pdfDelPlan(estado.planIds);
  // Sin la lista de datos pedidos el modelo no tiene nada que escribir: mejor fallar que abrirle todas las claves.
  const pedidos = await datosQuePidenLasReglas(dir).catch((e) => {
    throw new ErrorIa(`No se pudo leer qué datos piden las reglas (${e instanceof Error ? e.message.slice(0, 120) : "error"}).`);
  });
  const zona = await leerZonaDelPlano(dir);
  const contexto = await contextoApi(dir, estado);
  // Con la densidad pedida se permite también el número de personas: la densidad la calcula el sistema (sensatez.py).
  const definidas = valoresDefinidos(estado.datos);
  const claves = new Set(pedidos.map((d) => d.clave));
  if (claves.has("proyecto.densidad_pers_ha")) claves.add("proyecto.personas_total");
  // Lo que el arquitecto definió no se le pide ni se le deja escribir a la IA.
  for (const clave of Object.keys(definidas)) claves.delete(clave);
  const alcance = (await datosDeAlcance().catch(() => [])).filter((k) => !claves.has(k) && !(k in definidas));
  for (const k of alcance) claves.add(k);
  if (alcance.length) registro.texto(`Datos de alcance permitidos: ${alcance.length}.`);
  // Documentos complementarios copiados por el motor (documentos.json): DeepSeek los lee con el parámetro documento.
  const documentos = ((await leerJson(join(/* turbopackIgnore: true */ dir, "documentos.json")).catch(() => [])) as { archivo: string; nombre: string }[])
    .filter((d) => typeof d?.archivo === "string" && /^complementario-\d+\.pdf$/.test(d.archivo) && typeof d.nombre === "string");
  if (documentos.length) registro.texto(`Documentos complementarios para DeepSeek: ${documentos.map((d) => d.nombre).join(", ")}.`);
  // Tras cada reevaluación se agregan los datos de las reglas que se volvieron aplicables (antes la lista quedaba fija
  // y DeepSeek no podía escribir lo que pedían las reglas nuevas); lo definido por el arquitecto sigue fuera.
  const actualizarClaves = async () => {
    for (const d of await datosQuePidenLasReglas(dir).catch(() => [] as DatoPedido[])) if (!(d.clave in definidas)) claves.add(d.clave);
    if (claves.has("proyecto.densidad_pers_ha") && !("proyecto.personas_total" in definidas)) claves.add("proyecto.personas_total");
  };
  const ctx: ContextoHerramientas = { dir, pdf, clavesPermitidas: claves, reevaluar: async () => (await reevaluar(id)).ok, tipos: await tiposDocumentales(), listas: await listasCerradas(), documentos: documentos.map((d) => ({ ...d, ruta: join(/* turbopackIgnore: true */ dir, d.archivo) })), exigirAlcance: true, actualizarClaves };
  const extraccion = (await leerJson(join(/* turbopackIgnore: true */ dir, "extraccion.json")).catch(() => ({}))) as { paginas?: { numero?: number; tipo?: string }[] };
  // Láminas escaneadas: OCR con caché antes del bucle, para que buscar_texto y texto_pagina tengan texto y el tiempo no
  // cuente contra la revisión (Casco r39: sin texto, DeepSeek escribió 88 datos con confianza 0.6 y el motor no los usó).
  const escaneadas = (extraccion.paginas ?? []).filter((p) => p?.tipo === "escaneada" && typeof p.numero === "number").map((p) => p.numero as number);
  // Contrato C-AUSENCIA y C-MEDICION: escribir_hecho exige haber ampliado o medido antes de un «no» seguro o de una medida dudosa.
  ctx.controles = { ampliadas: new Set(), medidas: new Set(), medir: MEDIR_DIBUJO && Boolean(pdf), escaneadas: new Set(escaneadas), leidas: new Set() };
  if (escaneadas.length) {
    const ocr = await prepararOcr(ctx, escaneadas);
    registro.texto(ocr ? `OCR de ${escaneadas.length} lámina(s) escaneada(s) listo: ${JSON.stringify(ocr)}.` : "OCR de las láminas escaneadas no disponible; DeepSeek trabajará solo con recortes.");
  }
  const texto1 = pdf ? await textoPagina(ctx, 1).then((r) => r.texto, () => "") : "";
  registro.texto(`DeepSeek: ${pedidos.length} datos pedidos, ${contexto.reglas_a_decidir.length} reglas en revisión${await tieneRegiones(dir) ? ", con regiones" : ""}.`);
  const retiro = await retiroMedidoEnServidor(dir, pdf);
  const conocimiento = await leerConocimiento();
  registro.texto(conocimiento ? `Conocimiento vigente en el contrato: ${conocimiento.length} caracteres.` : "Aviso: no se pudo leer el conocimiento vigente (precheck.aprendizaje contexto).");
  const resumenRegiones = await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, "regiones_resumen.json"), "utf8").catch(() => undefined);
  const salida = await bucleDeepSeek(
    clienteHttp(apiKey),
    ctx,
    { estado, pedidos, textoZona: textoDeZona(estado.datos.codigoZona, zona), conRegiones: await tieneRegiones(dir), reglasEnRevision: contexto.reglas_a_decidir.map((r) => ({ regla_id: r.regla_id, titulo: r.titulo, motivo_motor: r.motivo_motor, grupo: r.grupo, norma: r.norma, articulo: r.articulo, cita_textual: r.cita_textual })), textoPagina1: texto1, numeroLaminas: Array.isArray(extraccion.paginas) ? extraccion.paginas.length : null, laminasEscaneadas: escaneadas, resumenRegiones: retiro ? `${resumenRegiones ?? ""}\nRETIRO POSTERIOR YA MEDIDO: ${retiro}` : resumenRegiones, definidas: textoDefinidas(definidas), alcance, documentos, conocimiento, fichaAlcance: await textoFicha(dir) },
    registro,
    // La misma carpeta que lee la pantalla de Configuración para mostrar el gasto acumulado.
    raizIa(),
  ).catch((e) => {
    throw new ErrorIa(`DeepSeek: ${e instanceof Error ? e.message.slice(0, 300) : "error"}`);
  });
  registro.texto(`DeepSeek terminó: ${salida.llamadas} llamadas, ${salida.usd.toFixed(3)} USD, herramientas ${JSON.stringify(salida.herramientas)}.`);
  // Una línea con el costo en ia.log.jsonl, con el mismo campo que deja Claude Code: así los scripts de análisis lo leen igual.
  registro.stdout(`${JSON.stringify({ type: "result_deepseek", total_cost_usd: Math.round(salida.usd * 1e5) / 1e5, llamadas: salida.llamadas, herramientas: salida.herramientas })}\n`);
  // Solo decisiones con regla_id y justificación; páginas 0 → null; nivel y método como en la vía API.
  const decisiones = (salida.dictamen.decisiones ?? [])
    .filter((d) => typeof d.regla_id === "string" && typeof d.justificacion === "string" && (d.justificacion as string).trim())
    .map(({ estado: est, evidencia, ...d }) => ({
      ...d,
      ...(est ? { estado: est } : {}),
      evidencia: evidenciaDeSalida(evidencia),
      nivel: 2,
      metodo: "análisis con la API de DeepSeek (herramientas de la web)",
    }));
  return { conclusion: salida.dictamen.conclusion ?? "", supuestos: salida.dictamen.supuestos ?? [], decisiones, regiones_discrepantes: salida.dictamen.regiones_discrepantes ?? [], ...(salida.dictamen.objeciones?.length ? { objeciones: salida.dictamen.objeciones } : {}), modelo: "deepseek-flash", costo_usd: salida.usd };
}

// ---------------------------------------------------------------------------------------------------------------
// Cola
// ---------------------------------------------------------------------------------------------------------------

async function pdfDelPlan(planIds: string[]): Promise<string | null> {
  for (const id of planIds) {
    if (await esComplementario(id)) continue;
    const ruta = join(/* turbopackIgnore: true */ carpetaDe(id), "original.pdf");
    if (await readFile(/* turbopackIgnore: true */ ruta).then(() => true, () => false)) return ruta;
  }
  return null;
}

/**
 * Una revisión con muy pocos hallazgos propios puede ser superficial: se avisa, no se rechaza. La duración sola no
 * cuenta (Sonnet termina en 2 a 4 min con 9 hallazgos); se menciona solo si además es corta.
 */
export const MINUTOS_CORTA = 4;
export const HALLAZGOS_MINIMOS = 3;
/** Con las reglas documentales en el catálogo, la IA ya no abre un hallazgo por cada requisito: escribe hechos `plano.…`. */
export const HECHOS_DOCUMENTALES_MINIMOS = 10;

/** Cuántos hechos `plano.…` escribió la revisión en lote.json (los que no son del usuario ni del extractor). */
export function contarHechosDocumentales(lote: unknown): number {
  const plano = (lote as { plano?: unknown } | null)?.plano;
  let n = 0;
  const recorrer = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    if ("valor" in o && "confianza" in o) {
      const metodo = (o.fuente as { metodo?: unknown } | undefined)?.metodo;
      if (metodo !== "declarado" && metodo !== "pdf_texto" && metodo !== "ocr") n += 1;
      return;
    }
    Object.values(o).forEach(recorrer);
  };
  recorrer(plano);
  return n;
}

export function avisoDeProfundidad(decisiones: { regla_id?: unknown }[], minutos: number, proveedor: string, hechosDocumentales = 0): string | undefined {
  const hallazgos = decisiones.filter((d) => typeof d.regla_id === "string" && d.regla_id.startsWith("HALLAZGO")).length;
  if (hallazgos >= HALLAZGOS_MINIMOS || hechosDocumentales >= HECHOS_DOCUMENTALES_MINIMOS) return undefined;
  const corta = proveedor === "claude-code" && minutos < MINUTOS_CORTA;
  const propios = `propuso ${hallazgos === 1 ? "1 hallazgo" : `${hallazgos} hallazgos`} fuera del catálogo`;
  return `Revisión posiblemente superficial: ${corta ? `terminó en ${Math.max(1, Math.round(minutos))} min y ` : ""}${propios}. Las revisiones completas de estos planos suelen proponer varios hallazgos; conviene volver a lanzarla o contrastarla con otra corrida.`;
}

/** Cuántas veces se reabre la sesión de la IA para pedirle solo lo pendiente (PRECHECK_IA_RETOMAS; por defecto 1; 0 la apaga). */
export function maxRetomas(): number {
  const n = Number.parseInt(process.env.PRECHECK_IA_RETOMAS ?? "", 10);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : 1;
}

/** Con menos datos pendientes que estos no vale la pena otra pasada (cada una gasta cuota). */
export const MIN_DATOS_SEGUNDA_PASADA = 3;
const LIMITE_SEGUNDA_PASADA_MS = 20 * 60_000;

async function leerResultado(dir: string) {
  return JSON.parse(await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, "resultado.json"), "utf8")) as { resultados?: { regla_id?: string; resultado?: string; motivo?: string; grupo?: string; motivo_tipo?: string }[] };
}

/**
 * Segunda pasada dirigida: el servidor vuelve a evaluar el motor con lo que dejó la IA y, si quedan datos que sí se pueden
 * escribir, reabre la misma sesión con un mensaje corto que pide solo eso. Si la retoma falla o se corta, se conserva el
 * dictamen de la primera pasada (la revisión no se marca como fallida).
 */
async function segundaPasada(id: string, dir: string, dictamen: string, modelo: Modelo, registro: RegistroIa, sesion: string) {
  const resumen = { retomas: 0, antes: undefined as number | undefined, despues: undefined as number | undefined };
  for (let n = 0; n < maxRetomas(); n++) {
    try {
      const ev = await reevaluar(id);
      if (!ev.ok) {
        registro.texto("Segunda pasada omitida: no se pudo volver a evaluar el motor.");
        break;
      }
      const pend = calcularPendientes(await leerResultado(dir));
      resumen.antes ??= pend.datos.length;
      resumen.despues = pend.datos.length;
      const no = pend.noEscribibles;
      registro.texto(`Pendientes tras la pasada ${n + 1}: ${pend.datos.length} datos que se pueden escribir; sin arreglo con datos: criterio ${no.criterio}, zona ${no.zona}, tolerancia ${no.tolerancia}, otros ${no.error + no.otro}.`);
      if (pend.datos.length < MIN_DATOS_SEGUNDA_PASADA) {
        registro.texto("No hace falta otra pasada.");
        break;
      }
      registro.texto(`Segunda pasada: se reabre la sesión de la IA para ${pend.datos.length} datos.`);
      const copia = await readFile(/* turbopackIgnore: true */ dictamen, "utf8");
      try {
        const criterios = new Map((await datosQuePidenLasReglas(dir).catch(() => [] as DatoPedido[])).filter((d) => d.definicion).map((d) => [d.clave, d.definicion as string]));
        await revisarConClaudeCode(dir, mensajeDeSegundaPasada(pend, 40, criterios), modelo, registro, { sesion, reanudar: true, limiteMs: LIMITE_SEGUNDA_PASADA_MS });
        await comprobarDictamen(dictamen);
        await normalizarDictamen(dictamen, dir, registro);
        resumen.retomas += 1;
      } catch (e) {
        // La retoma no es obligatoria: se vuelve al dictamen de la primera pasada.
        registro.texto(`La segunda pasada no terminó bien (${e instanceof Error ? e.message.slice(0, 160) : "error"}); se conserva el dictamen de la primera.`);
        await writeFile(/* turbopackIgnore: true */ dictamen, copia);
        break;
      }
      if ((await reevaluar(id)).ok) resumen.despues = calcularPendientes(await leerResultado(dir)).datos.length;
      registro.texto(`Pendientes tras la segunda pasada: ${resumen.despues} (antes ${resumen.antes}).`);
    } catch (e) {
      registro.texto(`Segunda pasada omitida: ${e instanceof Error ? e.message.slice(0, 160) : "error"}.`);
      break;
    }
  }
  return resumen;
}

const LIMITE_RETOMA_ALCANCE_MS = 15 * 60_000;

/**
 * Paso 1 de Claude Code: el motor ya comprobó alcance_ia.json al reevaluar. Si rechazó algo (cita que no está en la
 * página, norma no registrada…) o si la IA no lo escribió y el código de zona existe en varias normas, se reabre la sesión
 * una vez con lo que falta. DeepSeek recibe lo mismo en la respuesta de fijar_alcance. Si la retoma falla, queda el
 * dictamen anterior.
 */
async function retomaDeAlcance(id: string, dir: string, dictamen: string, modelo: Modelo, registro: RegistroIa, sesion: string): Promise<void> {
  try {
    const presente = await access(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, ARCHIVO_IA)).then(() => true, () => false);
    const candidatas = (await leerFicha(dir))?.normas_candidatas ?? [];
    if (!presente && candidatas.length < 2) return void registro.texto("La IA no escribió alcance_ia.json; con una sola norma candidata no hace falta retomar.");
    // Se reevalúa por si la IA escribió el alcance después de su última evaluación del motor.
    if (presente && !(await reevaluar(id)).ok) return;
    const { aceptado, errores } = await resumenDelAlcance(dir);
    if (presente && aceptado) return void registro.texto(`Alcance de la IA aceptado por el motor (${(await leerLista(dir))?.total ?? 0} reglas vigentes).`);
    const mensaje = presente
      ? `El motor no aceptó parte de ${ARCHIVO_IA}:\n${errores.map((e) => `- ${e}`).join("\n")}\nCorrígelo (la cita debe estar literal en esa página del documento; la norma, entre las registradas), reevalúa con el motor, revisa las decisiones que cambien con las reglas vigentes de reglas_a_evaluar.json y vuelve a escribir dictamen.json completo.`
      : `No escribiste ${ARCHIVO_IA} y el código de zona de este plano existe en varias normas (${candidatas.join(", ")}). Haz el paso 1 del contrato: decide la norma con evidencia citable, escribe ${join(dir, ARCHIVO_IA)} con su fuente, reevalúa con el motor, decide las reglas vigentes que queden en revisión (reglas_a_evaluar.json) y vuelve a escribir dictamen.json completo.`;
    registro.texto(`Retoma del paso 1: ${presente ? `${errores.length} error(es) del alcance` : "falta alcance_ia.json"}.`);
    const copia = await readFile(/* turbopackIgnore: true */ dictamen, "utf8");
    try {
      await revisarConClaudeCode(dir, mensaje, modelo, registro, { sesion, reanudar: true, limiteMs: LIMITE_RETOMA_ALCANCE_MS });
      await comprobarDictamen(dictamen);
      await normalizarDictamen(dictamen, dir, registro);
      const despues = await resumenDelAlcance(dir);
      registro.texto(despues.aceptado ? "Alcance aceptado tras la retoma." : `Tras la retoma siguen ${despues.errores.length} error(es) del alcance.`);
    } catch (e) {
      registro.texto(`La retoma del paso 1 no terminó bien (${e instanceof Error ? e.message.slice(0, 160) : "error"}); se conserva el dictamen anterior.`);
      await writeFile(/* turbopackIgnore: true */ dictamen, copia);
    }
  } catch (e) {
    registro.texto(`Retoma del paso 1 omitida: ${e instanceof Error ? e.message.slice(0, 160) : "error"}.`);
  }
}

/** Tope de la retoma que solo corrige la forma de dictamen.json: las decisiones ya están tomadas. */
const LIMITE_RETOMA_FORMA_MS = 10 * 60_000;

/**
 * Dictamen con forma inválida en Claude Code: se reabre la sesión una vez con el error de validación para que corrija
 * solo la forma, en lugar de perder la corrida entera (ronda 78: CASO-A con Opus, 17 minutos repetidos por un
 * dictamen.json mal formado). Devuelve true si después el dictamen es válido.
 */
async function retomaDeForma(dir: string, dictamen: string, error: string, modelo: Modelo, registro: RegistroIa, sesion: string): Promise<boolean> {
  registro.texto(`Retoma de forma del dictamen: ${error.slice(0, 200)}`);
  const mensaje = `${dictamen} no pasó la validación: ${error}\nCorrige solo la forma del archivo según el contrato (C-VEREDICTO). No cambies las decisiones ni vuelvas a revisar el plano. Si el archivo no existe o está incompleto, escríbelo completo con las decisiones que ya tomaste.`;
  try {
    await revisarConClaudeCode(dir, mensaje, modelo, registro, { sesion, reanudar: true, limiteMs: LIMITE_RETOMA_FORMA_MS });
    await comprobarDictamen(dictamen);
    registro.texto("Dictamen corregido en la retoma de forma.");
    return true;
  } catch (e) {
    registro.texto(`La retoma de forma no lo corrigió (${e instanceof Error ? e.message.slice(0, 160) : "error"}).`);
    return false;
  }
}

/**
 * Cobertura del paso 2 en Claude Code: si al final quedan reglas vigentes en REQUIERE_REVISION sin decisión en el
 * dictamen, se reabre la sesión una vez para que las decida. DeepSeek recibe la misma devolución en su bucle.
 */
async function retomaDeCobertura(id: string, dir: string, dictamen: string, modelo: Modelo, registro: RegistroIa, sesion: string): Promise<void> {
  try {
    const decididas = () => readFile(/* turbopackIgnore: true */ dictamen, "utf8").then((t) => ((JSON.parse(t) as { decisiones?: { regla_id?: unknown }[] }).decisiones ?? []).map((d) => d.regla_id));
    const faltan = await reglasSinDecision(dir, await decididas());
    if (!faltan.length) return;
    registro.texto(`Cobertura: ${faltan.length} regla(s) vigentes en revisión sin decisión; se reabre la sesión para decidirlas.`);
    const copia = await readFile(/* turbopackIgnore: true */ dictamen, "utf8");
    try {
      const mensaje = `Cobertura (contrato, C-COBERTURA): estas ${faltan.length} reglas vigentes siguen en REQUIERE_REVISION en resultado.json y tu dictamen no las decide: ${faltan.slice(0, 120).join(", ")}${faltan.length > 120 ? "…" : ""}. Decide cada una con la jerarquía del contrato (si un dato está mal, corrígelo y reevalúa) y agrega sus decisiones a dictamen.json sin quitar las que ya tiene.`;
      await revisarConClaudeCode(dir, mensaje, modelo, registro, { sesion, reanudar: true, limiteMs: LIMITE_RETOMA_ALCANCE_MS });
      await comprobarDictamen(dictamen);
      await normalizarDictamen(dictamen, dir, registro);
      await reevaluar(id);
      registro.texto(`Tras la retoma de cobertura quedan ${(await reglasSinDecision(dir, await decididas())).length} regla(s) sin decisión.`);
    } catch (e) {
      registro.texto(`La retoma de cobertura no terminó bien (${e instanceof Error ? e.message.slice(0, 160) : "error"}); se conserva el dictamen anterior.`);
      await writeFile(/* turbopackIgnore: true */ dictamen, copia);
    }
  } catch (e) {
    registro.texto(`Retoma de cobertura omitida: ${e instanceof Error ? e.message.slice(0, 160) : "error"}.`);
  }
}

/**
 * Fase de empleados de la revisión XTRA: cada empleado revisa el plano en su copia de la carpeta del caso, con su propio
 * registro, sin ver a los demás. Devuelve los números de los que dejaron un dictamen válido.
 */
async function revisarEmpleados(id: string, dir: string, prompt: (carpeta: string) => string, xtra: PedidoXtra, estadoXtra: EstadoXtra, registro: RegistroIa): Promise<number[]> {
  let guardando: Promise<unknown> = Promise.resolve();
  const progreso = () => {
    guardando = guardando.then(async () => {
      const ia = (await leerEstadoPreCheck(id)).ia;
      if (ia) await escribirEstadoPreCheck(id, { ia: { ...ia, xtra: { ...estadoXtra }, actualizadoEn: new Date().toISOString() } });
    });
    return guardando;
  };
  const tareas = Array.from({ length: xtra.empleados }, (_, i) => async () => {
    const n = i + 1;
    const carpeta = await prepararCarpetaEmpleado(dir, n);
    const dictamen = join(/* turbopackIgnore: true */ carpeta, "dictamen.json");
    registro.texto(`Empleado ${n} de ${xtra.empleados} (${xtra.modeloEmpleados}) empieza en ${carpeta}.`);
    try {
      await revisarConClaudeCode(carpeta, prompt(carpeta), xtra.modeloEmpleados as Modelo, new RegistroIa(id, carpeta)).catch(async (e: unknown) => {
        // Si se cortó pero dejó un dictamen válido, se aprovecha (como en la revisión normal).
        if (!(await comprobarDictamen(dictamen).then(() => true, () => false))) throw e;
      });
      await comprobarDictamen(dictamen);
      estadoXtra.terminados += 1;
      registro.texto(`Empleado ${n} terminó con dictamen.`);
      return n;
    } catch (e) {
      estadoXtra.fallidos += 1;
      registro.texto(`Empleado ${n} no terminó: ${e instanceof Error ? e.message.slice(0, 160) : "error"}.`);
      throw e;
    } finally {
      await progreso();
    }
  });
  const resultados = await enGrupos(tareas, maxParalelo());
  return resultados.flatMap((x) => (x.status === "fulfilled" ? [x.value] : []));
}

/** Marca de una revisión que corre con otro modelo del pedido (política de escaneados): va en cada estado que se escribe. */
type MarcaEnrutado = { enrutado: string; modeloPedido: Modelo };

async function correr(id: string, proveedor: Exclude<Proveedor, "ninguno">, modelo: Modelo, xtra?: PedidoXtra, marca?: MarcaEnrutado) {
  const dir = carpetaPreCheck(id);
  const dictamen = join(/* turbopackIgnore: true */ dir, "dictamen.json");
  const ahora = () => new Date().toISOString();
  const registro = new RegistroIa(id);
  const inicio = Date.now();
  const estadoXtra: EstadoXtra | undefined = xtra ? { empleados: xtra.empleados, modeloEmpleados: xtra.modeloEmpleados, fase: "empleados", terminados: 0, fallidos: 0 } : undefined;
  try {
    const estado = await leerEstadoPreCheck(id);
    await rm(/* turbopackIgnore: true */ dictamen, { force: true });
    await rm(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, DICTAMEN_PARCIAL), { force: true });
    await Promise.all(["ia.log.txt", "ia.log.jsonl"].map((n) => rm(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, n), { force: true })));
    await rm(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, "xtra"), { force: true, recursive: true });
    registro.texto(xtra ? `Revisión XTRA: maestro ${modelo} y ${xtra.empleados} empleados ${xtra.modeloEmpleados} (Claude Code).` : `Revisión con IA: proveedor ${proveedor}, modelo ${modelo}.`);
    if (marca) registro.texto(`Enrutamiento: ${marca.enrutado}.`);
    // Estado inicial limpio: la IA completa lote.json y reevalúa sobre esta misma carpeta, y una revisión anterior (o
    // interrumpida) dejaría sus datos. Se reescriben las entradas y se vuelve a correr el motor antes de empezar.
    await Promise.all(["informe.md", "tmp"].map((n) => rm(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, n), { force: true, recursive: true })));
    const inicial = await prepararEntradas(id);
    if (inicial === null) registro.texto("Aviso: el plano del proyecto ya no está disponible; se parte de los archivos que hay en la carpeta.");
    else if (!inicial.ok) throw new ErrorIa("No se pudo restablecer el estado inicial del PreCheck (el motor de reglas falló). Inténtelo de nuevo.");
    else registro.texto("Estado inicial restablecido: entradas reescritas y motor evaluado de nuevo.");
    // Id de la sesión de la primera pasada (nuevo en cada intento: un id usado no se puede repetir). Sin retomas no hay id.
    let sesionActual: string | undefined;
    if (proveedor === "claude-code") {
      // Revisión XTRA: primero los empleados, cada uno en su copia de la carpeta; después el maestro, aquí abajo.
      let maestro: string[] = [];
      if (xtra && estadoXtra) {
        const pedidos = await datosQuePidenLasReglas(dir).catch(() => []);
        const zona = await leerZonaDelPlano(dir);
        const conRegiones = await tieneRegiones(dir);
        const pdf = await pdfDelPlan(estado.planIds);
        const retiro = await retiroMedidoEnServidor(dir, pdf);
        const documentos = (await leerJson(join(/* turbopackIgnore: true */ dir, "documentos.json")).catch(() => [])) as { archivo: string; nombre: string }[];
        const conocimiento = await leerConocimiento();
        const listos = await revisarEmpleados(id, dir, (c) => promptClaudeCode(c, pdf, estado, pedidos, zona, conRegiones, retiro, documentos, conocimiento), xtra, estadoXtra, registro);
        if (!listos.length) throw new ErrorIa("Ningún empleado de la revisión XTRA terminó su revisión; el maestro no tiene qué revisar.");
        estadoXtra.fase = "maestro";
        await escribirEstadoPreCheck(id, { ia: { status: "running", proveedor, modelo, xtra: { ...estadoXtra }, actualizadoEn: ahora(), ...marca } });
        registro.texto(`Terminaron ${listos.length} de ${xtra.empleados} empleados. Empieza el maestro (${modelo}).`);
        maestro = instruccionesMaestro(dir, listos, xtra.empleados);
      }
      try {
        const lanzar = async () => {
          // Los datos que pide el motor para ESTE plano (según su norma y zona), no una lista fija.
          const pedidos = await datosQuePidenLasReglas(dir).catch(() => []);
          if (pedidos.length) registro.texto(`Datos que piden las reglas de este plano: ${pedidos.map((d) => d.clave).join(", ")}.`);
          const zona = await leerZonaDelPlano(dir);
          if (zona.avisos.some((x) => x.startsWith("ZONA_DISCREPANTE"))) registro.texto(`Aviso: la zona indicada por el usuario no coincide con la del plano (${zona.codigoPlano ?? "sin leer"}).`);
          sesionActual = maxRetomas() > 0 ? randomUUID() : undefined;
          const conRegiones = await tieneRegiones(dir);
          if (conRegiones) registro.texto("El plano tiene regiones (regiones.json): la IA las usa como evidencia por verificar.");
          const pdf = await pdfDelPlan(estado.planIds);
          const retiro = await retiroMedidoEnServidor(dir, pdf);
          if (retiro) registro.texto(`Retiro posterior medido en el servidor: ${retiro.slice(0, 160)}…`);
          const documentos = (await leerJson(join(/* turbopackIgnore: true */ dir, "documentos.json")).catch(() => [])) as { archivo: string; nombre: string }[];
          if (documentos.length) registro.texto(`Documentos complementarios para la IA: ${documentos.map((x) => x.nombre).join(", ")}.`);
          const conocimiento = await leerConocimiento();
          if (!conocimiento) registro.texto("Aviso: no se pudo leer el conocimiento vigente (precheck.aprendizaje contexto).");
          const prompt = [promptClaudeCode(dir, pdf, estado, pedidos, zona, conRegiones, retiro, documentos, conocimiento), ...maestro].join("\n");
          registro.texto(`Prompt de la revisión: ${prompt.length} caracteres (contrato común y conocimiento vigente incluidos).`);
          return revisarConClaudeCode(dir, prompt, modelo, registro, { sesion: sesionActual });
        };
        try {
          await lanzar();
        } catch (e) {
          // Una caída de internet o de DNS no es culpa de la revisión: se reintenta una vez (el agente reutiliza lo que ya dejó en la carpeta).
          if (!(e instanceof ErrorIa && e.red)) throw e;
          registro.texto("Se perdió la conexión con la API. Reintentando en 30 segundos…");
          await new Promise((fin) => setTimeout(fin, esperaReintentoMs()));
          await lanzar();
        }
      } catch (e) {
        // Si el agente ya escribió un dictamen válido antes de cortarse (tiempo, cierre), se aprovecha.
        if (!(await comprobarDictamen(dictamen).then(() => true, () => false))) throw e;
        console.warn(`[ia] ${id}: el agente se cortó pero dejó un dictamen válido; se usa`);
      }
    } else if (proveedor === "deepseek-api") {
      const salida = await revisarConDeepSeek(id, dir, estado, registro);
      const completo = { version: 1, fecha: ahora().slice(0, 10), revisor: `${REVISOR} vía DeepSeek`, tramite: estado.datos.tramite, fecha_presentacion: estado.datos.fechaPresentacion, ...salida };
      await writeFile(/* turbopackIgnore: true */ dictamen, JSON.stringify(completo, null, 1));
    } else {
      const salida = await revisarConApi(dir, estado, modelo, registro);
      const completo = { version: 1, fecha: ahora().slice(0, 10), revisor: `${REVISOR} vía API`, tramite: estado.datos.tramite, fecha_presentacion: estado.datos.fechaPresentacion, ...salida };
      await writeFile(/* turbopackIgnore: true */ dictamen, JSON.stringify(completo, null, 1));
    }
    try {
      await comprobarDictamen(dictamen);
    } catch (e) {
      // Claude Code: antes de perder la corrida se le pide una vez que corrija solo la forma del dictamen.
      const terminal = registro.terminal;
      const corregido = proveedor === "claude-code" && sesionActual
        ? await retomaDeForma(dir, dictamen, e instanceof Error ? e.message : "forma inesperada", modelo, registro, sesionActual)
        : false;
      if (!corregido) {
        // Si Claude Code explicó por qué se detuvo, se le dice al usuario en lugar del mensaje genérico.
        if (proveedor === "claude-code" && terminal && terminal !== "completed") {
          throw new ErrorIa(`La IA se detuvo antes de escribir el dictamen (motivo de Claude Code: ${terminal}${terminal === "hook_stopped" ? ": un hook lo detuvo" : ""}). Vuelva a lanzar la revisión; el detalle está en el registro de la IA.`);
        }
        throw e;
      }
    }
    registro.texto("Dictamen válido guardado.");
    await normalizarDictamen(dictamen, dir, registro);
    if (proveedor === "claude-code" && sesionActual) await retomaDeAlcance(id, dir, dictamen, modelo, registro, sesionActual);
    const retoma = proveedor === "claude-code" && sesionActual ? await segundaPasada(id, dir, dictamen, modelo, registro, sesionActual) : null;
    if (proveedor === "claude-code" && sesionActual) await retomaDeCobertura(id, dir, dictamen, modelo, registro, sesionActual);
    const decisiones = ((JSON.parse(await readFile(/* turbopackIgnore: true */ dictamen, "utf8")) as { decisiones?: { regla_id?: unknown }[] }).decisiones ?? []);
    const lote = await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, "lote.json"), "utf8").then((x) => JSON.parse(x) as unknown, () => null);
    const aviso = avisoDeProfundidad(decisiones, (Date.now() - inicio) / 60_000, proveedor, contarHechosDocumentales(lote));
    if (aviso) registro.texto(`Aviso: ${aviso}`);
    await escribirEstadoPreCheck(id, { ia: { status: "done", proveedor, modelo, actualizadoEn: ahora(), ...(retoma ? { retomas: retoma.retomas, pendientesAntes: retoma.antes, pendientesDespues: retoma.despues } : {}), ...(aviso ? { aviso } : {}), ...(estadoXtra ? { xtra: estadoXtra } : {}), ...marca } });
  } catch (e) {
    const mensaje = e instanceof ErrorIa ? e.message : "La revisión con IA falló.";
    registro.texto(`Error: ${mensaje}`);
    if (!(e instanceof ErrorIa)) console.warn(`[ia] ${id}: ${e instanceof Error ? e.message.slice(0, 300) : "error"}`);
    // Un dictamen a medias no pasa por dictamen.json: queda como dictamen.parcial.json y el informe se arma con él (si es
    // válido) y con la decisión de respaldo del motor, con un aviso visible de que la IA no terminó (ADR-0016).
    await rename(/* turbopackIgnore: true */ dictamen, join(/* turbopackIgnore: true */ dir, DICTAMEN_PARCIAL)).catch(() => undefined);
    await rm(/* turbopackIgnore: true */ dictamen, { force: true }).catch(() => undefined);
    await escribirEstadoPreCheck(id, { ia: { status: "failed", proveedor, modelo, error: mensaje, actualizadoEn: ahora(), ...(estadoXtra ? { xtra: estadoXtra } : {}), ...marca } });
  }
}

/** Cancela una revisión que espera turno; null si no estaba en espera (ya corre o no existe). Deja el estado en «failed: cancelada». */
export async function cancelarRevisionIa(id: string): Promise<EstadoPreCheck | null> {
  if (!cancelarEnEspera(`ia:${id}`)) return null;
  const estado = await leerEstadoPreCheck(id);
  return escribirEstadoPreCheck(id, { ia: { ...(estado.ia ?? { proveedor: "claude-code", modelo: "" }), status: "failed", error: "Cancelada antes de empezar.", actualizadoEn: new Date().toISOString() } });
}

/** ¿Más de la mitad de las hojas del plano sin capa de texto? Lo dice extraccion.json de la carpeta del PreCheck. */
async function esEscaneado(dir: string): Promise<boolean> {
  const extraccion = (await leerJson(join(/* turbopackIgnore: true */ dir, "extraccion.json")).catch(() => ({}))) as { paginas?: { tipo?: unknown }[] };
  const paginas = Array.isArray(extraccion.paginas) ? extraccion.paginas : [];
  return paginas.filter((p) => p?.tipo === "escaneada").length * 2 > paginas.length;
}

/** Encola la revisión con el proveedor configurado. Lanza ErrorIa si no se puede empezar. */
export async function encolarRevisionIa(id: string, modeloElegido?: string, xtra?: PedidoXtra): Promise<EstadoPreCheck> {
  if (modeloElegido !== undefined && !esModelo(modeloElegido)) throw new ErrorModeloIa();
  const estado = await leerEstadoPreCheck(id);
  if (estado.status !== "done") throw new ErrorIa("El motor todavía no termina de evaluar este PreCheck.");
  // Se mira la cola, no el disco: tras cancelar una revisión en espera el disco dice «failed» pero la tarea sigue encolada
  // hasta que le toque, y un segundo POST encolaría otra con la misma clave.
  if (enCurso(`ia:${id}`)) throw new ErrorIa("La revisión con IA ya está en curso o en cola.");
  const config = await leerConfig();
  // El modelo elegido para esta revisión manda; si no se elige, el de Configuración.
  const pedido = modeloElegido && esModelo(modeloElegido) ? modeloElegido : config.modelo;
  // Política de escaneados (ia.json, modeloEscaneados): un plano con más de la mitad de las hojas sin capa de texto se
  // revisa con ese modelo, y el estado y el registro guardan cuál se pidió y cuál corrió. Por defecto no hay política:
  // cada modelo revisa todo, también los escaneados (21-oct, d67cb0d). La XTRA no se desvía (es solo de Claude Code).
  const escaneados = !xtra && config.modeloEscaneados && config.modeloEscaneados !== pedido && (await esEscaneado(carpetaPreCheck(id))) ? config.modeloEscaneados : null;
  const modelo = escaneados ?? pedido;
  const marca: MarcaEnrutado | undefined = escaneados ? { enrutado: `plano escaneado; se pidió ${pedido} y revisa ${escaneados} (modelo para escaneados de Configuración)`, modeloPedido: pedido } : undefined;
  // El proveedor sale del modelo: con DeepSeek configurado, un Claude pedido corre con Claude Code (y al revés). Antes
  // se rechazaba («modelo ajeno») y los lotes con dos proveedores tenían que cambiar la configuración entre encolados.
  const proveedor = proveedorDelModelo(modelo, config.proveedor);
  if (!esModeloDe(proveedor, modelo)) throw new ErrorModeloIa(mensajeModeloAjeno(proveedor, modelo));
  if (proveedor === "ninguno") throw new ErrorIa("La revisión con IA está apagada (Configuración → Revisión con IA).");
  if (proveedor === "anthropic-api" && !(await leerLlave())) throw new ErrorIa("Falta la llave de la API de Anthropic (Configuración → Revisión con IA).");
  if (proveedor === "deepseek-api" && !(await leerLlaveDeepSeek())) throw new ErrorIa("Falta la llave de DeepSeek (DEEPSEEK_API_KEY o ~/.config/precheck/deepseek.env).");
  if (xtra && proveedor !== "claude-code") throw new ErrorIa("La revisión XTRA solo funciona con Claude Code en este equipo.");
  if (xtra && !esModeloDe("claude-code", xtra.modeloEmpleados)) throw new ErrorModeloIa("El modelo de los empleados no es un modelo de Claude.");
  const estadoXtra: EstadoXtra | undefined = xtra ? { empleados: xtra.empleados, modeloEmpleados: xtra.modeloEmpleados, fase: "empleados", terminados: 0, fallidos: 0 } : undefined;
  const nuevo = await escribirEstadoPreCheck(id, { ia: { status: "running", proveedor, modelo, actualizadoEn: new Date().toISOString(), ...(estadoXtra ? { xtra: estadoXtra } : {}), ...marca } });
  // Una cola por revisión: las pruebas con modelos distintos corren a la vez, no una tras otra.
  encolarLimitado(`ia:${id}`, `ia:${id}`, "ia", maxParalelo(), () => correr(id, proveedor, modelo, xtra, marca));
  return nuevo;
}

/** Cuántas revisiones con IA corren a la vez como máximo (PRECHECK_IA_MAX_PARALELO; por defecto 3). */
export function maxParalelo(): number {
  const n = Number.parseInt(process.env.PRECHECK_IA_MAX_PARALELO ?? "", 10);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : 3;
}

/** Para pruebas. */
export const esperarIa = () => esperarPrefijo("ia:");

/** Una revisión «en curso» sin trabajo en este proceso (el servidor se reinició) queda como interrumpida. */
export async function estadoIaVigente(id: string): Promise<EstadoIaVigente | null> {
  const estado = await leerEstadoPreCheck(id);
  if (estado.ia?.status === "running" && !enCurso(`ia:${id}`)) {
    const error = "La revisión se interrumpió (se reinició el servidor). Vuelva a pedirla.";
    return (await escribirEstadoPreCheck(id, { ia: { ...estado.ia, status: "failed", error, actualizadoEn: new Date().toISOString() } })).ia ?? null;
  }
  if (estado.ia?.status !== "running") return estado.ia ?? null;
  // En curso: ¿espera turno o trabaja? Y cuándo fue la última actividad (el registro lo escribe la IA al avanzar).
  const espera = enEspera(`ia:${id}`);
  const lim = estadoLimite("ia");
  const ultima = espera ? null : await ultimaActividadRegistro(id);
  return { ...estado.ia, ...(espera ? { enEspera: true } : { ultimaActividad: ultima, segundosSinActividad: ultima ? Math.max(0, Math.round((Date.now() - Date.parse(ultima)) / 1000)) : null }), revisionesCorriendo: lim.corriendo, revisionesEsperando: lim.esperando, maxParalelo: maxParalelo() };
}
