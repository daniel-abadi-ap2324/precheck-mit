/**
 * Proveedor «deepseek-api»: DeepSeek (API compatible con OpenAI) revisa el PreCheck con las herramientas de
 * herramientas-deepseek.ts. Recibe lo mismo que el agente de Claude Code (datos pedidos con su CRITERIO, zona,
 * reglas en revisión, aviso de regiones) y trabaja en un bucle de llamadas a herramientas que controla la web:
 * tope de pasos, de tiempo y de gasto. Termina con un dictamen JSON que se valida igual que los demás.
 *
 * Gasto: cada respuesta trae `usage`; se acumula en .data/deepseek_gasto.json y se corta al llegar a TOPE_USD.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EstadoPreCheck } from "@/server/prechecks/almacen";
import { reglasSinDecision } from "./alcance";
import { contrato, type Verbos } from "./contrato";
import type { RegistroIa } from "./registro";
import { type ContextoHerramientas, costoDeVerZona, definicionesParaApi, ejecutarHerramienta, MEDIR_DIBUJO, recortarPorLineas } from "./herramientas-deepseek";

export const MODELO_DEEPSEEK = "deepseek-flash";
export const URL_DEEPSEEK = "https://api.deepseek.com/chat/completions";
/** USD por millón de tokens, precio de pico (el peor caso). */
export const PRECIO_ENTRADA = 0.3;
export const PRECIO_SALIDA = 1.2;
// 20 → 60 el 13-oct: el contador va a precio de lista y DeepSeek factura ~4 veces menos (12.06 contados = 3.06 cobrados,
// comprobado en el saldo de la cuenta); 60 contados ≈ 15 reales, dentro de lo autorizado.
export const TOPE_USD = Number(process.env.PRECHECK_DEEPSEEK_TOPE_USD ?? 60);
// 0.6 → 0.9 el 13-oct: con los criterios de los 7 datos nuevos y las instrucciones de marcas, el contexto por llamada
// subió a ~125k tokens y Bella Vista cerró a los 0.62 USD con 48 datos escritos de 98 (r36 escribió 100 por 0.68).
// 16-oct: se puede quitar con PRECHECK_DEEPSEEK_TOPE_REVISION_USD=Infinity; siguen MAX_LLAMADAS, el tiempo y el tope total.
export const TOPE_POR_REVISION_USD = Number(process.env.PRECHECK_DEEPSEEK_TOPE_REVISION_USD ?? 1.5);
export const MAX_LLAMADAS = 70;
/** Número positivo de una variable de entorno, o el valor por defecto (vacío, 0 o no numérico → por defecto). */
const numeroDeEntorno = (nombre: string, porDefecto: number): number => {
  const v = Number(process.env[nombre]);
  return Number.isFinite(v) && v > 0 ? v : porDefecto;
};
// Variantes para las rondas de comparación (13-oct): cada tope se puede fijar por entorno al arrancar el servidor, así
// una variante es un reinicio y no un cambio de código. variantesDeepSeek() las deja escritas en el registro de la revisión.
/** Recortes por revisión: Bella Vista (9 láminas) gastó 63 de 87 llamadas en ver_recorte y cerró sin escribir datos. */
export const MAX_RECORTES = numeroDeEntorno("PRECHECK_DEEPSEEK_MAX_RECORTES", 20);
/** Llamadas a medir_dibujo por revisión. */
export const MAX_MEDICIONES = numeroDeEntorno("PRECHECK_DEEPSEEK_MAX_MEDICIONES", 25);
/** Llamadas a leer_zona por revisión (OCR local: no cuesta tokens de imagen, pero cada una tarda de 10 s a un par de minutos). */
export const MAX_LECTURAS_ZONA = numeroDeEntorno("PRECHECK_DEEPSEEK_MAX_LECTURAS_ZONA", 30);
/** Recortes seguidos sin escribir ningún dato antes de pedirle que escriba. */
export const RECORTES_SIN_ESCRIBIR = numeroDeEntorno("PRECHECK_DEEPSEEK_RECORTES_SIN_ESCRIBIR", 8);
/** Si cierra habiendo escrito menos de esta fracción de los datos pedidos, se le devuelve el cierre (hasta MAX_DEVOLUCIONES veces). */
export const COBERTURA_MINIMA = numeroDeEntorno("PRECHECK_DEEPSEEK_COBERTURA_MINIMA", 0.7);
/** Con 1, el razonamiento (reasoning_content) de los turnos ya consumidos no se vuelve a mandar (ronda 46). */
export const RECORTE_RAZONAMIENTO = process.env.PRECHECK_DEEPSEEK_RECORTE_HISTORIAL === "1";
/** Con 1, en escaneados un dato con cita literal del OCR lleva 0.9, no 0.6 (ronda 47). */
export const PISO_CONFIANZA_OCR = process.env.PRECHECK_DEEPSEEK_PISO_CONFIANZA_OCR === "1";
/** Qué se apartó de los valores por defecto, para el registro de la revisión («» si nada). */
export function variantesDeepSeek(): string {
  const partes: string[] = [];
  if (MAX_RECORTES !== 20) partes.push(`MAX_RECORTES=${MAX_RECORTES}`);
  if (MAX_LECTURAS_ZONA !== 30) partes.push(`MAX_LECTURAS_ZONA=${MAX_LECTURAS_ZONA}`);
  if (RECORTES_SIN_ESCRIBIR !== 8) partes.push(`RECORTES_SIN_ESCRIBIR=${RECORTES_SIN_ESCRIBIR}`);
  if (COBERTURA_MINIMA !== 0.7) partes.push(`COBERTURA_MINIMA=${COBERTURA_MINIMA}`);
  if (RECORTE_RAZONAMIENTO) partes.push("RECORTE_HISTORIAL=razonamiento");
  if (PISO_CONFIANZA_OCR) partes.push("PISO_CONFIANZA_OCR=1");
  return partes.join(", ");
}
/** Párrafo que se añade al prompt con PISO_CONFIANZA_OCR: la cita del OCR vale como prueba en un escaneado. */
export const PARRAFO_PISO_OCR =
  "\n\nPLANOS ESCANEADOS: el texto de buscar_texto y texto_pagina sale de un OCR y vale como prueba igual que el texto de un PDF vectorial. Un dato cuyo detalle cita literalmente lo que devolvió el OCR (o lo que leíste en un recorte legible) lleva 0.9; el 0.6 queda solo para lo que no encontraste ni en el OCR ni en los recortes.";
