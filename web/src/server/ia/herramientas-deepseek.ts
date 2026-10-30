/**
 * Herramientas que la web le presta a DeepSeek para revisar un plano (proveedor «deepseek-api»). Son el equivalente
 * acotado de lo que Claude Code hace con Bash y Read: ver el texto de una página, ampliar un recorte, correr las
 * medidas deterministas, escribir un hecho en lote.json y reevaluar el motor. Cada una se limita a la carpeta del
 * PreCheck y el modelo nunca ejecuta código propio.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { PYTHON, REPO } from "@/server/planos/procesar";
import { escribirAlcance, resumenDelAlcance } from "./alcance";
import { DATOS_AJENOS_AL_PLANO } from "./pendientes";

const ejecutar = promisify(execFile);
const LIMITE_MS = 120_000;
/** Recortes: resolución y tamaño máximos (la API reduce cada imagen a unos 384 tokens: más píxeles no ayudan). */
export const PPP_MAX = 220;
export const LADO_MAX_PX = 1400;
/** Mosaico de ver_zona: filas (= columnas) permitidas y solape entre teselas vecinas (fracción de la hoja). */
export const FILAS_MOSAICO = [2, 3] as const;
export const SOLAPE_MOSAICO = 0.04;
/** leer_zona lee a 300–400 ppp con Tesseract (y RapidOCR si está): una zona grande tarda hasta un par de minutos. */
const LIMITE_OCR_ZONA_MS = 5 * 60_000;

export interface Herramienta {
  nombre: string;
  descripcion: string;
  parametros: Record<string, unknown>;
}

/** Parámetro opcional de texto_pagina y buscar_texto: un documento complementario en vez del plano. */
const DOCUMENTO = { type: "string", description: "Opcional: «plano» (por defecto) o un documento complementario por su archivo (p. ej. complementario-1), si el mensaje inicial lista alguno." };

/** Definiciones en el formato de «tools» de la API (compatible con OpenAI). */
export const HERRAMIENTAS: Herramienta[] = [
  {
    nombre: "texto_pagina",
    descripcion: "Texto del PDF de una lámina, una línea por renglón de texto con la posición de su inicio (x y en fracciones 0–1 de la hoja, origen arriba a la izquierda). Exacto en planos vectoriales; en láminas escaneadas son las líneas del OCR (ocr: sí, con posibles errores de lectura y posición aproximada). Caro en tokens: pide solo las láminas que necesites enteras; para localizar algo o tener la posición de una palabra usa buscar_texto.",
    parametros: { type: "object", properties: { pagina: { type: "integer", minimum: 1 }, documento: DOCUMENTO }, required: ["pagina"] },
  },
  {
    nombre: "buscar_texto",
    descripcion: "Busca una expresión regular (sin distinguir mayúsculas ni tildes) en el texto de TODAS las láminas del PDF y devuelve cada coincidencia con su lámina y posición en fracciones 0–1. Barato y exacto: úsalo antes de ampliar o de escribir «no» en un dato sí/no (p. ej. TENDEDERO|SECADORA, PASAPORTE|C[EÉ]DULA, SERVIDUMBRE). En láminas escaneadas busca en el OCR (marcadas con ocr: true; el texto puede traer errores de lectura y la posición es aproximada: confirma con ver_recorte).",
    parametros: { type: "object", properties: { patron: { type: "string" }, contexto: { type: "integer", minimum: 0, maximum: 6 }, documento: DOCUMENTO }, required: ["patron"] },
  },
  {
    nombre: "ver_recorte",
    descripcion: "Imagen ampliada de una zona de una lámina. x0,y0,x1,y1 en fracciones 0–1 de la hoja (origen arriba a la izquierda, como la vista impresa); ppp hasta 220. Pide zonas chicas (membrete, cuadro, un lindero): la hoja entera no se lee.",
    parametros: {
      type: "object",
      properties: { pagina: { type: "integer", minimum: 1 }, x0: { type: "number" }, y0: { type: "number" }, x1: { type: "number" }, y1: { type: "number" }, ppp: { type: "integer" } },
      required: ["pagina", "x0", "y0", "x1", "y1"],
    },
  },
  {
    nombre: "ver_zona",
    descripcion:
      "Mosaico de imágenes de una zona de una lámina (por defecto la hoja entera): la parte en filas×filas teselas (2 o 3) con un poco de solape y devuelve TODAS en una sola respuesta, cada una con su posición x0,y0–x1,y1 en fracciones 0–1 de la hoja. Sirve para recorrer una lámina escaneada sin pedir recorte por recorte; luego amplía con ver_recorte o lee con leer_zona la tesela que interese. Cada tesela cuenta como un recorte del tope de la revisión.",
    parametros: {
      type: "object",
      properties: { pagina: { type: "integer", minimum: 1 }, x0: { type: "number" }, y0: { type: "number" }, x1: { type: "number" }, y1: { type: "number" }, filas: { type: "integer", enum: [2, 3] } },
      required: ["pagina"],
    },
  },
  {
    nombre: "leer_zona",
    descripcion:
      "OCR de una zona de una lámina ESCANEADA, a 300–400 ppp y con la imagen limpia (fondo aplanado, contraste, enderezada; la lee en el giro que mejor se lee: láminas giradas y textos verticales). Mucho mejor que el OCR de la hoja entera para cotas, cuadros de áreas, datos de la finca y notas chicas. Devuelve cada renglón con su posición (fracciones 0–1 de la hoja) y la confianza [0–100] cuando es menor de 90 (lee RapidOCR; Tesseract solo si RapidOCR no lee nada). modo: «texto» (por defecto: notas, rótulos, membrete), «cuadro» (cuadro de áreas, datos de la finca) o «cotas» (solo números). Pide zonas de un cuarto de hoja o menos. En láminas vectoriales usa texto_pagina o buscar_texto (exactos).",
    parametros: {
      type: "object",
      properties: {
        pagina: { type: "integer", minimum: 1 },
        x0: { type: "number" },
        y0: { type: "number" },
        x1: { type: "number" },
        y1: { type: "number" },
        modo: { type: "string", enum: ["texto", "cuadro", "cotas"] },
        ppp: { type: "integer", minimum: 300, maximum: 400 },
      },
      required: ["pagina", "x0", "y0", "x1", "y1"],
    },
  },
  { nombre: "medir_membrete", descripcion: "Ancho de la franja del membrete (dato plano.pie_descriptivo.franja_sellos_ancho_m) medido en todas las láminas; copia ancho_min_m con confianza 0.9.", parametros: { type: "object", properties: {} } },
  { nombre: "medir_curvas", descripcion: "Equidistancia de las curvas de nivel (dato plano.intervalo_curvas_nivel_m) desde los rótulos del PDF; si da equidistancia_m cópiala con confianza 0.9, si no, mira la lámina.", parametros: { type: "object", properties: {} } },
  { nombre: "medir_retiro", descripcion: "Retiro posterior (dato proyecto.retiro_posterior_m) medido sobre los polígonos de lote y huella del plano, con el frente por los rótulos de calle. Si da retiro_posterior_m cópialo (método medicion, confianza 0.9); si da null, usa sus distancias por lado y decide tú cuál es el posterior mirando la lámina.", parametros: { type: "object", properties: {} } },
  {
    nombre: "escribir_hecho",
    descripcion: "Escribe un dato en lote.json. clave con puntos (p. ej. proyecto.altura_m); valor número, texto o true/false; confianza 0–1 (0.85 o más solo si lo comprobaste); metodo: lectura, medicion, calculo o vision; detalle: qué viste y dónde; pagina de la lámina; documento: «plano» (por defecto) o el complementario de donde sale el dato.",
    parametros: {
      type: "object",
      properties: {
        clave: { type: "string" },
        valor: {},
        confianza: { type: "number", minimum: 0, maximum: 1 },
        metodo: { type: "string" },
        detalle: { type: "string" },
        pagina: { type: "integer" },
        documento: DOCUMENTO,
      },
      required: ["clave", "valor", "confianza", "metodo", "detalle"],
    },
  },
  { nombre: "reevaluar", descripcion: "Vuelve a correr el motor de reglas con lo que escribiste. Devuelve los datos que todavía faltan y las reglas que siguen en REQUIERE_REVISION. Úsalo después de escribir varios datos y antes de cerrar.", parametros: { type: "object", properties: {} } },
  {
    nombre: "fijar_alcance",
    descripcion:
      "PASO 1 (reglas vigentes): fija la norma, la zona, el sector, la unidad territorial, los datos de alcance y los permisos especiales, cada uno con su fuente, y reevalúa. Cada llamada REEMPLAZA el alcance anterior: manda siempre el alcance completo. Cada valor va como {valor, confianza, fuente: {documento: «plano» o complementario-N, pagina, cita: texto literal de esa página, metodo: lectura|vision|medicion}}; una cita con metodo lectura se comprueba contra el texto de la página. Devuelve qué se aplicó, qué no (errores, para corregir) y la lista de reglas vigentes. Si no hay nada que fijar, llámala con {}. escribir_hecho no se acepta hasta haberla llamado.",
    parametros: {
      type: "object",
      properties: {
        norma: { type: "object", description: "Norma aplicable (una registrada; p. ej. MIVIOT-ML2), con su fuente." },
        codigo_zona: { type: "object" },
        sf_sector: { type: "object" },
        sf_unidad_territorial: { type: "object" },
        datos_de_alcance: { type: "object", description: "Clave del dato (p. ej. proyecto.obra_nueva, rampa.sentidos) → {valor, confianza, fuente}. Un dato que solo cuenta si existe, con valor false, se quita." },
        permisos: {
          type: "array",
          description: "Permisos especiales: {id: PERM-1, tipo: excepcion|norma_especial|resolucion_edificabilidad|otro, titulo, documento, pagina, cita_textual (literal), norma (solo norma_especial), valor (solo resolucion_edificabilidad), efecto: [{regla_id, accion: exceptua|condiciona, motivo}], propuesta_regla: {titulo, aplica_si, condicion} si no está en el catálogo}.",
          items: { type: "object" },
        },
      },
    },
  },
];

