import { leerNombrePrueba, NOMBRE_MODELO } from "@/lib/corridas-prueba";
import type { ComplianceResult, ComplianceStatus, PreCheck, Project } from "@/types";
import equivalencias from "./equivalencias-reglas.json";

/** Nombre legible del modelo de una corrida («Sin IA» si no tuvo revisión con IA). */
export const nombreModelo = (m: string | null) => (m ? (NOMBRE_MODELO[m] ?? m) : "Sin IA");

/** Una ejecución a comparar: un proyecto con su PreCheck y, si la hubo, el modelo de la revisión con IA. */
export interface Ejecucion {
  projectId: string;
  /** PreCheck de la corrida (para mostrar sus láminas). */
  precheckId?: string;
  nombre: string;
  modelo: string | null;
  iaTerminada: boolean;
  /** Cuándo se creó la prueba (ISO). */
  fecha?: string;
  /** Datos que piden las reglas que aplican al plano de esta corrida; sin esto se usa la lista fija DATOS_CLAVE. */
  pedidos?: string[];
  /** Lo que la corrida asumió para decidir (zona, sector, unidad territorial…): hecho → valor. */
  supuestos?: Record<string, { valor: string; etiqueta: string }>;
  /** Aviso de «revisión posiblemente superficial» que dejó la web al terminar la IA, si lo hubo. */
  aviso?: string;
  resultados: Pick<ComplianceResult, "ruleId" | "status" | "fueraDeCatalogo" | "faltaEnPlano">[];
  titulos: Record<string, string>;
  /** Datos con que decidió el motor en esa corrida (los que la IA escribió en lote.json más los de la extracción). */
  datos?: Record<string, DatoCorrida>;
}

/** Un dato escrito en una corrida: valor y, si se anotó, dónde y cómo lo leyó la IA. */
export interface DatoCorrida {
  valor: string;
  etiqueta?: string;
  confianza?: number;
  pagina?: number;
  metodo?: string;
  detalle?: string;
}

/** Lo que hace falta para armar una ejecución: lo que devuelve GET /api/prechecks/[id] o lo que lee el servidor. */
export interface PiezasEjecucion {
  projectId: string;
  precheckId?: string;
  nombre: string;
  /** Modelo para mostrar o comparar; si falta, el de la revisión con IA. */
  modelo?: string | null;
  fecha?: string;
  ia: { modelo?: string; status?: string; aviso?: string } | null;
  pedidos?: string[];
  project: Pick<Project, "expediente">;
  precheck: Pick<PreCheck, "results" | "rules">;
}

/**
 * Lo que se compara de un resultado. Solo cuentan las decisiones de la IA (ADR-0016): si el estado es la decisión de
 * respaldo del motor, se compara el estado del motor antes del respaldo («Requiere revisión»), como en las corridas
 * anteriores a ADR-0016. Así el respaldo no se cuenta como acuerdo entre corridas ni cambia las cifras de rondas viejas.
 */
export function resultadoComparable(x: Pick<ComplianceResult, "ruleId" | "status" | "fueraDeCatalogo" | "faltaEnPlano" | "dictamen" | "motorStatus">): Ejecucion["resultados"][number] {
  if (x.dictamen?.origen === "motor") return { ruleId: x.ruleId, status: x.motorStatus ?? "MANUAL_REVIEW", fueraDeCatalogo: x.fueraDeCatalogo, faltaEnPlano: undefined };
  return { ruleId: x.ruleId, status: x.status, fueraDeCatalogo: x.fueraDeCatalogo, faltaEnPlano: x.faltaEnPlano };
}