/** Párrafo que se añade al prompt con MEDIR_DIBUJO: cómo usar medir_dibujo y qué confianza lleva cada escala. */
export const PARRAFO_MEDIR =
  "\n\nMEDIDAS SOBRE EL DIBUJO (medir_dibujo): para frente y fondo del lote, retiros, alturas, altura entre losas, ancho de acera, rotura de cordón y ancho de rampa, primero busca la cota escrita (buscar_texto o texto_pagina); si el plano la escribe, ese es el valor. Si no la escribe, mide con medir_dibujo sobre la zona del dibujo que corresponde (la planta para retiros y frentes, la elevación o el corte para alturas): usa una cota de la respuesta, una separación entre líneas o la distancia entre dos puntos que tomaste del texto o de un recorte. Confianza: 0.9 solo si la escala es «comprobada» (dilo en detalle con las cotas de control); 0.8 si es «declarada»; con «sin_escala» no conviertas a metros ni escribas la medida. Nunca escribas 0 porque no encontraste algo: si no se puede medir, no escribas el dato o déjalo con 0.6 y el motivo.";
/** Párrafo de las láminas escaneadas: leer_zona y ver_zona antes que el OCR de la hoja entera. Va siempre (DeepSeek revisa también los escaneados). */
export const PARRAFO_ESCANEADOS =
  "\n\nLÁMINAS ESCANEADAS (el mensaje inicial dice cuáles; buscar_texto las marca con ocr: true): el texto de buscar_texto y texto_pagina sale de un OCR de la hoja entera a 150 ppp que se salta o lee mal el texto chico (dígitos de cotas, cuadros de áreas, datos de la finca). Para un dato de una lámina escaneada, primero leer_zona sobre la zona donde está (modo «cuadro» para cuadros y datos de la finca, «cotas» para números sueltos); si un dígito sale con confianza baja o sigue en duda, mira la zona con ver_zona (mosaico de la lámina o de una parte) o ver_recorte. Para ubicarte en una lámina escaneada que no conoces, un ver_zona de la hoja entera (3×3) antes de pedir recortes sueltos. Un dato leído con leer_zona con confianza de 80 o más en sus palabras, o confirmado en un recorte legible, lleva 0.9 como cualquier lectura; un dígito con confianza baja que un recorte no confirma va con 0.6 y el motivo. escribir_hecho no acepta un número con 0.85 o más de una lámina escaneada si no la leíste antes con leer_zona (un cálculo con datos ya escritos sí): no te fíes de los dígitos del OCR de la hoja entera ni de un recorte. AUSENCIAS EN LÁMINAS ESCANEADAS: el OCR sirve para buscar aunque lea mal algún dígito. Un «no» (o un 0 porque el elemento no existe: sin rampa, sin estacionamientos, retiro 0 entre medianeras, sin área verde) lleva 0.9, igual que en un plano vectorial, si buscaste sus palabras clave con buscar_texto en todas las láminas y miraste la lámina pertinente (ver_zona, ver_recorte o leer_zona) sin verlo; di en detalle qué buscaste y qué lámina miraste. 0.6 solo si esa zona es ilegible o no la miraste: un 0.6 en un dato que sí revisaste deja la regla sin decidir. SÍMBOLOS del dibujo (flecha de norte, puntos de referencia de la localización regional, línea de construcción o servidumbre acotadas, sentido de las puertas): un mosaico o un recorte grande llegan muy reducidos y no los muestran; antes de escribir que faltan, pide un ver_recorte chico (un octavo de la hoja o menos, a 200 ppp) del dibujo donde deberían estar. MEDIDAS EN CERO: en una lámina escaneada, una medida (altura, entrepiso, retiro, acera, patio) va con 0 solo si el elemento no existe y lo dices en detalle; si existe y no hallas la cota, léela con leer_zona en modo «cotas» o no escribas el dato. FRENTE Y FONDO DEL LOTE: salen de la localización general (la cota de la línea de propiedad sobre la calle) o del cuadro de linderos y rumbos, nunca de una elevación ni de un corte: el ancho de la fachada no es el frente del lote.";
/** Cómo hace DeepSeek, con sus herramientas, lo que pide el contrato común (contrato.ts). */
export const verbosDeepSeek = (): Verbos => ({
  buscarTexto: "buscar_texto (todas las láminas) y texto_pagina",
  ampliar: "ver_recorte de esa zona (en una lámina escaneada, leer_zona o ver_zona); mira el recorte antes de decidir",
  medir: MEDIR_DIBUJO
    ? "medir_dibujo sobre la zona del dibujo que corresponde: compara la escala con las cotas impresas y te dice si quedó «comprobada»; medir_retiro, medir_membrete y medir_curvas para sus datos"
    : "medir_retiro, medir_membrete y medir_curvas para sus datos; para lo demás, una cota de la misma vista en un recorte legible (sin cota de control, confianza 0.8 como máximo)",
  escribirDato: "escribir_hecho",
  reevaluar: "reevaluar",
  fijarAlcance:
    "Llama a fijar_alcance con el alcance completo (norma, codigo_zona, sf_sector, sf_unidad_territorial, datos_de_alcance y permisos, cada uno con su fuente y la cita literal); cada llamada reemplaza la anterior. Devuelve qué se aplicó, los errores que hay que corregir y las reglas vigentes que evalúas en el paso 2. Anota también en supuestos la norma y la zona con su fundamento.",
  leerDocumento: "buscar_texto y texto_pagina con el parámetro documento (las páginas escaneadas traen el texto del OCR)",
});
/** Prompt de sistema: herramientas y método de DeepSeek, y después el contrato común con el conocimiento vigente. */
export const sistemaDeepSeek = (conocimiento = ""): string =>
  `${SISTEMA_DEEPSEEK}${PISO_CONFIANZA_OCR ? PARRAFO_PISO_OCR : ""}${MEDIR_DIBUJO ? PARRAFO_MEDIR : ""}${PARRAFO_ESCANEADOS}\n\n${CABECERA_CONTRATO}\n\n${contrato(verbosDeepSeek(), conocimiento)}`;