/** DeepSeek tiene siempre medir_dibujo (ronda 76; antes solo con PRECHECK_DEEPSEEK_MEDIR=1): medidas en metros sobre las líneas del PDF. */
export const MEDIR_DIBUJO = true;

export const HERRAMIENTA_MEDIR: Herramienta = {
  nombre: "medir_dibujo",
  descripcion:
    "Mide sobre las LÍNEAS del PDF vectorial (no la imagen) una zona de una lámina, x0,y0,x1,y1 en fracciones 0–1 como en buscar_texto. Devuelve: escala (comprobada con las cotas impresas de la zona, declarada o sin escala), las cotas escritas en la zona con la línea que miden, las líneas más largas en metros, las separaciones entre líneas paralelas (niveles de una elevación, ancho de acera o de rampa, retiro entre lindero y pared) y, si das de y a (puntos [x, y]), la distancia entre ellos. Úsala para frente, fondo, retiros, alturas, altura entre losas, acera, rotura de cordón y rampas cuando el plano no escribe la cota. No sirve en láminas escaneadas.",
  parametros: {
    type: "object",
    properties: {
      pagina: { type: "integer", minimum: 1 },
      x0: { type: "number" },
      y0: { type: "number" },
      x1: { type: "number" },
      y1: { type: "number" },
      de: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
      a: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
    },
    required: ["pagina", "x0", "y0", "x1", "y1"],
  },
};

export const definicionesParaApi = (conMedir = MEDIR_DIBUJO) =>
  [...HERRAMIENTAS, ...(conMedir ? [HERRAMIENTA_MEDIR] : [])].map((h) => ({ type: "function", function: { name: h.nombre, description: h.descripcion, parameters: h.parametros } }));

export interface ResultadoHerramienta {
  /** Texto que vuelve al modelo (JSON o explicación). */
  texto: string;
  /** PNG en base64, si la herramienta produjo una imagen. */
  imagenBase64?: string;
  /** Varias imágenes en una respuesta (ver_zona), cada una con la etiqueta que la ubica en la hoja. */
  imagenes?: { etiqueta: string; base64: string }[];
}

const python = async (args: string[], cwd = REPO, timeout = LIMITE_MS): Promise<string> => {
  const { stdout } = await ejecutar(PYTHON, args, { cwd, timeout, maxBuffer: 50 * 1024 * 1024, windowsHide: true });
  return stdout;
};

/** Carpeta de caché del OCR de las láminas escaneadas (dentro de tmp del PreCheck; se borra con la revisión siguiente). */
const cacheOcr = (dir: string) => join(/* turbopackIgnore: true */ dir, "tmp", "ocr");

/**
 * Lee con OCR (Tesseract, el mismo lector del extractor) las láminas escaneadas del PDF y deja la caché que usan
 * buscar_texto y texto_pagina. Se llama antes del bucle para que el tiempo no cuente contra la revisión. Nunca lanza.
 */
export async function prepararOcr(ctx: ContextoHerramientas, paginas: number[] = []): Promise<Record<string, number> | null> {
  if (!ctx.pdf) return null;
  try {
    const salida = await python([join(/* turbopackIgnore: true */ REPO, "scripts", "ocr_laminas.py"), ctx.pdf, cacheOcr(ctx.dir), ...paginas.map(String)], REPO, 15 * 60_000);
    return (JSON.parse(salida) as { laminas?: Record<string, number> }).laminas ?? {};
  } catch {
    return null;
  }
}

/** Python compartido: líneas OCR de una lámina escaneada desde la caché (o leyéndola ahora, con el lector del extractor). */
const PY_OCR = [
  "import os as _os, json as _J, sys as _sys",
  "_sys.path.insert(0, _os.getcwd())",
  "def ocr(doc, n, cache):",
  "    p=_os.path.join(cache, f'ocr_p{n}.json')",
  "    if _os.path.exists(p): return _J.load(open(p, encoding='utf-8'))",
  "    from scripts.ocr_laminas import ocr_pagina",
  "    return ocr_pagina(doc, n, __import__('pathlib').Path(cache))",
].join("\n");