/** Ejecución comparable a partir del PreCheck traducido (la usan la página «Comparar modelos» y el cálculo de /rondas). */
export function ejecucionDe(p: PiezasEjecucion): Ejecucion {
  const e = p.project.expediente;
  return {
    projectId: p.projectId,
    precheckId: p.precheckId,
    nombre: p.nombre,
    modelo: p.modelo !== undefined ? p.modelo : (p.ia?.modelo ?? null),
    iaTerminada: p.ia?.status === "done",
    fecha: p.fecha,
    aviso: p.ia?.aviso,
    pedidos: p.pedidos,
    supuestos: Object.fromEntries((e?.dictamen?.supuestos ?? []).map((x) => [x.hecho, { valor: x.valor, etiqueta: x.etiqueta }])),
    datos: Object.fromEntries(
      // Un dato que el motor descartó (altura 0, texto fuera de lista: ADR-0019) queda sin valor: no es una lectura.
      [...(e?.lote ?? []), ...(e?.proyecto ?? []), ...(e?.otros ?? [])].filter((x) => x.valor !== "").map((x) => [
        x.clave,
        { valor: x.valor, etiqueta: x.etiqueta, confianza: x.confianza, pagina: x.pagina, metodo: x.metodo, detalle: x.detalle },
      ]),
    ),
    resultados: p.precheck.results.map(resultadoComparable),
    titulos: Object.fromEntries((p.precheck.rules ?? []).map((x) => [x.id, x.title])),
  };
}

/** Lo que dice la mayoría de las ejecuciones sobre una fila. */
export interface Consenso {
  /** Estado más frecuente; null si lo más frecuente es «no aparece». */
  estado: ComplianceStatus | null;
  /** Cuántas ejecuciones dicen eso, de cuántas. */
  coinciden: number;
  de: number;
  /** Al menos dos de cada tres ejecuciones coinciden: se puede dar por estable. */
  consistente: boolean;
}

export interface FilaComparacion {
  clave: string;
  titulo: string;
  fueraDeCatalogo: boolean;
  /** Estado por ejecución (mismo orden que `ejecuciones`); null si esa ejecución no lo tiene; NOT_APPLICABLE si lo decidió «no aplica». */
  estados: (ComplianceStatus | null)[];
  /** Cómo tituló cada ejecución esta fila (los hallazgos parecidos se unen aunque se llamen distinto). */
  titulosPorEjecucion: (string | null)[];
  /** Las ejecuciones no coinciden (alguna dice otra cosa o no lo tiene). */
  difiere: boolean;
  consenso: Consenso;
}

export const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const SIN_VALOR = new Set(["de", "del", "la", "las", "el", "los", "y", "o", "a", "al", "en", "por", "con", "sin", "no", "se", "su", "un", "una", "para", "que", "todos", "todas"]);

/** Raíces de las palabras con contenido de un título (5 letras: «láminas» y «lámina» coinciden). */
const raices = (titulo: string): Set<string> =>
  new Set(
    normalizar(titulo)
      .split(" ")
      .filter((w) => w.length > 2 && !SIN_VALOR.has(w))
      .map((w) => w.slice(0, 5)),
  );

const UMBRAL_PARECIDO = 0.6;

/** Cuánto se parecen dos títulos: palabras en común sobre las del título más corto (0 a 1). */
export function parecido(a: string, b: string): number {
  const ra = raices(a);
  const rb = raices(b);
  const menor = Math.min(ra.size, rb.size);
  if (menor < 2) return 0;
  let comunes = 0;
  for (const r of ra) if (rb.has(r)) comunes += 1;
  return comunes / menor;
}

/** Los hallazgos tipificados llevan un id fijo con letras (HALLAZGO-LAMINAS-FALTANTES) en vez de un número. */
export const esHallazgoTipificado = (ruleId: string): boolean => /^HALLAZGO-[A-Z]/.test(ruleId);

/**
 * Los hallazgos fuera del catálogo con número (HALLAZGO-1) cambian de una ejecución a otra: se emparejan por su título
 * normalizado o, si cada ejecución lo redactó distinto, por el más parecido (`parecido`). Los tipificados se emparejan
 * por su id y las reglas del catálogo, por el suyo.
 */
/**
 * Las reglas que son la misma regla repetida por unidad territorial (p. ej. «ZM7: altura máxima en pisos» en las 12 UT con
 * ZM7) comparten un id de grupo (`scripts/equivalencias_reglas.py`): así una corrida que asumió otra UT no las ve como
 * reglas distintas. Una regla sin grupo se queda con su id.
 */
export const claveDeRegla = (ruleId: string): string => (equivalencias as Record<string, string>)[ruleId] ?? ruleId;