const CABECERA_CONTRATO = "CONTRATO DE REVISIÓN (el mismo para todos los modelos; si algo de arriba choca con él, manda el contrato):";
export const MAX_DEVOLUCIONES = 2;
/** Fracción del tope por revisión a partir de la cual, si no ha escrito nada, se le pide escribir con lo que ya leyó. */
const FRACCION_AVISO_ESCRITURA = 0.5;
export const LIMITE_REVISION_MS = 25 * 60_000;
/** La respuesta final (dictamen) va después del razonamiento del modelo: necesita margen. */
const MAX_TOKENS_RESPUESTA = 32000;

export interface Gasto {
  usd: number;
  llamadas: number;
  tokens_entrada: number;
  tokens_salida: number;
}

const archivoGasto = (raiz: string) => join(/* turbopackIgnore: true */ raiz, "deepseek_gasto.json");

export async function leerGasto(raiz: string): Promise<Gasto> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ archivoGasto(raiz), "utf8")) as Gasto;
  } catch {
    return { usd: 0, llamadas: 0, tokens_entrada: 0, tokens_salida: 0 };
  }
}

export const costoDe = (entrada: number, salida: number) => (entrada / 1e6) * PRECIO_ENTRADA + (salida / 1e6) * PRECIO_SALIDA;

/** Las revisiones corren en paralelo en este mismo proceso: el archivo de gasto se actualiza de una en una y con escritura atómica. */
let colaGasto: Promise<unknown> = Promise.resolve();
async function anotarGasto(raiz: string, entrada: number, salida: number): Promise<Gasto> {
  const tarea = colaGasto.then(async () => {
    const g = await leerGasto(raiz);
    g.usd = Math.round(((Number(g.usd) || 0) + costoDe(entrada, salida)) * 1e6) / 1e6;
    g.llamadas = (Number(g.llamadas) || 0) + 1;
    g.tokens_entrada = (Number(g.tokens_entrada) || 0) + entrada;
    g.tokens_salida = (Number(g.tokens_salida) || 0) + salida;
    await mkdir(/* turbopackIgnore: true */ raiz, { recursive: true });
    const tmp = `${archivoGasto(raiz)}.${process.pid}.tmp`;
    await writeFile(/* turbopackIgnore: true */ tmp, JSON.stringify(g, null, 1));
    await rename(/* turbopackIgnore: true */ tmp, archivoGasto(raiz));
    return g;
  });
  colaGasto = tarea.catch(() => undefined);
  return tarea;
}

// ---------------------------------------------------------------------------------------------------------------
// Mensajes