export interface ContextoHerramientas {
  /** Carpeta del PreCheck (extraccion.json, lote.json, resultado.json, p<N>.png…). */
  dir: string;
  /** PDF original del plano. */
  pdf: string | null;
  /** Claves que el modelo puede escribir (las que piden las reglas). Vacío = cualquiera. */
  clavesPermitidas: Set<string>;
  /** Vuelve a evaluar el motor sobre la carpeta (reusa motor.reevaluar). */
  reevaluar: () => Promise<boolean>;
  /** Tipo que el contrato (scripts/hechos_documentales.json) fija para cada dato: «bool», «numero» o «texto». Sin entrada, no se comprueba. */
  tipos?: Map<string, string>;
  /** Valores de los datos de lista cerrada del contrato (ADR-0019): lote.orden_conservacion solo es "primer"…"baldio". */
  listas?: Map<string, string[]>;
  /** Documentos complementarios copiados a la carpeta (documentos.json): archivo (complementario-1.pdf), nombre original y ruta. */
  documentos?: { archivo: string; nombre: string; ruta: string }[];
  /** Con true, escribir_hecho espera a que el modelo haya llamado a fijar_alcance (paso 1 antes del paso 2). */
  exigirAlcance?: boolean;
  /** Ya llamó a fijar_alcance en esta revisión. */
  alcanceFijado?: boolean;
  /** Tras cada reevaluación: agrega a clavesPermitidas los datos que piden las reglas que se volvieron aplicables. */
  actualizarClaves?: () => Promise<void>;
  /**
   * Controles del contrato sobre escribir_hecho (C-AUSENCIA y C-MEDICION): láminas ampliadas a 150 ppp o más y láminas
   * medidas con medir_dibujo en esta revisión. Sin este campo no se controla (pruebas y usos antiguos).
   * leidas: láminas leídas con leer_zona (C-LECTURA en escaneados).
   */
  controles?: { ampliadas: Set<number>; medidas: Set<number>; medir: boolean; escaneadas: Set<number>; leidas: Set<number> };
}

/** Datos de medida que se miden sobre el dibujo: rotura de cordón, frente, fondo, retiros, alturas, entrepiso, acera y rampa. */
export const DATO_DE_MEDIDA = /(rotura_cordon|frente|fondo|retiro|altura|entrepiso|losas|acera|rampa)[a-z0-9_.]*_m$/;
/** Un 0 que dice que el elemento no existe (no que no se encontró la cota): «no hay cota» no cuenta. */
const NO_EXISTE = /\b((no hay|no existe|no tiene)(?! (ninguna |una )?(cota|medida|dimensi|dato|acotaci|n[uú]mero|valor))|sin (rampa|acceso|retiro|acera|entrada)|adosad)/i;
/** Medidas que en una lámina escaneada no se escriben con 0 si el elemento existe: las de medir_dibujo y las del patio. */
const MEDIDA_ESCANEADA = /patio[a-z0-9_.]*_m$/;
/** Frente y fondo del lote: salen de la localización general o del cuadro de linderos, no de una elevación ni de un corte. */
const FRENTE_FONDO = /^lote\.(frente|fondo)[a-z0-9_]*_m$/;
const DE_LOCALIZACION = /localizaci|lindero|rumbo|l[ií]nea de propiedad|pol[ií]gono del lote|planta de conjunto|planta de sitio|catastr|cuadro de (datos|la finca)/i;

/** Por qué el contrato no deja escribir este dato todavía; null si se puede. */
export function controlDelContrato(ctx: ContextoHerramientas, p: { clave: string; valor: unknown; confianza: number; metodo?: string; detalle: string; pagina?: number; documento?: unknown }): string | null {
  const c = ctx.controles;
  // Lo que sale de un documento complementario o del expediente no se amplía ni se mide sobre el plano.
  if (!c || (p.documento !== undefined && p.documento !== null && p.documento !== "" && p.documento !== "plano") || /^(expediente|declarado)$/.test(p.metodo ?? "")) return null;
  const lamina = paginaValida(p.pagina) ? p.pagina : null;
  // ADR-0018: «no aplica» no es ni sí ni no. En Casco Antiguo los modelos escribían la rampa que no existe unas veces true
  // y otras false; se escribe el dato que decide si la regla aplica y el motor la deja en NO_APLICA.
  if (typeof p.valor === "boolean" && /^\W*no aplica/i.test(p.detalle ?? ""))
    return `${p.clave}: «no aplica» no se escribe como sí ni como no. No escribas este dato: escribe el que decide si su regla aplica (rampa.ancho_m = 0 si no hay rampa vehicular, proyecto.estacionamientos = 0, lote.otros_anteproyectos_misma_finca = false, plano.tinaquera.presente = false) y el motor la deja en NO_APLICA.`;
  // ADR-0018: la vigencia de la idoneidad no sale del plano (el sello da el número, no la vigencia).
  if (/^profesional\.[a-z_]*vigente$/.test(p.clave))
    return `${p.clave} no sale del plano: el sello da el número de idoneidad, no su vigencia. Escríbelo solo desde la constancia de la JTIA del expediente (documento y página); sin ella no lo escribas y la regla queda como información requerida.`;
  // C-FRENTE: en Casco Antiguo r80 DeepSeek tomó el frente (24.16) de la cota del ancho de la fachada en la elevación; el
  // frente del lote es la cota de la línea de propiedad (Claude, 27.41 en la localización).
  // Lista blanca: el detalle tiene que nombrar de dónde sale (DeepSeek reescribe el detalle para pasar un control).
  if (FRENTE_FONDO.test(p.clave) && typeof p.valor === "number" && p.metodo !== "calculo" && !DE_LOCALIZACION.test(p.detalle ?? ""))
    return `${p.clave} es del lote: sale de la localización general (la cota de la línea de propiedad sobre la calle) o del cuadro de linderos y rumbos, nunca de una elevación o un corte (el ancho de la fachada no es el frente del lote). Léelo allí${c.escaneadas.size > 0 ? " con leer_zona" : ""} y di en detalle de qué vista sale, o no lo escribas.`;
  // C-CERO: en una lámina escaneada, un 0 en una medida solo si el elemento no existe. En Casco Antiguo r80 DeepSeek escribió
  // altura, entrepiso, acera y lado del patio = 0 «porque no imprime la cota»; Opus leyó 12.6 m de altura. Una medida que no se
  // encuentra no se escribe: el motor la deja en revisión.
  const escaneada = lamina ? c.escaneadas.has(lamina) : c.escaneadas.size > 0;
  if (escaneada && p.valor === 0 && (DATO_DE_MEDIDA.test(p.clave) || MEDIDA_ESCANEADA.test(p.clave)) && !NO_EXISTE.test(p.detalle ?? ""))
    return `${p.clave} = 0 dice que el elemento no existe (dilo en detalle: «no hay patio», «adosado al lindero», «sin rampa»). Si existe y no encontraste la cota, no la escribas con 0: léela con leer_zona en modo «cotas» donde debe estar (la elevación o el corte para alturas y entrepiso; la planta o la localización para retiros, acera y patio)${lamina ? ` (la lámina ${lamina} es escaneada)` : ""}, o no escribas el dato y queda para revisión.`;
  if (p.valor === false && p.confianza >= 0.85 && !(lamina ? c.ampliadas.has(lamina) : c.ampliadas.size > 0)) {
    // En una lámina escaneada el OCR de la hoja se salta texto chico: ampliar es leer la zona (leer_zona) o recorrerla (ver_zona).
    const como = lamina && c.escaneadas.has(lamina) ? "leer_zona o ver_zona: la lámina es escaneada y el OCR de la hoja entera se salta texto chico" : "ver_recorte a 150 ppp o más";
    return `Un «no» con confianza 0.85 o más exige ampliar antes la zona donde debería estar ${p.clave} (${como}${lamina ? ` en la lámina ${lamina}` : " en la lámina pertinente, y di cuál en pagina"}): una búsqueda de texto vacía no prueba que falte. Amplía y vuelve a escribirlo, o escríbelo con confianza 0.6 y el motivo.`;
  }
  // C-LECTURA: en una lámina escaneada, un número firme sale de leer_zona. El OCR de la hoja entera y los recortes (que
  // la API reduce a ~384 tokens) confunden dígitos: en Casco Antiguo r79 DeepSeek escribió el área 713.44 con 0.85 desde
  // el OCR de la hoja; leer_zona lee 733.14. Un cálculo hecho con datos ya escritos no se lee: no se controla.
  if (typeof p.valor === "number" && p.confianza >= 0.85 && p.metodo !== "calculo" && c.escaneadas.size > 0) {
    if (lamina && c.escaneadas.has(lamina) && !c.leidas.has(lamina))
      return `${p.clave} sale de la lámina ${lamina}, que es escaneada: antes de escribir un número con 0.85 o más léelo con leer_zona en la zona donde está (modo «cuadro» o «cotas»); el OCR de la hoja entera y los recortes confunden dígitos (3↔7, 1↔7). O escríbelo con 0.6 y el motivo.`;
    if (!lamina && c.leidas.size === 0)
      return `Di en pagina de qué lámina sale ${p.clave}: el plano tiene láminas escaneadas (${[...c.escaneadas].join(", ")}) y en ellas un número con 0.85 o más se confirma antes con leer_zona.`;
  }
  if (c.medir && typeof p.valor === "number" && DATO_DE_MEDIDA.test(p.clave) && !(lamina && c.escaneadas.has(lamina))) {
    const medido = lamina ? c.medidas.has(lamina) : c.medidas.size > 0;
    if (!medido && p.confianza < 0.85)
      return `${p.clave} con confianza menor de 0.85: antes mídelo con medir_dibujo sobre la zona${lamina ? ` de la lámina ${lamina}` : ""} (la planta para retiros, frente, fondo, acera, rampa y rotura de cordón; la elevación o el corte para alturas). Si la escala sale «comprobada», la medida va con 0.9.`;
    if (!medido && p.valor === 0 && !NO_EXISTE.test(p.detalle ?? ""))
      return `${p.clave} = 0 solo si el plano muestra que el elemento no existe (dilo en detalle: «no hay rampa», «podio adosado»…). Si no encontraste la cota, mídela con medir_dibujo${lamina ? ` en la lámina ${lamina}` : ""}; nunca escribas 0 porque no la encontraste.`;
  }
  return null;
}