/** Título de una regla de grupo sin «Sector UTn:» al principio (la misma regla vale para todas las UT del grupo). */
const tituloDeGrupo = (ruleId: string, titulo: string): string => {
  if (!(ruleId in equivalencias)) return titulo;
  const t = titulo.replace(/^[^:]*\bUT\s?\d+:\s*/i, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const claveDeFila = (r: Pick<ComplianceResult, "ruleId" | "fueraDeCatalogo">, titulo: string): string => {
  if (!r.fueraDeCatalogo) return `R:${claveDeRegla(r.ruleId)}`;
  return esHallazgoTipificado(r.ruleId) ? `T:${r.ruleId}` : `H:${normalizar(titulo)}`;
};

/** El estado más frecuente entre las ejecuciones (ante un empate gana el primero que aparece, que es el de la primera ejecución). */
export function consensoDe(estados: (ComplianceStatus | null)[]): Consenso {
  const cuenta = new Map<ComplianceStatus | null, number>();
  for (const e of estados) cuenta.set(e, (cuenta.get(e) ?? 0) + 1);
  let mejor: ComplianceStatus | null = estados[0] ?? null;
  let n = 0;
  for (const [estado, c] of cuenta) if (c > n) [mejor, n] = [estado, c];
  return { estado: mejor, coinciden: n, de: estados.length, consistente: estados.length > 0 && n / estados.length >= 2 / 3 };
}

/** «No aplica» no es una diferencia con «no aparece»: para diferir y para el consenso cuentan igual. */
export const efectivo = (e: ComplianceStatus | null): ComplianceStatus | null => (e === "NOT_APPLICABLE" ? null : e);

/**
 * Una fila por regla u hallazgo que alguna ejecución decidió. Las que todas dan por «no aplica» no aportan y se omiten;
 * si solo algunas lo dan así, la celda dice «No aplica» (no «no aparece»).
 */
export function compararEjecuciones(ejecuciones: Ejecucion[]): FilaComparacion[] {
  const filas = new Map<string, Omit<FilaComparacion, "difiere" | "consenso">>();
  ejecuciones.forEach((e, i) => {
    for (const r of e.resultados) {
      const tituloPropio = e.titulos[r.ruleId] ?? r.ruleId;
      const titulo = tituloDeGrupo(r.ruleId, tituloPropio);
      let clave = claveDeFila(r, titulo);
      // Un mismo hallazgo se redacta distinto en cada ejecución: si no hay título igual, se une al más parecido de las
      // filas de hallazgos donde esta ejecución todavía no tiene nada.
      if (clave.startsWith("H:") && !filas.has(clave)) {
        let mejor = UMBRAL_PARECIDO;
        for (const f of filas.values()) {
          if (!f.clave.startsWith("H:") || f.estados[i] !== null) continue;
          const p = parecido(f.titulo, titulo);
          if (p >= mejor) [mejor, clave] = [p, f.clave];
        }
      }
      // Dos resultados de la misma ejecución con la misma clave (p. ej. dos hallazgos con el mismo título) no se pisan:
      // el segundo va a una fila aparte.
      for (let n = 2; filas.get(clave)?.estados[i]; n += 1) clave = `${clave.replace(/#\d+$/, "")}#${n}`;
      const fila = filas.get(clave) ?? { clave, titulo, fueraDeCatalogo: Boolean(r.fueraDeCatalogo), estados: ejecuciones.map(() => null), titulosPorEjecucion: ejecuciones.map(() => null) };
      fila.estados[i] = r.status;
      fila.titulosPorEjecucion[i] = tituloPropio;
      filas.set(clave, fila);
    }
  });
  return [...filas.values()]
    .filter((f) => f.estados.some((e) => efectivo(e) !== null))
    .map((f) => ({ ...f, difiere: new Set(f.estados.map(efectivo)).size > 1, consenso: consensoDe(f.estados.map(efectivo)) }))
    // Primero las filas en las que todas coinciden (lo estable), después las que difieren; en cada grupo, el catálogo antes que los hallazgos.
    .sort((a, b) => Number(a.difiere) - Number(b.difiere) || Number(a.fueraDeCatalogo) - Number(b.fueraDeCatalogo) || a.titulo.localeCompare(b.titulo, "es"));
}

export interface Estabilidad {
  /** Hallazgos fuera del catálogo: de los que propone alguna corrida, qué parte coincide entre pares de corridas (0 a 1). */
  solapamientoHallazgos: number | null;
  /** Reglas del catálogo que decidieron ambas corridas de un par: en qué parte dicen lo mismo (0 a 1). */
  acuerdoCatalogo: number | null;
  /** Cuántos pares de corridas se compararon. */
  pares: number;
}

/**
 * Estabilidad del plano: promedio sobre los pares de corridas (necesita al menos dos). `par` elige qué pares cuentan
 * (por índice en `ejecuciones`): por ejemplo, solo las repeticiones del mismo modelo o solo corridas de modelos distintos.
 */
export function estabilidadDe(ejecuciones: Ejecucion[], filas: FilaComparacion[], par: (i: number, j: number) => boolean = () => true): Estabilidad {
  const sol: number[] = [];
  const acu: number[] = [];
  let pares = 0;
  for (let i = 0; i < ejecuciones.length; i += 1) {
    for (let j = i + 1; j < ejecuciones.length; j += 1) {
      if (!par(i, j)) continue;
      pares += 1;
      const decide = (f: FilaComparacion, k: number) => efectivo(f.estados[k]);
      const h = filas.filter((f) => f.fueraDeCatalogo && (decide(f, i) || decide(f, j)));
      if (h.length) sol.push(h.filter((f) => decide(f, i) && decide(f, j)).length / h.length);
      const c = filas.filter((f) => !f.fueraDeCatalogo && decide(f, i) && decide(f, j));
      if (c.length) acu.push(c.filter((f) => decide(f, i) === decide(f, j)).length / c.length);
    }
  }
  const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  return { solapamientoHallazgos: media(sol), acuerdoCatalogo: media(acu), pares };
}

/** Los datos que toda revisión completa debería haber escrito (los que piden las reglas de retiros, densidad, ocupación y alturas). */
export const DATOS_CLAVE = [
  "lote.area_m2", "lote.frente_m", "lote.finca", "proyecto.pisos_totales", "proyecto.altura_m", "proyecto.unidades_vivienda",
  "proyecto.densidad_pers_ha", "proyecto.ocupacion_pct", "proyecto.area_libre_pct", "proyecto.retiro_frontal_m",
  "proyecto.retiro_lateral_m", "proyecto.retiro_posterior_m", "proyecto.estacionamientos",
] as const;

/** Cuántos de los datos que piden las reglas de su plano escribió la corrida (con la lista fija si no se conoce la del plano). */
export function datosEscritos(e: Pick<Ejecucion, "datos" | "pedidos">): { n: number; total: number } {
  const claves: readonly string[] = e.pedidos?.length ? e.pedidos : DATOS_CLAVE;
  return { n: claves.filter((k) => e.datos?.[k]).length, total: claves.length };
}

export interface FilaDato {
  clave: string;
  etiqueta: string;
  /** Valor por ejecución (mismo orden que `ejecuciones`); null si esa corrida no lo escribió. */
  valores: (string | null)[];
  /** Cuántas corridas lo escribieron. */
  escritas: number;
  /** Para datos numéricos con al menos dos valores: mínimo y máximo. */
  rango: { min: number; max: number } | null;
  /** El rango es amplio: más del 10 % de la mediana (la medida cambia de una corrida a otra). */
  amplio: boolean;
  /** Dato no numérico (sí/no, texto) en el que las corridas que lo escribieron no dicen lo mismo. */
  distintos: boolean;
}

const aNumero = (v: string): number | null => {
  const n = Number.parseFloat(v.replace(/,/g, ""));
  return Number.isFinite(n) && /^-?[\d.,]+/.test(v.trim()) ? n : null;
};

/** Tabla de datos medidos: una fila por dato clave (aunque ninguna corrida lo haya escrito) y por cualquier otro que alguna escribió. */
export function tablaDeDatos(ejecuciones: Ejecucion[]): FilaDato[] {
  // Filas: los datos que pidieron las reglas de alguna corrida (o la lista fija si no se conocen) y cualquier otro que alguna escribió.
  const pedidos = [...new Set(ejecuciones.flatMap((e) => (e.pedidos?.length ? e.pedidos : [])))];
  const base: string[] = pedidos.length ? pedidos : [...DATOS_CLAVE];
  const extra = [...new Set(ejecuciones.flatMap((e) => Object.keys(e.datos ?? {})))].filter((k) => !base.includes(k)).sort();
  return [...base, ...extra].map((clave) => {
    const valores = ejecuciones.map((e) => e.datos?.[clave]?.valor ?? null);
    const etiqueta = ejecuciones.map((e) => e.datos?.[clave]?.etiqueta).find(Boolean) ?? clave;
    const numeros = valores.map((v) => (v === null ? null : aNumero(v))).filter((n): n is number => n !== null);
    const rango = numeros.length >= 2 ? { min: Math.min(...numeros), max: Math.max(...numeros) } : null;
    const mediana = numeros.length ? [...numeros].sort((a, b) => a - b)[Math.floor(numeros.length / 2)] : 0;
    const amplio = Boolean(rango && rango.max !== rango.min && (mediana === 0 || (rango.max - rango.min) / Math.abs(mediana) > 0.1));
    const escritos = valores.filter((v): v is string => v !== null);
    const distintos = numeros.length < escritos.length && new Set(escritos.map((v) => v.trim().toLowerCase())).size > 1;
    return { clave, etiqueta, valores, escritas: escritos.length, rango, amplio, distintos };
  });
}

export function contarEstados(e: Ejecucion): Record<"PASS" | "FAIL" | "WARNING" | "MANUAL_REVIEW", number> {
  const c = { PASS: 0, FAIL: 0, WARNING: 0, MANUAL_REVIEW: 0 };
  // La misma regla repetida por unidad territorial cuenta una sola vez (con su estado más grave), no una por unidad.
  const gravedad = ["PASS", "WARNING", "MANUAL_REVIEW", "FAIL"];
  const porRegla = new Map<string, string>();
  for (const r of e.resultados) {
    if (!(r.status in c)) continue;
    const k = claveDeRegla(r.ruleId);
    const previo = porRegla.get(k);
    if (previo === undefined || gravedad.indexOf(r.status) > gravedad.indexOf(previo)) porRegla.set(k, r.status);
  }
  for (const s of porRegla.values()) c[s as keyof typeof c] += 1;
  return c;
}

/** De los «no cumple» (una vez por regla), cuántos son de contenido del plano: se subsanan completando el plano. */
export function contarFaltasEnPlano(e: Ejecucion): number {
  return new Set(e.resultados.filter((r) => r.status === "FAIL" && r.faltaEnPlano).map((r) => claveDeRegla(r.ruleId))).size;
}

/**
 * El plano al que pertenece un proyecto de prueba: el del nombre de la corrida («Casco Antiguo - prueba 2 con Opus 5.5»)
 * o, si no sigue ese formato, lo que va antes del primer « - ».
 */
export const planoDe = (nombre: string): string =>
  leerNombrePrueba(nombre)?.plano ?? (nombre.includes(" - ") ? nombre.split(" - ")[0].trim() : nombre.trim());

export interface ResumenModelo {
  modelo: string | null;
  corridas: number;
  /** Mínimo y máximo de cada estado entre las corridas de este modelo. */
  rango: Record<"PASS" | "FAIL" | "WARNING" | "MANUAL_REVIEW", [number, number]>;
  /** Mínimo y máximo de los «no cumple» que son contenido que falta en el plano (ADR-0014). */
  faltasEnPlano: [number, number];
  /** De 0 a 1: en cuántas filas cada corrida de este modelo dice lo mismo que la mayoría (todas las ejecuciones), en promedio. */
  acuerdo: number;
}

/** Totales y estabilidad por modelo: cuánto varía un modelo entre sus corridas y cuánto coincide con la mayoría. */
export function resumenPorModelo(ejecuciones: Ejecucion[], filas: FilaComparacion[]): ResumenModelo[] {
  const modelos = [...new Set(ejecuciones.map((e) => e.modelo))];
  return modelos.map((modelo) => {
    const indices = ejecuciones.flatMap((e, i) => (e.modelo === modelo ? [i] : []));
    const conteos = indices.map((i) => contarEstados(ejecuciones[i]));
    const rango = (k: keyof ReturnType<typeof contarEstados>): [number, number] => [Math.min(...conteos.map((c) => c[k])), Math.max(...conteos.map((c) => c[k]))];
    // Como en el consenso, «no aplica» cuenta igual que «no aparece».
    const acuerdos = indices.map((i) => (filas.length ? filas.filter((f) => efectivo(f.estados[i]) === f.consenso.estado).length / filas.length : 1));
    const faltas = indices.map((i) => contarFaltasEnPlano(ejecuciones[i]));
    return {
      modelo,
      corridas: indices.length,
      rango: { PASS: rango("PASS"), FAIL: rango("FAIL"), WARNING: rango("WARNING"), MANUAL_REVIEW: rango("MANUAL_REVIEW") },
      faltasEnPlano: [Math.min(...faltas), Math.max(...faltas)],
      acuerdo: acuerdos.reduce((a, b) => a + b, 0) / (acuerdos.length || 1),
    };
  });
}

export interface FilaSupuesto {
  hecho: string;
  etiqueta: string;
  /** Valor asumido por ejecución (mismo orden que `ejecuciones`); null si esa corrida no lo asumió. */
  valores: (string | null)[];
  /** Las corridas no asumieron lo mismo (alguna dice otro valor o no lo asumió). */
  difiere: boolean;
}

/**
 * Valor de un supuesto en una corrida: el que usó el motor para ese dato, si la corrida lo tiene; si no, el que anotó la
 * IA, con «true»/«false» como «sí»/«no». La IA anota el supuesto como texto libre: DeepSeek escribía «false» donde Claude
 * escribía false y la tabla marcaba un desacuerdo que el motor no vio (ADR-0019).
 */
function valorDeSupuesto(e: Ejecucion, hecho: string): string | null {
  if (!e.supuestos?.[hecho]) return null;
  const delMotor = e.datos?.[hecho]?.valor;
  if (delMotor) return delMotor;
  const anotado = e.supuestos[hecho].valor;
  const t = anotado.trim().toLowerCase();
  return t === "true" ? "sí" : t === "false" ? "no" : anotado;
}

/** Lo que cada corrida asumió para decidir; resalta lo que no coincide (p. ej. la unidad territorial en San Francisco). */
export function tablaDeSupuestos(ejecuciones: Ejecucion[]): FilaSupuesto[] {
  const hechos = [...new Set(ejecuciones.flatMap((e) => Object.keys(e.supuestos ?? {})))];
  return hechos
    .map((hecho) => {
      const valores = ejecuciones.map((e) => valorDeSupuesto(e, hecho));
      const etiqueta = ejecuciones.map((e) => e.supuestos?.[hecho]?.etiqueta).find(Boolean) ?? hecho;
      // Solo difiere si dos corridas dieron valores distintos (sin contar mayúsculas ni tildes); que una calle el dato no es un desacuerdo.
      return { hecho, etiqueta, valores, difiere: new Set(valores.filter((v): v is string => v !== null).map(normalizar)).size > 1 };
    })
    .sort((a, b) => Number(b.difiere) - Number(a.difiere) || a.hecho.localeCompare(b.hecho));
}

/** La conclusión que escribió la IA, con los estados del motor en palabras («NO_CUMPLE» → «no cumple»). */
export const conclusionLegible = (texto: string): string =>
  texto
    .replace(/\bINFORMACION_REQUERIDA\b/g, "falta información")
    .replace(/\bNO_CUMPLE\b/g, "no cumple")
    .replace(/\bREQUIERE_REVISION\b/g, "requiere revisión")
    .replace(/\bNO_APLICA\b/g, "no aplica")
    .replace(/\bOBSERVACION\b/g, "observación");