type Contenido = string | { type: "text"; text: string }[] | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
export interface Mensaje {
  role: "system" | "user" | "assistant" | "tool";
  content: Contenido | null;
  reasoning_content?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface Respuesta {
  message: Mensaje;
  finish_reason: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}

/** Llama a la API; se puede reemplazar en pruebas. */
export type Cliente = (mensajes: Mensaje[], opciones: { tools?: unknown[]; json?: boolean; timeoutMs?: number }) => Promise<Respuesta>;

export function clienteHttp(apiKey: string, modelo = MODELO_DEEPSEEK): Cliente {
  return async (mensajes, opciones) => {
    const cuerpo: Record<string, unknown> = { model: modelo, messages: mensajes, max_tokens: MAX_TOKENS_RESPUESTA, temperature: 0 };
    if (opciones.tools?.length) cuerpo.tools = opciones.tools;
    if (opciones.json) cuerpo.response_format = { type: "json_object" };
    const r = await fetch(URL_DEEPSEEK, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(Math.max(10_000, Math.min(300_000, opciones.timeoutMs ?? 300_000))) });
    if (!r.ok) throw new Error(`DeepSeek respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const datos = (await r.json()) as { choices?: { message: Mensaje; finish_reason: string }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
    const c = datos.choices?.[0];
    if (!c?.message) throw new Error("DeepSeek respondió sin choices.");
    const usage = datos.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
    if (!Number.isFinite(usage.prompt_tokens) || !Number.isFinite(usage.completion_tokens)) throw new Error("DeepSeek respondió sin usage: no se puede anotar el gasto.");
    return { message: c.message, finish_reason: c.finish_reason, usage };
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Prompt

export interface DatoPedidoDs {
  clave: string;
  reglas: number;
  definicion?: string;
}

export const SISTEMA_DEEPSEEK = `Eres PreCheck IA, revisor técnico y normativo de anteproyectos de construcción para la Dirección de Obras y Construcciones (DOYC) del Municipio de Panamá. Trabajas sobre un plano en PDF con herramientas: buscar_texto (busca una expresión en TODAS las láminas; barato: úsalo antes que nada), texto_pagina (texto completo de una lámina por renglones con su posición; caro: solo las láminas que necesites enteras), ver_recorte (amplía una zona), ver_zona (mosaico de una lámina en una sola respuesta), leer_zona (OCR fino de una zona de una lámina escaneada), medir_membrete, medir_curvas y medir_retiro (medidas deterministas: cópialas), escribir_hecho (guarda un dato), reevaluar (corre el motor de reglas y te dice qué falta) y fijar_alcance (paso 1: fija las reglas vigentes).

Método, en este orden:
1. Lee el texto de la lámina 1 (ya lo tienes). Ejecuta medir_membrete, medir_curvas y medir_retiro una vez cada una. Para saber en qué lámina está algo, usa buscar_texto (p. ej. TENDEDERO|SECADORA|LAVAND, CURVA|NIVEL, PASAPORTE|CEDULA, SERVIDUMBRE, ACERA|BOLARDO|ARBOL) en vez de pedir cada lámina entera.
PASO 1 — REGLAS VIGENTES: con la FICHA DE ALCANCE del mensaje inicial, decide la norma (entre las candidatas, con la localización regional, el polígono del Metro o una zona exceptuada, la CEUS o una nota de la DPU), la zona, el sector y la UT, los datos de alcance que faltan y cualquier permiso especial de los documentos complementarios (léelos completos antes). Llama a fijar_alcance con todo eso y su fuente; corrige lo que devuelva en errores y vuelve a llamarla. escribir_hecho no se acepta antes.
2. Para CADA dato pedido, aplica su CRITERIO al pie de la letra y escríbelo con escribir_hecho. Si el criterio nombra un dibujo o una escala (p. ej. «la localización general, entre 1:100 y 1:500»), decide con ESE dibujo y no con otro. Antes de escribir false en un dato sí/no, busca sus palabras clave con buscar_texto en todas las láminas y amplía donde aparezcan: un «no» sin esa búsqueda vale 0.6, no 0.9. En el detalle de cada dato sí/no cita el texto exacto que lo sostiene y su lámina («AR-05: "WS ES EL ESPACIO PARA LA TORRE DE LAVADO"») o, si es «no», qué buscaste y en qué láminas; un detalle sin cita ni búsqueda va con 0.6. Escribe varios datos por turno. CONFIANZA: 0.9 es la normal cuando el dato sale del texto del PDF o de un recorte legible a 150 ppp o más, aunque el resultado te parezca discutible: el criterio ya decide la duda. Usa 0.85 si lo viste pero con alguna reserva. Solo 0.6 o menos cuando la zona es ilegible o no encontraste el dato tras mirar todas las láminas, y entonces dilo en detalle. El motor de reglas NO usa ningún dato con confianza menor de 0.85: si dejas en 0.7 lo que sí leíste, la regla queda sin decidir. Un dato sí/no es true si el plano lo muestra y false si lo buscaste en todas las láminas y no está (también con 0.9). Nunca inventes: si no se lee, no lo escribas como leído.
Si existe el RESUMEN DE REGIONES (abajo) úsalo para el conteo de plazas y los contrastes: no cuentes números a ojo.
3. Llama a reevaluar. Si faltan datos, escríbelos; repite hasta que no falte ninguno (máximo 3 reevaluaciones).
4. Decide SOLO las reglas que sigan en REQUIERE_REVISION después de tu última reevaluación: CUMPLE, NO_CUMPLE, OBSERVACION o NO_APLICA, con justificación (valor leído, límite, comparación) y subsanar accionable. Las que el motor ya decidió con tus datos no se cambian con una decisión (si un dato está mal, corrígelo con escribir_hecho y reevalúa; la web conserva el resultado del motor). NO_CUMPLE por ausencia solo si ampliaste la lámina pertinente a 150 ppp o más y tu confianza es ≥ 0.85; si no, OBSERVACION. Las reglas de otras zonas (grupo zona_por_confirmar) son NO_APLICA. Reglas cuyo único dato es un documento del expediente ajeno al plano (expediente.*, registro_publico.*: certificados, memoriales, resoluciones, paz y salvo, CEUS): si no consta, OBSERVACION con "estado": "INFORMACION_REQUERIDA" y en subsanar el documento exacto; no es una falla del plano. SOLO en esos casos: lo que falta en el plano (tendedero, cota, vegetación, bicicletas…) es OBSERVACION o NO_CUMPLE con "estado": "", nunca información requerida.
5. Hallazgos propios fuera del catálogo (láminas faltantes, cuadros inconsistentes…): regla_id "HALLAZGO-<n>" con titulo y decision.
6. Marcas: en cada NO_CUMPLE y OBSERVACION, cada evidencia lleva "marcas": rectángulos {"x","y","w","h","etiqueta"} en fracciones 0–1 de la página completa (x, y esquina superior izquierda; w, h ancho y alto) sobre el elemento exacto: la zona que ampliaste con ver_recorte (x0,y0 → x,y; x1−x0 → w; y1−y0 → h) o más ajustada. Si lo que falta no está, marca dónde debería estar con etiqueta «Falta: …». Si no ampliaste nada, lista vacía; nunca inventes una posición.

Cuando termines, responde SOLO con el dictamen en JSON (sin texto alrededor):
{"conclusion": "primera línea con el veredicto (CUMPLE LAS REGLAS EVALUADAS, CUMPLE CON OBSERVACIONES o NO CUMPLE) y 2 a 4 líneas", "supuestos": [{"hecho": "lote.codigo_zona", "valor": "RMH2", "fundamento": "…"}, {"hecho": "proyecto.obra_nueva", "valor": false, "fundamento": "…"}], "decisiones": [{"regla_id": "…", "decision": "CUMPLE|NO_CUMPLE|OBSERVACION|NO_APLICA", "estado": "" o "INFORMACION_REQUERIDA", "valor_leido": "texto con unidades o \\"\\"", "limite": "…", "justificacion": "…", "evidencia": [{"pagina": 1, "detalle": "…", "marcas": [{"x": 0.62, "y": 0.80, "w": 0.30, "h": 0.12, "etiqueta": "…"}]}], "subsanar": "…"}], "regiones_discrepantes": [], "objeciones": []}
En supuestos, "valor" lleva el mismo valor que escribiste para ese dato: true o false, un número sin unidades o el texto tal cual (p. ej. "tercer", no "TERCER ORDEN").
Ejemplo de decisión: {"regla_id": "A110-AIV-CURVAS-NIVEL", "decision": "NO_CUMPLE", "estado": "", "valor_leido": "sin curvas de nivel", "limite": "intervalo ≤ 1.00 m", "justificacion": "Ninguna de las 8 láminas trae curvas de nivel (medir_curvas sin serie; lámina 1 ampliada a 200 ppp). Es un requisito de presentación.", "evidencia": [{"pagina": 1, "detalle": "localización general", "marcas": [{"x": 0.05, "y": 0.10, "w": 0.40, "h": 0.35, "etiqueta": "Falta: curvas de nivel en la localización general"}]}], "subsanar": "Incluya la topografía con curvas de nivel a intervalos no mayores de 1.00 m."}

Nunca copies nombres, cédulas ni datos personales en el dictamen. Escribe en español. Sé breve en el razonamiento: cada llamada cuesta.`;

export interface EntradaRevision {
  estado: EstadoPreCheck;
  pedidos: DatoPedidoDs[];
  textoZona: string;
  conRegiones: boolean;
  reglasEnRevision: { regla_id: string; titulo: string | null; motivo_motor: string | null; grupo: string | null; norma: string | null; articulo: string | null; cita_textual: string | null }[];
  textoPagina1: string;
  numeroLaminas: number | null;
  /** Láminas escaneadas (extraccion.json): en ellas se lee con leer_zona y ver_zona. */
  laminasEscaneadas?: number[];
  /** regiones_resumen.json (conteos, medidas y discrepancias), si el plano tiene regiones. */
  resumenRegiones?: string;
  /** Variables que el arquitecto definió al 100 % (server/ia/definidas-texto.ts); vacío si no definió ninguna. */
  definidas?: string;
  /** Datos de alcance que puede escribir además de los pedidos (PRECHECK_DEEPSEEK_ALCANCE); vacío o ausente = ninguno. */
  alcance?: string[];
  /** Documentos complementarios (memoria descriptiva, cuadro de datos…) que se leen con el parámetro documento. */
  documentos?: { archivo: string; nombre: string }[];
  /** Lecciones y criterios vigentes (precheck.aprendizaje contexto), los mismos que reciben los demás proveedores. */
  conocimiento?: string;
  /** Ficha del paso 0 (alcance_base.json y lista cerrada) en pocas líneas; vacía si el motor no la escribió. */
  fichaAlcance?: string;
}

/** Tope del texto de la lámina 1 en el mensaje inicial: viaja en todas las llamadas y lo demás se localiza con buscar_texto. */
export const LIMITE_TEXTO_PAGINA1 = 25_000;
/** Desde esta llamada el mensaje inicial va en su versión corta (ver mensajeInicialCorto). */
export const LLAMADA_INICIAL_CORTO = 6;

const listaDatos = (pedidos: DatoPedidoDs[]) => pedidos.map((d) => `- ${d.clave} (${d.reglas} reglas)${d.definicion ? `: ${d.definicion}` : ""}`).join("\n");

/** Contexto que se conserva igual en las dos versiones del mensaje inicial (datos del usuario, zona, láminas y regiones). */
function cabecera(e: EntradaRevision): string[] {
  return [
    `Datos confirmados por el usuario: ${JSON.stringify(e.estado.datos)}.`,
    e.textoZona,
    e.fichaAlcance ?? "",
    e.definidas ?? "",
    e.numeroLaminas ? `El plano tiene ${e.numeroLaminas} láminas.` : "",
    e.laminasEscaneadas?.length ? `Láminas escaneadas (sin texto vectorial; lee sus datos con leer_zona y ver_zona): ${e.laminasEscaneadas.join(", ")}.` : "",
    e.documentos?.length ? textoDocumentos(e.documentos) : "",
    e.conRegiones ? `El plano trae regiones (polígonos propuestos, confianza < 0.85): úsalas como contraste, no como prueba, y anota en regiones_discrepantes lo que no coincida.${e.resumenRegiones ? `\nRESUMEN DE REGIONES (regiones_resumen.json):\n${e.resumenRegiones.slice(0, 12_000)}` : ""}` : "",
  ];
}

/** Documentos complementarios: se leen con buscar_texto y texto_pagina (parámetro documento). Misma regla que Claude Code. */
export const textoDocumentos = (docs: { archivo: string; nombre: string }[]) =>
  `DOCUMENTOS COMPLEMENTARIOS del profesional: ${docs.map((d) => `${d.archivo.replace(/\.pdf$/i, "")} («${d.nombre}»)`).join(", ")}. Pueden declarar cotas y datos que el plano no escribe (retiros, alturas, áreas, estacionamientos): búscalos con buscar_texto y léelos con texto_pagina pasando documento. Si un documento y el plano dicen distinto, prevalece el plano y lo anotas en la justificación.`;

/** Datos de alcance: opcionales, deciden qué reglas aplican. Una línea, para no alargar el contexto. */
export const textoAlcance = (alcance: string[]) =>
  `DATOS DE ALCANCE (opcionales): deciden qué reglas aplican (si hay rampa, si es obra nueva, si hay servidumbres…). Escribe con escribir_hecho los que el plano muestre o descarte con claridad (p. ej. «no hay rampas» → rampa.sentidos 0 con la lámina que lo prueba); no escribas los que no puedas comprobar: ${alcance.join(", ")}.`;

export function mensajeInicial(e: EntradaRevision): string {
  const reglas = e.reglasEnRevision.map((r) => `- ${r.regla_id}${r.titulo ? ` — ${r.titulo}` : ""}${r.grupo ? ` [${r.grupo}]` : ""}: ${r.cita_textual ?? ""}${r.motivo_motor ? ` (motor: ${r.motivo_motor})` : ""}`).join("\n");
  return [
    ...cabecera(e),
    `DATOS QUE DEBES ESCRIBIR (cada uno con escribir_hecho):\n${listaDatos(e.pedidos)}`,
    e.alcance?.length ? textoAlcance(e.alcance) : "",
    `REGLAS EN REQUIERE_REVISION que debes decidir (${e.reglasEnRevision.length}):\n${reglas}`,
    // Por renglones y con tope: una entrada JSON por palabra, hasta 60 000 caracteres, era la cuarta parte del contexto de cada llamada.
    `TEXTO DE LA LÁMINA 1 (por renglones: x y texto):\n${recortarPorLineas(e.textoPagina1, LIMITE_TEXTO_PAGINA1, "localiza el resto con buscar_texto o texto_pagina 1")}`,
    "Empieza.",
  ].filter(Boolean).join("\n\n");
}

/**
 * Versión corta del mensaje inicial para las llamadas tardías: solo los datos pedidos que aún no se escribieron (con su
 * criterio, que es lo que decide el valor) y las reglas por id y título. El texto de la lámina 1 y las citas ya se
 * leyeron al principio; reenviarlos en cada llamada costaba unos 25 000 caracteres por llamada en Tocumen.
 */
export function mensajeInicialCorto(e: EntradaRevision, escritas: ReadonlySet<string>): string {
  const pendientes = e.pedidos.filter((d) => !escritas.has(d.clave));
  const reglas = e.reglasEnRevision.map((r) => `- ${r.regla_id}${r.titulo ? ` — ${r.titulo}` : ""}`).join("\n");
  return [
    ...cabecera(e),
    pendientes.length
      ? `DATOS QUE FALTAN POR ESCRIBIR (${pendientes.length} de ${e.pedidos.length}; los demás ya están escritos):\n${listaDatos(pendientes)}`
      : `Ya escribiste los ${e.pedidos.length} datos pedidos; corrige con escribir_hecho solo si alguno está mal.`,
    `REGLAS EN REQUIERE_REVISION que debes decidir (${e.reglasEnRevision.length}; la cita de cada una vino en el primer mensaje):\n${reglas}`,
    "El texto de la lámina 1 vino en el primer mensaje; si lo necesitas otra vez, usa buscar_texto o texto_pagina 1. Sigue.",
  ].filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------------------------------------------
// Bucle

export interface ResultadoDeepSeek {
  dictamen: { conclusion: string; supuestos: unknown[]; decisiones: Record<string, unknown>[]; regiones_discrepantes?: unknown[]; objeciones?: unknown[] };
  llamadas: number;
  usd: number;
  herramientas: Record<string, number>;
}

/** Lo que recortarHistorial necesita para acortar el mensaje inicial: llamadas ya hechas, la entrada y las claves escritas. */
export interface OpcionesRecorte {
  llamadas: number;
  entrada: EntradaRevision;
  escritas: ReadonlySet<string>;
  /** Quitar también el reasoning_content de los turnos ya consumidos (variante RECORTE_RAZONAMIENTO). */
  razonamiento?: boolean;
}

/**
 * Resultados de herramienta e imágenes ya consumidos (no los del último turno) quedan en un resumen corto: el modelo ya
 * los leyó y volver a mandarlos en cada llamada multiplicaba el costo. Con `opciones`, desde la llamada
 * LLAMADA_INICIAL_CORTO el primer mensaje user (el inicial) pasa a su versión corta. Solo cambia el contenido de
 * mensajes existentes: el system sigue primero y la secuencia de roles (que la API valida) queda igual.
 */
export function recortarHistorial(mensajes: Mensaje[], opciones?: OpcionesRecorte): void {
  // Se conserva entero solo el último intercambio (desde el penúltimo mensaje del asistente): es lo que el modelo está usando.
  const roles = mensajes.map((m) => m.role);
  const ultimo = roles.lastIndexOf("assistant");
  const penultimo = ultimo > 0 ? roles.lastIndexOf("assistant", ultimo - 1) : -1;
  const corte = penultimo >= 0 ? penultimo : 0;
  for (let i = 0; i < corte; i++) {
    const m = mensajes[i];
    if (m.role === "tool" && typeof m.content === "string" && m.content.length > 600) m.content = `${m.content.slice(0, 300)} …(resultado ya leído; ${m.content.length} caracteres)`;
    if (m.role === "user" && Array.isArray(m.content) && m.content.some((c) => c.type === "image_url")) m.content = m.content.map((c) => (c.type === "image_url" ? { type: "text" as const, text: "[recorte ya visto]" } : c));
    // Los tool_calls se quedan: la API exige un mensaje tool por cada tool_call_id que siga en el historial.
    if (opciones?.razonamiento && m.role === "assistant" && m.reasoning_content) delete m.reasoning_content;
  }
  // `llamadas` son las ya hechas: lo que se recorte ahora lo ve la llamada llamadas + 1. El bucle recorta antes de correr
  // las herramientas del turno, así que lo escrito en ese turno sale de la lista una llamada después: no cambia nada, el
  // modelo ve el «Escrito …» en el historial. Se reescribe solo si cambió la lista de pendientes, para que el principio
  // del contexto siga idéntico entre turnos sin escrituras (DeepSeek cobra menos el prefijo que ya vio).
  const inicial = mensajes[1];
  if (opciones && opciones.llamadas + 1 >= LLAMADA_INICIAL_CORTO && mensajes[0]?.role === "system" && inicial?.role === "user" && typeof inicial.content === "string") {
    const corto = mensajeInicialCorto(opciones.entrada, opciones.escritas);
    if (inicial.content !== corto) inicial.content = corto;
  }
}

const extraerJson = (texto: string): unknown => {
  const t = texto.trim();
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("sin JSON");
  }
};

/**
 * Corre la revisión. `raizGasto` es la carpeta donde se acumula el gasto (.data). El registro recibe cada paso en
 * ia.log.txt; las imágenes no se guardan.
 */
export async function revisarConDeepSeek(cliente: Cliente, ctx: ContextoHerramientas, entrada: EntradaRevision, registro: RegistroIa, raizGasto: string): Promise<ResultadoDeepSeek> {
  const inicio = Date.now();
  let gasto = await leerGasto(raizGasto);
  if (gasto.usd >= TOPE_USD) throw new Error(`Tope de gasto de DeepSeek alcanzado (${gasto.usd.toFixed(2)} de ${TOPE_USD} USD): no se lanza.`);
  const variantes = variantesDeepSeek();
  if (variantes) registro.texto(`Variante de DeepSeek (entorno): ${variantes}.`);
  const mensajes: Mensaje[] = [
    { role: "system", content: sistemaDeepSeek(entrada.conocimiento) },
    { role: "user", content: mensajeInicial(entrada) },
  ];
  const tools = definicionesParaApi();
  const herramientas: Record<string, number> = {};
  // Imágenes vistas en la revisión: un ver_recorte es una, un ver_zona una por tesela. El tope MAX_RECORTES es sobre esto.
  let recortes = 0;
  let usdRevision = 0;
  let llamadas = 0;
  let pedirCierre = false;
  let cerrando = false;
  let continuado = false;
  let recordado = false;
  let avisoEscritura = false;
  // Cobertura: claves escritas con escribir_hecho (aceptadas) y cuántas veces se le devolvió el cierre por dejar datos sin escribir.
  const escritas = new Set<string>();
  let devueltos = 0;
  // Datos escritos después de la última reevaluación (p. ej. tras una devolución por cobertura): el motor no los vio.
  let escritoDesdeReevaluar = false;
  // Dictamen que se devolvió por cobertura: si la respuesta siguiente no sirve, se usa este.
  let previo: ResultadoDeepSeek["dictamen"] | null = null;

  const llamar = async (json: boolean): Promise<Respuesta> => {
    // Una llamada nunca puede pasarse del tiempo que le queda a la revisión (más un margen para el cierre).
    const r = await cliente(mensajes, { tools: json ? undefined : tools, json, timeoutMs: LIMITE_REVISION_MS + 120_000 - (Date.now() - inicio) });
    llamadas += 1;
    const costo = costoDe(r.usage.prompt_tokens, r.usage.completion_tokens);
    usdRevision += costo;
    gasto = await anotarGasto(raizGasto, r.usage.prompt_tokens, r.usage.completion_tokens);
    registro.texto(`DeepSeek llamada ${llamadas}: ${r.usage.prompt_tokens}+${r.usage.completion_tokens} tokens, ${costo.toFixed(4)} USD (revisión ${usdRevision.toFixed(3)}; acumulado ${gasto.usd.toFixed(3)}).`);
    return r;
  };

  for (;;) {
    const limite = llamadas >= MAX_LLAMADAS || Date.now() - inicio > LIMITE_REVISION_MS || usdRevision >= TOPE_POR_REVISION_USD || gasto.usd >= TOPE_USD;
    // Cinturón duro: pasado el límite más dos llamadas de cierre, se corta aunque el modelo siga pidiendo herramientas.
    if (llamadas >= MAX_LLAMADAS + 2 || usdRevision >= TOPE_POR_REVISION_USD * 1.5 || Date.now() - inicio > LIMITE_REVISION_MS + 5 * 60_000) throw new Error(`La revisión no cerró dentro del límite (${llamadas} llamadas, ${usdRevision.toFixed(3)} USD).`);
    if (limite && !pedirCierre) {
      pedirCierre = true;
      // Sin herramientas y con JSON forzado: la API ya no puede devolver tool_calls y el bucle solo puede terminar.
      cerrando = true;
      registro.texto("Límite de la revisión alcanzado: se pide el dictamen con lo que hay.");
      mensajes.push({ role: "user", content: "Se acabó el tiempo de revisión. Responde AHORA solo con el dictamen en JSON con lo que ya comprobaste; lo que no comprobaste va como OBSERVACION." });
    }
    const r = await llamar(cerrando);
    const m = r.message;
    // Lo que el modelo ya vio en turnos anteriores no se vuelve a mandar entero: el contexto llegaba a 150k tokens.
    recortarHistorial(mensajes, { llamadas, entrada, escritas, razonamiento: RECORTE_RAZONAMIENTO });
    // Con herramientas, DeepSeek exige que el reasoning_content vuelva en cada turno.
    mensajes.push({ role: "assistant", content: m.content ?? "", ...(m.reasoning_content ? { reasoning_content: m.reasoning_content } : {}), ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}) });
    if (m.tool_calls?.length && !cerrando) {
      // La API exige un mensaje tool por cada tool_call_id, seguidos; las imágenes van después, en un solo mensaje user.
      const imagenes: ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] = [];
      for (const tc of m.tool_calls) {
        let args: Record<string, unknown> | null = null;
        try {
          args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = null;
        }
        herramientas[tc.function.name] = (herramientas[tc.function.name] ?? 0) + 1;
        const costo = args === null ? 0 : tc.function.name === "ver_recorte" ? 1 : tc.function.name === "ver_zona" ? costoDeVerZona(args) : 0;
        const sinRecortes = costo > 0 && recortes + costo > MAX_RECORTES;
        if (costo && !sinRecortes) recortes += costo;
        const res = args === null
          ? { texto: `Los argumentos de ${tc.function.name} no son JSON válido; repite la llamada.` }
          : sinRecortes
            ? { texto: recortes < MAX_RECORTES && tc.function.name === "ver_zona" ? `Ese mosaico son ${costo} imágenes y te quedan ${MAX_RECORTES - recortes} de las ${MAX_RECORTES} de esta revisión: pide un mosaico de 2×2, una zona con ver_recorte o el texto con leer_zona.` : `Ya usaste los ${MAX_RECORTES} recortes de esta revisión. Escribe ahora los datos con lo que leíste (texto_pagina, leer_zona y recortes anteriores); lo que no pudiste comprobar va con confianza 0.6 y el motivo.` }
            : tc.function.name === "leer_zona" && herramientas.leer_zona > MAX_LECTURAS_ZONA
              ? { texto: `Ya usaste las ${MAX_LECTURAS_ZONA} lecturas de zona de esta revisión. Escribe los datos con lo que leíste.` }
              : tc.function.name === "medir_dibujo" && (!MEDIR_DIBUJO || herramientas.medir_dibujo > MAX_MEDICIONES)
                ? { texto: MEDIR_DIBUJO ? `Ya usaste las ${MAX_MEDICIONES} mediciones de esta revisión. Escribe los datos con lo que mediste.` : "medir_dibujo no está disponible en esta revisión." }
                : await ejecutarHerramienta(ctx, tc.function.name, args);
        const vistas = (res.imagenBase64 ? 1 : 0) + (res.imagenes?.length ?? 0);
        registro.texto(`Herramienta ${tc.function.name}(${JSON.stringify(args).slice(0, 160)}) → ${res.texto.slice(0, 200)}${vistas === 1 ? " [imagen]" : vistas ? ` [${vistas} imágenes]` : ""}`);
        if (tc.function.name === "escribir_hecho" && res.texto.startsWith("Escrito ") && typeof args?.clave === "string") {
          escritas.add(args.clave);
          escritoDesdeReevaluar = true;
        }
        if (tc.function.name === "reevaluar") escritoDesdeReevaluar = false;
        mensajes.push({ role: "tool", tool_call_id: tc.id, content: res.texto.slice(0, 60_000) });
        if (res.imagenBase64) imagenes.push({ type: "text", text: `Recorte ${JSON.stringify(args).slice(0, 120)}:` }, { type: "image_url", image_url: { url: `data:image/png;base64,${res.imagenBase64}` } });
        for (const im of res.imagenes ?? []) imagenes.push({ type: "text", text: `${im.etiqueta}:` }, { type: "image_url", image_url: { url: `data:image/png;base64,${im.base64}` } });
      }
      if (imagenes.length) mensajes.push({ role: "user", content: imagenes });
      // Sin ningún dato escrito a mitad del presupuesto o tras varios recortes: se le pide escribir ya, antes de que el tope lo
      // obligue a cerrar en blanco (Tocumen r39: 24 recortes, 2 datos, cerró a los 0.33 USD). Sin criterios: ya están en el
      // mensaje inicial y repetirlos aquí los dejaría dos veces en todas las llamadas siguientes.
      if (!herramientas.escribir_hecho && !avisoEscritura && entrada.pedidos.length && (usdRevision >= TOPE_POR_REVISION_USD * FRACCION_AVISO_ESCRITURA || (herramientas.ver_recorte ?? 0) + (herramientas.ver_zona ?? 0) >= RECORTES_SIN_ESCRIBIR)) {
        avisoEscritura = true;
        registro.texto("Presupuesto o recortes gastados sin datos escritos: se le pide escribir con lo leído.");
        mensajes.push({ role: "user", content: "Llevas mucho presupuesto en ampliar y no has escrito ningún dato. Deja de ampliar: escribe AHORA con escribir_hecho cada dato pedido usando lo que ya leíste (varios por turno), luego llama a reevaluar y cierra." });
      }
      continue;
    }
    const texto = typeof m.content === "string" ? m.content : "";
    // Se cortó por longitud sin llegar al contenido: se le pide seguir, una vez, en vez de darlo por inválido.
    if (r.finish_reason === "length" && !texto.trim() && !continuado) {
      continuado = true;
      registro.texto("La respuesta se cortó por longitud antes del dictamen: se pide continuar directo al JSON.");
      mensajes.push({ role: "user", content: "Tu respuesta se cortó. No razones más: escribe directamente el dictamen en JSON." });
      continue;
    }
    // Terminó sin haber escrito ningún dato: se le recuerda el paso 2 antes de aceptar el cierre.
    if (!cerrando && !herramientas.escribir_hecho && !recordado && entrada.pedidos.length) {
      recordado = true;
      registro.texto("El modelo intentó cerrar sin escribir datos: se le pide escribir primero los datos pedidos.");
      mensajes.push({ role: "user", content: "Todavía no escribiste ningún dato con escribir_hecho. Escribe primero los datos pedidos (uno por llamada), llama a reevaluar y después cierra con el dictamen." });
      continue;
    }
    // Cierra con muchos datos pedidos sin escribir y aún hay presupuesto: se le devuelve con la lista, hasta dos veces.
    // (Bella Vista r37–38 y Tocumen r39: dictamen con 48, 81 y 2 datos de ~100; el motor decide con lo escrito.)
    // Solo las claves: el criterio de cada una ya está en el mensaje inicial (entero o en su versión corta).
    const faltan = entrada.pedidos.map((p) => p.clave).filter((k) => !escritas.has(k));
    if (!cerrando && escritas.size > 0 && devueltos < MAX_DEVOLUCIONES && faltan.length > entrada.pedidos.length * (1 - COBERTURA_MINIMA)) {
      devueltos += 1;
      registro.texto(`Cierre devuelto (${devueltos}): escribió ${escritas.size} de ${entrada.pedidos.length} datos pedidos; se le pide escribir los que faltan.`);
      mensajes.push({ role: "user", content: `Todavía no: escribiste ${escritas.size} de ${entrada.pedidos.length} datos pedidos y el motor decide con los datos, no con el dictamen. Escribe AHORA con escribir_hecho (varios por turno) cada uno de estos, con lo que ya leíste (si no se pudo comprobar, confianza 0.6 y el motivo): ${faltan.slice(0, 60).join(", ")}${faltan.length > 60 ? "…" : ""}. Luego llama a reevaluar y después el dictamen.` });
      continue;
    }
    try {
      const d = extraerJson(texto) as ResultadoDeepSeek["dictamen"];
      if (!Array.isArray(d.decisiones)) throw new Error("sin decisiones");
      // Si escribió datos y nunca reevaluó, el motor no los vio: se reevalúa aquí (San Francisco r34: 62 datos escritos,
      // hechos.json viejo, 90 % «faltantes» en la medición). No cuesta llamadas al modelo.
      if (herramientas.escribir_hecho && (!herramientas.reevaluar || escritoDesdeReevaluar)) {
        registro.texto("El modelo cerró con datos escritos que el motor no vio: se reevalúa.");
        await ctx.reevaluar();
        escritoDesdeReevaluar = false;
      }
      // Cobertura del paso 2 (contrato, C-COBERTURA): toda regla vigente que siga en revisión lleva una decisión. Se le
      // devuelve una vez, sin herramientas, para que complete el dictamen; si esa respuesta no sirve, queda esta.
      if (previo) {
        // Lo que decidió antes y no repitió en el dictamen completo se conserva.
        const nuevas = new Set(d.decisiones.map((x) => x.regla_id));
        d.decisiones = [...d.decisiones, ...previo.decisiones.filter((x) => !nuevas.has(x.regla_id))];
      }
      const sinDecidir = previo ? [] : await reglasSinDecision(ctx.dir, d.decisiones.map((x) => x.regla_id)).catch(() => []);
      if (sinDecidir.length && !cerrando && usdRevision < TOPE_POR_REVISION_USD) {
        previo = d;
        cerrando = true;
        registro.texto(`Cierre devuelto por cobertura: ${sinDecidir.length} regla(s) vigentes en revisión sin decisión.`);
        mensajes.push({ role: "user", content: `Faltan decisiones para ${sinDecidir.length} regla(s) vigentes que siguen en REQUIERE_REVISION: ${sinDecidir.slice(0, 80).join(", ")}${sinDecidir.length > 80 ? "…" : ""}. Decide cada una con la jerarquía del contrato y responde SOLO con el dictamen COMPLETO en JSON (las decisiones que ya diste y estas).` });
        continue;
      }
      return { dictamen: d, llamadas, usd: usdRevision, herramientas };
    } catch {
      if (previo) {
        registro.texto("La respuesta a la devolución por cobertura no es un dictamen válido: queda el anterior.");
        return { dictamen: previo, llamadas, usd: usdRevision, herramientas };
      }
      if (cerrando) throw new Error(`DeepSeek no devolvió un dictamen JSON válido (${r.finish_reason}).`);
      cerrando = true;
      registro.texto("La respuesta no es un dictamen JSON: se pide el cierre en formato JSON.");
      mensajes.push({ role: "user", content: "Responde ahora SOLO con el dictamen en JSON, con el formato indicado." });
    }
  }
}