const sinPdf = (archivo: string) => archivo.replace(/\.pdf$/i, "");

/**
 * PDF y caché de OCR del documento pedido: el plano (por defecto) o un complementario por su archivo (con o sin .pdf).
 * La caché de un complementario va aparte para no mezclar sus láminas con las del plano.
 */
function documentoPedido(ctx: ContextoHerramientas, documento: unknown): { pdf: string | null; cache: string; prefijo: string } | { error: string } {
  if (documento === undefined || documento === null || documento === "" || documento === "plano") return { pdf: ctx.pdf, cache: cacheOcr(ctx.dir), prefijo: "" };
  const pedido = sinPdf(String(documento));
  const doc = ctx.documentos?.find((d) => sinPdf(d.archivo) === pedido);
  if (!doc) return { error: `No hay documento «${pedido}». Documentos: plano${ctx.documentos?.length ? `, ${ctx.documentos.map((d) => sinPdf(d.archivo)).join(", ")}` : " (no hay complementarios)"}.` };
  return { pdf: doc.ruta, cache: join(/* turbopackIgnore: true */ cacheOcr(ctx.dir), pedido), prefijo: `Documento ${pedido} (${doc.nombre}). ` };
}

const fraccion = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : NaN);
/** Página 0 o negativa indexaría desde el final en PyMuPDF (la última lámina con el número equivocado): se rechaza antes de lanzar Python. */
const paginaValida = (p: unknown): p is number => typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= 999;

/** Tope de la salida de texto_pagina: una lámina vectorial densa llegaba a 120 000 caracteres (unos 40 000 tokens) que viajaban en cada llamada siguiente. */
export const LIMITE_TEXTO_PAGINA = 60_000;
/** Tope de líneas por lámina (antes 2500 palabras; ahora renglones, que llevan varias palabras cada uno). */
const MAX_LINEAS = 2500;

/** Corta un texto en el último salto de línea antes de `limite` y dice cuánto quedó fuera, para no dejar una línea a medias. */
export function recortarPorLineas(texto: string, limite: number, aviso: string): string {
  if (texto.length <= limite) return texto;
  const corte = texto.lastIndexOf("\n", limite);
  const parte = texto.slice(0, corte > 0 ? corte : limite);
  const fuera = texto.slice(parte.length).split("\n").filter(Boolean).length;
  return `${parte}\n…(recortado: ${fuera} líneas más; ${aviso})`;
}

/**
 * Texto de una lámina agrupado por renglón: «x y texto» con la posición del inicio del renglón. Antes era una entrada
 * JSON por palabra con sus coordenadas, y la lámina 1 sola pesaba 30 000 caracteres en Tocumen (15 000 por renglones);
 * la posición de cada palabra la da buscar_texto cuando hace falta. Las láminas escaneadas salen igual, desde el OCR.
 */
export async function textoPagina(ctx: ContextoHerramientas, pagina: number, documento?: unknown): Promise<ResultadoHerramienta> {
  const doc = documentoPedido(ctx, documento);
  if ("error" in doc) return { texto: doc.error };
  if (!doc.pdf) return { texto: "No hay PDF disponible." };
  if (!paginaValida(pagina)) return { texto: "Página inválida: usa un entero desde 1." };
  const codigo = [
    "import sys,pymupdf",
    PY_OCR,
    `d=pymupdf.open(sys.argv[1]); n=int(sys.argv[2]); p=d[n-1]; M=p.rotation_matrix; W,H=p.rect.width,p.rect.height`,
    // Renglones de PyMuPDF (bloque, línea): las palabras en su orden y la esquina superior izquierda del renglón, ya en la hoja girada.
    "R={}",
    "for w in p.get_text('words'):",
    "    a=pymupdf.Point(w[0],w[1])*M; b=pymupdf.Point(w[2],w[3])*M",
    "    r=R.setdefault((w[5],w[6]),[1.0,1.0,[]]); r[0]=min(r[0],min(a.x,b.x)/W); r[1]=min(r[1],min(a.y,b.y)/H); r[2].append((w[7],w[4]))",
    "ls=[(x,y,' '.join(t for _,t in sorted(ws))) for x,y,ws in R.values()]",
    "escaneada=not ls",
    // Lámina escaneada: líneas OCR (texto, x, y); posiciones aproximadas, en la hoja enderezada.
    "if escaneada: ls=[(l['x'], l['y'], l['t']) for l in ocr(d, n, sys.argv[3])]",
    // Orden de lectura: de arriba abajo y, en el mismo renglón, de izquierda a derecha.
    "ls.sort(key=lambda l:(round(l[1],3), l[0]))",
    `fuera=max(0,len(ls)-${MAX_LINEAS}); ls=ls[:${MAX_LINEAS}]`,
    "tipo='escaneada, OCR: lectura y posición aproximadas' if escaneada else 'vectorial'",
    "cab=f'Lámina {n} ({tipo}): {len(ls)} líneas' + (f', {fuera} más sin mostrar' if fuera else '') + '. Cada línea: x y texto (inicio del renglón en fracciones 0–1 de la hoja).'",
    "if escaneada and not ls: cab=f'Lámina {n}: escaneada y sin texto OCR; usa ver_recorte.'",
    "sys.stdout.reconfigure(encoding='utf-8')",
    "print(cab); print('\\n'.join(f'{x:.3f} {y:.3f} {t}' for x,y,t in ls))",
  ].join("\n");
  const salida = await python(["-c", codigo, doc.pdf, String(pagina), doc.cache], REPO, 10 * 60_000);
  // En Windows print() escribe \r\n: un carácter de más por renglón que no le sirve al modelo.
  return { texto: doc.prefijo + recortarPorLineas(salida.replace(/\r\n/g, "\n").trimEnd(), LIMITE_TEXTO_PAGINA, "usa buscar_texto o ver_recorte para el resto") };
}

/**
 * Coincidencias de una expresión regular en todas las láminas: lámina, palabra y posición, con `contexto` palabras alrededor
 * (misma línea). Evita cargar láminas enteras (texto_pagina llegaba a 30k tokens por lámina) y da un «no» con fundamento.
 */
export async function buscarTexto(ctx: ContextoHerramientas, p: { patron: string; contexto?: number; documento?: string }): Promise<ResultadoHerramienta> {
  const doc = documentoPedido(ctx, p.documento);
  if ("error" in doc) return { texto: doc.error };
  if (!doc.pdf) return { texto: "No hay PDF disponible." };
  if (typeof p.patron !== "string" || !p.patron.trim() || p.patron.length > 200) return { texto: "patron debe ser una expresión regular de hasta 200 caracteres." };
  const contexto = Math.min(6, Math.max(0, Math.round(p.contexto ?? 3)));
  const codigo = [
    "import json,re,sys,unicodedata,pymupdf",
    PY_OCR,
    // Solo se quitan las tildes (sin cambiar mayúsculas: `.upper()` sobre el patrón convertía \\b en \\B y \\s en \\S) y se
    // compara sin distinguir mayúsculas. Se busca sobre el texto de cada LÍNEA, no palabra por palabra: «TORRE DE LAVADO» debe coincidir.
    "def plano(s): return unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode()",
    "try: rx=re.compile(plano(sys.argv[2]), re.IGNORECASE)",
    "except re.error as e: print(json.dumps({'error': 'patron invalido: '+str(e)})); sys.exit(0)",
    "k=int(sys.argv[3]); cache=sys.argv[4]; d=pymupdf.open(sys.argv[1]); out=[]; total=0",
    "for i,pg in enumerate(d):",
    "    M=pg.rotation_matrix; W,H=pg.rect.width,pg.rect.height",
    "    ws=pg.get_text('words'); lineas={}",
    // Lámina escaneada: se busca en las líneas OCR (posición aproximada, en la hoja enderezada).
    "    if not ws:",
    "        for l in ocr(d, i+1, cache):",
    "            if not rx.search(plano(l['t'])): continue",
    "            total+=1",
    "            if len(out)<80: out.append({'lamina': i+1, 'palabra': l['t'][:80], 'contexto': l['t'][:160], 'x': l['x'], 'y': l['y'], 'ocr': True})",
    "        continue",
    // Se agrupa por BLOQUE (una nota de varias líneas es un bloque): «WS ES EL ESPACIO PARA LA TORRE DE / LAVADO» debe coincidir.
    "    for w in ws: lineas.setdefault(w[5],[]).append(w)",
    "    for clave in sorted(lineas):",
    "        linea=sorted(lineas[clave], key=lambda x: (x[6], x[7])); texto=' '.join(x[4] for x in linea)",
    "        m=rx.search(plano(texto))",
    "        if not m: continue",
    "        total+=1",
    "        if len(out)>=80: continue",
    // La palabra donde empieza la coincidencia da la posición; el contexto son k palabras a cada lado.
    "        pos=max(0, plano(texto)[:m.start()].count(' '))",
    "        w=linea[min(pos, len(linea)-1)]",
    "        ctx=' '.join(x[4] for x in linea[max(0,pos-k):pos+k+1])",
    "        a=pymupdf.Point(w[0],w[1])*M",
    "        out.append({'lamina': i+1, 'palabra': m.group(0)[:80], 'contexto': ctx[:160], 'x': round(a.x/W,3), 'y': round(a.y/H,3)})",
    "print(json.dumps({'patron': sys.argv[2], 'coincidencias': total, 'mostradas': out, 'laminas_escaneadas_con_ocr': [i+1 for i,pg in enumerate(d) if not pg.get_text('words')]}, ensure_ascii=False))",
  ].join("\n");
  const salida = await python(["-c", codigo, doc.pdf, p.patron, String(contexto), doc.cache], REPO, 10 * 60_000);
  return { texto: doc.prefijo + (salida.length > 40_000 ? `${salida.slice(0, 40_000)}…(recortado)` : salida) };
}

export async function verRecorte(ctx: ContextoHerramientas, p: { pagina: number; x0: number; y0: number; x1: number; y1: number; ppp?: number }): Promise<ResultadoHerramienta> {
  if (!ctx.pdf) return { texto: "No hay PDF disponible." };
  if (!paginaValida(p.pagina)) return { texto: "Página inválida: usa un entero desde 1." };
  const [x0, y0, x1, y1] = [p.x0, p.y0, p.x1, p.y1].map(fraccion);
  if ([x0, y0, x1, y1].some(Number.isNaN) || x1 <= x0 || y1 <= y0) return { texto: "Recorte inválido: usa fracciones 0–1 con x1 > x0 y y1 > y0." };
  const ppp = Math.min(PPP_MAX, Math.max(50, Math.round(p.ppp ?? 200)));
  const tmp = join(/* turbopackIgnore: true */ ctx.dir, "tmp");
  await mkdir(/* turbopackIgnore: true */ tmp, { recursive: true });
  const salida = join(/* turbopackIgnore: true */ tmp, `recorte-${Date.now()}.png`);
  const codigo = [
    "import sys,pymupdf",
    "d=pymupdf.open(sys.argv[1]); p=d[int(sys.argv[2])-1]; r=p.rect",
    "x0,y0,x1,y1,ppp,lado=map(float,sys.argv[3:9])",
    "clip=pymupdf.Rect(r.x0+r.width*x0, r.y0+r.height*y0, r.x0+r.width*x1, r.y0+r.height*y1)",
    "esc=ppp/72; mayor=max(clip.width,clip.height)*esc",
    "if mayor>lado: esc=esc*lado/mayor",
    "pix=p.get_pixmap(matrix=pymupdf.Matrix(esc,esc), clip=clip, colorspace='rgb'); pix.save(sys.argv[9])",
    "print(pix.width, pix.height)",
  ].join("\n");
  const dims = await python(["-c", codigo, ctx.pdf, String(p.pagina), String(x0), String(y0), String(x1), String(y1), String(ppp), String(LADO_MAX_PX), salida]);
  const png = await readFile(/* turbopackIgnore: true */ salida);
  if (ppp >= 150) ctx.controles?.ampliadas.add(p.pagina);
  return { texto: `Recorte de la lámina ${p.pagina} (${dims.trim()} px, ${ppp} ppp, zona ${x0},${y0}–${x1},${y1}).`, imagenBase64: png.toString("base64") };
}

/** Zona pedida en fracciones (sin coordenadas, la de por defecto); null si no es válida. */
function zonaPedida(p: { x0?: unknown; y0?: unknown; x1?: unknown; y1?: unknown }, porDefecto: number[] | null): number[] | null {
  const valores = [p.x0, p.y0, p.x1, p.y1];
  if (porDefecto && valores.every((v) => v === undefined || v === null)) return porDefecto;
  const [x0, y0, x1, y1] = valores.map(fraccion);
  return [x0, y0, x1, y1].some(Number.isNaN) || x1 <= x0 || y1 <= y0 ? null : [x0, y0, x1, y1];
}

/** Teselas de un mosaico de filas×filas sobre la zona, con solape, sin salirse de la zona. */
export function teselasDelMosaico(zona: number[], filas: number, solape = SOLAPE_MOSAICO): number[][] {
  const [x0, y0, x1, y1] = zona;
  const ancho = (x1 - x0) / filas;
  const alto = (y1 - y0) / filas;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const salida: number[][] = [];
  for (let f = 0; f < filas; f++)
    for (let c = 0; c < filas; c++)
      salida.push([r(Math.max(x0, x0 + c * ancho - solape)), r(Math.max(y0, y0 + f * alto - solape)), r(Math.min(x1, x0 + (c + 1) * ancho + solape)), r(Math.min(y1, y0 + (f + 1) * alto + solape))]);
  return salida;
}

/** Recortes que cuesta un ver_zona con estos argumentos (una tesela = un recorte del tope de la revisión). */
export const costoDeVerZona = (args: Record<string, unknown>): number => {
  const filas = Number(args.filas ?? 3);
  return (FILAS_MOSAICO as readonly number[]).includes(filas) ? filas * filas : 9;
};

/** ver_zona: todas las teselas del mosaico en una sola llamada a Python y una sola respuesta. */
export async function verZona(ctx: ContextoHerramientas, p: { pagina: number; x0?: number; y0?: number; x1?: number; y1?: number; filas?: number }): Promise<ResultadoHerramienta> {
  if (!ctx.pdf) return { texto: "No hay PDF disponible." };
  if (!paginaValida(p.pagina)) return { texto: "Página inválida: usa un entero desde 1." };
  const zona = zonaPedida(p, [0, 0, 1, 1]);
  if (!zona) return { texto: "Zona inválida: usa fracciones 0–1 con x1 > x0 y y1 > y0 (o ninguna, para la hoja entera)." };
  const filas = Number(p.filas ?? 3);
  if (!(FILAS_MOSAICO as readonly number[]).includes(filas)) return { texto: "filas debe ser 2 o 3." };
  const teselas = teselasDelMosaico(zona, filas);
  const tmp = join(/* turbopackIgnore: true */ ctx.dir, "tmp");
  await mkdir(/* turbopackIgnore: true */ tmp, { recursive: true });
  const base = join(/* turbopackIgnore: true */ tmp, `zona-${Date.now()}`);
  // El mismo render que ver_recorte (ppp y lado máximos), una tesela tras otra con el PDF abierto una sola vez.
  const codigo = [
    "import sys,json,pymupdf",
    "d=pymupdf.open(sys.argv[1]); p=d[int(sys.argv[2])-1]; r=p.rect; ppp,lado=float(sys.argv[3]),float(sys.argv[4]); base=sys.argv[5]",
    "out=[]",
    "for i,(x0,y0,x1,y1) in enumerate(json.loads(sys.argv[6])):",
    "    clip=pymupdf.Rect(r.x0+r.width*x0, r.y0+r.height*y0, r.x0+r.width*x1, r.y0+r.height*y1)",
    "    esc=ppp/72; mayor=max(clip.width,clip.height)*esc",
    "    if mayor>lado: esc=esc*lado/mayor",
    "    pix=p.get_pixmap(matrix=pymupdf.Matrix(esc,esc), clip=clip, colorspace='rgb'); ruta=f'{base}-{i}.png'; pix.save(ruta)",
    "    out.append({'ruta': ruta, 'w': pix.width, 'h': pix.height, 'ppp': round(esc*72)})",
    "print(json.dumps(out))",
  ].join("\n");
  const hechas = JSON.parse(await python(["-c", codigo, ctx.pdf, String(p.pagina), String(PPP_MAX), String(LADO_MAX_PX), base, JSON.stringify(teselas)])) as { ruta: string; w: number; h: number; ppp: number }[];
  const imagenes = await Promise.all(
    hechas.map(async (h, i) => {
      const [a, b, c, d] = teselas[i];
      return { etiqueta: `Tesela ${Math.floor(i / filas) + 1}.${(i % filas) + 1} de la lámina ${p.pagina}: zona ${a},${b}–${c},${d} (${h.w}×${h.h} px, ${h.ppp} ppp)`, base64: (await readFile(/* turbopackIgnore: true */ h.ruta)).toString("base64") };
    }),
  );
  // En una lámina escaneada, recorrerla con el mosaico cuenta como ampliarla (C-AUSENCIA); en una vectorial, solo a 150 ppp o más.
  if (ctx.controles?.escaneadas.has(p.pagina) || hechas.every((h) => h.ppp >= 150)) ctx.controles?.ampliadas.add(p.pagina);
  return {
    texto: `Mosaico ${filas}×${filas} de la lámina ${p.pagina}, zona ${zona.join(",")}: ${imagenes.length} teselas, cada una con su zona en la etiqueta. Para leer el texto de una tesela usa leer_zona con esa zona (o una parte); para verla más grande, ver_recorte.`,
    imagenes,
  };
}

/** leer_zona: OCR por zona (precheck/planos/ocr_zona.py) con la imagen preparada; texto con posición y confianza por palabra. */
export async function leerZona(ctx: ContextoHerramientas, p: { pagina: number; x0: number; y0: number; x1: number; y1: number; modo?: string; ppp?: number }): Promise<ResultadoHerramienta> {
  if (!ctx.pdf) return { texto: "No hay PDF disponible." };
  if (!paginaValida(p.pagina)) return { texto: "Página inválida: usa un entero desde 1." };
  const zona = zonaPedida(p, null);
  if (!zona) return { texto: "Zona inválida: usa fracciones 0–1 con x1 > x0 y y1 > y0." };
  const modo = ["texto", "cuadro", "cotas"].includes(String(p.modo ?? "texto")) ? String(p.modo ?? "texto") : "texto";
  const ppp = Math.min(400, Math.max(300, Math.round(Number(p.ppp) || 350)));
  const texto = await python(["-m", "precheck.planos.ocr_zona", ctx.pdf, String(p.pagina), zona.join(","), "--ppp", String(ppp), "--modo", modo], REPO, LIMITE_OCR_ZONA_MS);
  ctx.controles?.ampliadas.add(p.pagina);
  ctx.controles?.leidas.add(p.pagina);
  return { texto: recortarPorLineas(texto.replace(/\r\n/g, "\n").trimEnd(), LIMITE_TEXTO_PAGINA, "pide una zona más chica") };
}

export async function medirMembrete(ctx: ContextoHerramientas): Promise<ResultadoHerramienta> {
  return { texto: await python([join(/* turbopackIgnore: true */ REPO, "scripts", "medir_membrete.py"), ctx.dir]) };
}

export async function medirCurvas(ctx: ContextoHerramientas): Promise<ResultadoHerramienta> {
  if (!ctx.pdf) return { texto: "No hay PDF disponible." };
  return { texto: await python([join(/* turbopackIgnore: true */ REPO, "scripts", "medir_curvas.py"), ctx.pdf]) };
}

/** medir_retiro.py sobre la carpeta del PreCheck (regiones.json, extraccion.json) y el PDF para los rótulos de calle. */
export async function medirRetiro(ctx: ContextoHerramientas): Promise<ResultadoHerramienta> {
  return { texto: await python([join(/* turbopackIgnore: true */ REPO, "scripts", "medir_retiro.py"), ctx.dir, ...(ctx.pdf ? ["--pdf", ctx.pdf] : [])]) };
}

/** medir_dibujo.py sobre una zona de una lámina del plano; la caché de segmentos queda en <carpeta>/tmp/medir. */
export async function medirDibujo(ctx: ContextoHerramientas, p: { pagina: number; x0: number; y0: number; x1: number; y1: number; de?: unknown; a?: unknown }): Promise<ResultadoHerramienta> {
  if (!ctx.pdf) return { texto: "No hay PDF disponible." };
  if (!paginaValida(p.pagina)) return { texto: "Página inválida: usa un entero desde 1." };
  const [x0, y0, x1, y1] = [p.x0, p.y0, p.x1, p.y1].map(fraccion);
  if ([x0, y0, x1, y1].some(Number.isNaN) || x1 <= x0 || y1 <= y0) return { texto: "Zona inválida: usa fracciones 0–1 con x1 > x0 y y1 > y0." };
  const punto = (v: unknown) => (Array.isArray(v) && v.length === 2 && v.every((n) => !Number.isNaN(fraccion(n))) ? v.map(fraccion).join(",") : null);
  const de = punto(p.de);
  const a = punto(p.a);
  if ((p.de !== undefined || p.a !== undefined) && !(de && a)) return { texto: "de y a deben ser puntos [x, y] en fracciones 0–1, los dos." };
  const args = ["--pdf", ctx.pdf, "--pagina", String(p.pagina), "--zona", [x0, y0, x1, y1].join(","), "--carpeta", ctx.dir, ...(de && a ? ["--de", de, "--a", a] : [])];
  const texto = await python([join(/* turbopackIgnore: true */ REPO, "scripts", "medir_dibujo.py"), ...args]);
  ctx.controles?.medidas.add(p.pagina);
  return { texto };
}

const CLAVE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/**
 * Por qué el valor no tiene la forma que fija el contrato de datos (tipo y, con lista cerrada, uno de sus valores); null si
 * la tiene. La usan escribir_hecho y fijar_alcance (ADR-0019: en la ronda 80, «TERCER ORDEN» entró por el alcance).
 */
export function formaDelContrato(ctx: Pick<ContextoHerramientas, "tipos" | "listas">, clave: string, valor: unknown): string | null {
  // Un dato de medida lleva número. Las claves *_min_m / *_max_cm son medidas del proyecto que las reglas leen (p. ej.
  // proyecto.retiro_min_m): no se bloquean; que el valor sea el del plano y no el límite de la norma lo dice el prompt.
  if (/(_m|_m2|_pct|_cm|_mm|cantidad|\.estacionamientos|pisos_totales|unidades_vivienda)$/.test(clave) && typeof valor !== "number") return `${clave} necesita un número (metros, m², % o cantidad), no ${JSON.stringify(valor)}.`;
  // El contrato de datos fija el tipo: un sí/no no se escribe como texto ni un número como true (profesional.disciplina = true, estacionamientos_directos_calle = "sí").
  const tipo = ctx.tipos?.get(clave);
  if (tipo === "bool" && typeof valor !== "boolean") return `${clave} es un dato sí/no: escribe true o false, no ${JSON.stringify(valor)}.`;
  if (tipo === "texto" && typeof valor !== "string") return `${clave} es un texto (p. ej. "arquitectura"), no ${JSON.stringify(valor)}.`;
  if (tipo === "numero" && typeof valor !== "number") return `${clave} es un número según el contrato de datos, no ${JSON.stringify(valor)}.`;
  const lista = ctx.listas?.get(clave);
  if (lista && !lista.includes(valor as string))
    return `${clave} tiene que ser uno de: ${lista.map((v) => `"${v}"`).join(", ")}; escribiste ${JSON.stringify(valor)}. Las reglas comparan esa palabra sola: escríbela tal cual, sin otras palabras ni mayúsculas.`;
  return null;
}

export async function escribirHecho(ctx: ContextoHerramientas, p: { clave: string; valor: unknown; confianza: number; metodo: string; detalle: string; pagina?: number; documento?: unknown }): Promise<ResultadoHerramienta> {
  if (ctx.exigirAlcance && !ctx.alcanceFijado) return { texto: "Primero el paso 1: decide las reglas vigentes (norma, zona, datos de alcance, permisos) y llama a fijar_alcance (con {} si no hay nada que fijar). Después escribe los datos." };
  if (typeof p.clave !== "string" || !CLAVE.test(p.clave)) return { texto: "Clave inválida: usa la forma grupo.dato (p. ej. proyecto.altura_m)." };
  // Solo las claves que piden las reglas; los datos del usuario (zona, norma, trámite, expediente) nunca los escribe el modelo.
  // Un conjunto vacío ya no significa «cualquiera».
  if (DATOS_AJENOS_AL_PLANO.test(p.clave) || !ctx.clavesPermitidas.has(p.clave)) return { texto: `La clave ${p.clave} no está entre los datos pedidos; no se escribe.` };
  if (typeof p.confianza !== "number" || !Number.isFinite(p.confianza) || p.confianza < 0 || p.confianza > 1) return { texto: "confianza debe estar entre 0 y 1." };
  if (!["number", "string", "boolean"].includes(typeof p.valor) || (typeof p.valor === "number" && !Number.isFinite(p.valor))) return { texto: "valor debe ser número, texto o true/false." };
  const forma = formaDelContrato(ctx, p.clave, p.valor);
  if (forma) return { texto: forma };
  const control = controlDelContrato(ctx, p);
  if (control) return { texto: control };
  const ruta = join(/* turbopackIgnore: true */ ctx.dir, "lote.json");
  const lote = (await readFile(/* turbopackIgnore: true */ ruta, "utf8").then((t) => JSON.parse(t) as Record<string, unknown>, () => ({}))) as Record<string, unknown>;
  const partes = p.clave.split(".");
  let nodo: Record<string, unknown> = lote;
  for (const k of partes.slice(0, -1)) {
    if (typeof nodo[k] !== "object" || nodo[k] === null || "valor" in (nodo[k] as object)) nodo[k] = {};
    nodo = nodo[k] as Record<string, unknown>;
  }
  nodo[partes[partes.length - 1]] = {
    valor: p.valor,
    confianza: Math.round(p.confianza * 100) / 100,
    // El documento real: un dato leído en un complementario no es del plano (antes siempre decía original.pdf).
    fuente: { metodo: String(p.metodo || "vision").slice(0, 40), detalle: String(p.detalle || "").slice(0, 400), documento: documentoDelDato(ctx, p.documento), ...(paginaValida(p.pagina) ? { pagina: p.pagina } : {}) },
  };
  await writeFile(/* turbopackIgnore: true */ ruta, JSON.stringify(lote, null, 1));
  return { texto: `Escrito ${p.clave} = ${JSON.stringify(p.valor)} (confianza ${p.confianza}).` };
}

/** Nombre del documento de un dato: el complementario pedido (por su archivo) o el plano. */
function documentoDelDato(ctx: ContextoHerramientas, documento: unknown): string {
  if (documento === undefined || documento === null || documento === "" || documento === "plano") return "original.pdf";
  const doc = ctx.documentos?.find((d) => sinPdf(d.archivo) === sinPdf(String(documento)));
  return doc ? doc.archivo : "original.pdf";
}

/** Paso 1: escribe alcance_ia.json, reevalúa (el motor comprueba las citas y aplica el alcance) y devuelve el resumen. */
export async function fijarAlcance(ctx: ContextoHerramientas, p: Record<string, unknown>): Promise<ResultadoHerramienta> {
  const permitidos = new Set(["norma", "codigo_zona", "sf_sector", "sf_unidad_territorial", "datos_de_alcance", "permisos"]);
  const ajenos = Object.keys(p ?? {}).filter((k) => !permitidos.has(k));
  if (ajenos.length) return { texto: `Campos no válidos en el alcance: ${ajenos.join(", ")}. Usa norma, codigo_zona, sf_sector, sf_unidad_territorial, datos_de_alcance y permisos.` };
  // Los datos de alcance deciden qué reglas aplican: con la forma del contrato o no se fija nada (ADR-0019).
  const datos = p?.datos_de_alcance && typeof p.datos_de_alcance === "object" ? Object.entries(p.datos_de_alcance as Record<string, { valor?: unknown }>) : [];
  const errores = datos.map(([clave, d]) => formaDelContrato(ctx, clave, d?.valor)).filter((e): e is string => e !== null);
  if (errores.length) return { texto: `No se fijó el alcance; corrige estos datos de alcance y vuelve a llamar a fijar_alcance:\n- ${errores.join("\n- ")}` };
  await escribirAlcance(ctx.dir, p ?? {});
  ctx.alcanceFijado = true;
  if (!(await ctx.reevaluar())) return { texto: "El motor falló al reevaluar con este alcance; revisa la forma de cada campo." };
  await ctx.actualizarClaves?.();
  return { texto: (await resumenDelAlcance(ctx.dir)).texto };
}

export async function reevaluar(ctx: ContextoHerramientas): Promise<ResultadoHerramienta> {
  const ok = await ctx.reevaluar();
  if (!ok) return { texto: "El motor falló al reevaluar; revisa los datos escritos." };
  // Al escribir datos pueden volverse aplicables reglas nuevas que piden datos nuevos: se permiten también esos.
  await ctx.actualizarClaves?.();
  // datos_pedidos.py sale con código 1 cuando falta algún dato: execFile lo trata como error, pero el stdout trae el JSON.
  const salida = await python([join(/* turbopackIgnore: true */ REPO, "scripts", "datos_pedidos.py"), ctx.dir, "--json"]).catch((e: { stdout?: string }) => e?.stdout ?? "");
  const faltan = listaFaltantes(salida);
  const resultado = JSON.parse(await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ ctx.dir, "resultado.json"), "utf8")) as { resultados?: { regla_id?: string; resultado?: string; motivo?: string; titulo?: string }[]; avisos?: string[] };
  const pendientes = (resultado.resultados ?? []).filter((r) => r.resultado === "REQUIERE_REVISION").slice(0, 150).map((r) => ({ regla_id: r.regla_id, titulo: r.titulo, motivo: r.motivo?.slice(0, 160) }));
  const cuenta: Record<string, number> = {};
  for (const r of resultado.resultados ?? []) cuenta[r.resultado ?? "?"] = (cuenta[r.resultado ?? "?"] ?? 0) + 1;
  // Lo que el sistema calculó o marcó como dudoso (precheck/planos/sensatez.py): la IA debe volver a mirarlo.
  const datosDudosos = (resultado.avisos ?? []).filter((a) => a.startsWith("DATO_DUDOSO:") || a.startsWith("CALCULO:"));
  return { texto: JSON.stringify({ conteo_motor: cuenta, datos_dudosos: datosDudosos, datos_que_faltan: faltan, reglas_en_revision: pendientes }) };
}

/** La lista `faltan` del JSON de datos_pedidos.py; vacía si la salida no es JSON. */
export function listaFaltantes(salida: string): string[] {
  try {
    const f = (JSON.parse(salida) as { faltan?: unknown }).faltan;
    return Array.isArray(f) ? f.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Despacha una llamada del modelo a su herramienta; nunca lanza (el error vuelve como texto al modelo). */
export async function ejecutarHerramienta(ctx: ContextoHerramientas, nombre: string, args: Record<string, unknown>): Promise<ResultadoHerramienta> {
  try {
    switch (nombre) {
      case "texto_pagina":
        return await textoPagina(ctx, Number(args.pagina), args.documento);
      case "buscar_texto":
        return await buscarTexto(ctx, args as { patron: string; contexto?: number; documento?: string });
      case "ver_recorte":
        return await verRecorte(ctx, args as { pagina: number; x0: number; y0: number; x1: number; y1: number; ppp?: number });
      case "ver_zona":
        return await verZona(ctx, args as { pagina: number; x0?: number; y0?: number; x1?: number; y1?: number; filas?: number });
      case "leer_zona":
        return await leerZona(ctx, args as { pagina: number; x0: number; y0: number; x1: number; y1: number; modo?: string; ppp?: number });
      case "medir_membrete":
        return await medirMembrete(ctx);
      case "medir_curvas":
        return await medirCurvas(ctx);
      case "medir_retiro":
        return await medirRetiro(ctx);
      case "medir_dibujo":
        return await medirDibujo(ctx, args as { pagina: number; x0: number; y0: number; x1: number; y1: number; de?: unknown; a?: unknown });
      case "escribir_hecho":
        return await escribirHecho(ctx, args as { clave: string; valor: unknown; confianza: number; metodo: string; detalle: string; pagina?: number; documento?: unknown });
      case "reevaluar":
        return await reevaluar(ctx);
      case "fijar_alcance":
        return await fijarAlcance(ctx, args);
      default:
        return { texto: `Herramienta desconocida: ${nombre}.` };
    }
  } catch (e) {
    return { texto: `La herramienta ${nombre} falló: ${e instanceof Error ? e.message.slice(0, 300) : "error"}` };
  }
}
