import { categoriaDeRegla } from "@/lib/categoria-regla";
import type { ComplianceRule, RuleOperator, RuleState } from "@/types";

/**
 * Traduce las reglas del catálogo real (reglas/*.json del motor) al tipo ComplianceRule de la web. Función pura.
 *
 * El catálogo tiene varias formas (cuantitativa con condición simple, rangos, criterio sin condición, documental,
 * plazo). Nada se inventa: el operador y el valor solo se deducen de una condición simple «dato op número»; si no,
 * la condición se muestra literal. Una regla que no se pueda leer igual aparece, con lo que se pueda.
 */

export interface Norma {
  codigo: string;
  nombre: string;
  prefijos: string[];
}

/** Nombres cortos para el filtro por norma (etiquetas de interfaz, no valores normativos). */
const ETIQUETAS: Record<string, string> = {
  "A110-2025": "Acuerdo 110",
  "PLOT-A61-2021": "PLOT",
  "PLOT-A61-2021+A270-2025": "San Francisco",
  "MIVIOT-CA-R127-2003": "Casco Antiguo",
  "MIVIOT-PV-R352-2006": "Panamá Viejo",
  "LEY21-1997": "Ley 21 (Área del Canal)",
  "MIVIOT-AC-R160-2002": "Área del Canal (Res. 160-2002)",
  "MIVIOT-CDE": "Costa del Este",
  "MIVIOT-ML1": "Metro Línea 1",
  "MIVIOT-ML2": "Metro Línea 2",
  "MIVIOT-LC-R15-1992": "La Cresta",
  "MIVIOT-EC-R192-2013": "El Carmen",
};

/** normas.json ({código: {nombre, prefijos}}) → lista. Lo que no tenga la forma esperada se ignora. */
export function leerNormas(json: unknown): Norma[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  return Object.entries(json as Record<string, unknown>).flatMap(([codigo, v]) => {
    const o = (v ?? {}) as { nombre?: unknown; prefijos?: unknown };
    const prefijos = Array.isArray(o.prefijos) ? o.prefijos.filter((p): p is string => typeof p === "string" && p.length > 0) : [];
    return [{ codigo, nombre: typeof o.nombre === "string" ? o.nombre : codigo, prefijos }];
  });
}

/** Norma de una regla por el prefijo de su id (gana el prefijo más largo). */
export function normaDeId(id: string, normas: Norma[]): { codigo: string; etiqueta: string } {
  let mejor: { norma: Norma; prefijo: string } | null = null;
  for (const norma of normas) for (const prefijo of norma.prefijos) if (id.startsWith(prefijo) && (!mejor || prefijo.length > mejor.prefijo.length)) mejor = { norma, prefijo };
  if (mejor) return { codigo: mejor.norma.codigo, etiqueta: ETIQUETAS[mejor.norma.codigo] ?? mejor.norma.nombre.split(",")[0] };
  const prefijo = /^[A-Z0-9]+/.exec(id)?.[0] ?? "Otra";
  return { codigo: prefijo, etiqueta: `Otra norma (${prefijo})` };
}

/** Zona de la regla a partir de «aplica_si»: el primer código de «lote.codigo_zona in [...]» o «== '...'». */
export function zonaDeAplicaSi(aplicaSi: string | null | undefined): string | null {
  if (!aplicaSi) return null;
  const lista = /lote\.codigo_zona\s+in\s*\[([^\]]*)\]/.exec(aplicaSi);
  if (lista) {
    const primero = /['"]([^'"]+)['"]/.exec(lista[1]);
    return primero ? primero[1] : null;
  }
  const igual = /lote\.codigo_zona\s*==\s*['"]([^'"]+)['"]/.exec(aplicaSi);
  return igual ? igual[1] : null;
}

/** Operador y valor de una condición simple «dato <= 12.5». Las estrictas (<, >) y compuestas quedan como condición literal. */
export function operadorDeCondicion(condicion: string | null | undefined): { operator: RuleOperator; value: number | null } {
  const m = condicion ? /^\s*[\w.]+\s*(<=|>=|==)\s*(-?\d+(?:\.\d+)?)\s*$/.exec(condicion) : null;
  if (!m) return { operator: "criterio", value: null };
  return { operator: m[1] === "==" ? "=" : (m[1] as RuleOperator), value: Number(m[2]) };
}

const ESTADOS: RuleState[] = ["borrador", "aprobada", "rechazada", "retirada", "suspendida"];
const texto = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const numero = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * Una regla del catálogo. `archivo` y `posicion` identifican la regla si no trae id. El estado desconocido queda en
 * «borrador» (nunca se da por aprobada una regla que no lo diga).
 */
export function traducirRegla(bruta: unknown, normas: Norma[], archivo: string, posicion: number): ComplianceRule {
  const r = (bruta && typeof bruta === "object" && !Array.isArray(bruta) ? bruta : {}) as Record<string, unknown>;
  const legible = Object.keys(r).length > 0;
  const id = texto(r.id) ?? `SIN-ID-${archivo.replace(/\.json$/, "")}-${posicion + 1}`;
  const fuente = (r.fuente && typeof r.fuente === "object" ? r.fuente : {}) as Record<string, unknown>;
  const titulo = texto(r.titulo) ?? (legible ? id : `Regla ilegible en ${archivo} (posición ${posicion + 1})`);
  const condicion = texto(r.condicion);
  const aplicaSi = texto(r.aplica_si);
  const { operator, value } = operadorDeCondicion(condicion);
  const { codigo, etiqueta } = normaDeId(id, normas);
  const estado = texto(r.estado_revision);
  const vigencia = (r.vigencia && typeof r.vigencia === "object" ? r.vigencia : {}) as Record<string, unknown>;
  const pagina = numero(fuente.pagina_pdf);
  return {
    id,
    version: numero(r.version) ?? 1,
    title: titulo,
    category: categoriaDeRegla(id, titulo),
    zoning: zonaDeAplicaSi(aplicaSi),
    description: texto(r.mensaje_no_cumple) ?? titulo,
    operator,
    value,
    unit: texto(r.unidad) ?? null,
    regulation: {
      id,
      norma: texto(fuente.norma) ?? "Norma no indicada",
      article: texto(fuente.articulo) ?? "—",
      quote: texto(fuente.cita_textual) ?? "",
      ...(pagina !== undefined ? { sourcePage: pagina } : {}),
    },
    state: estado && (ESTADOS as string[]).includes(estado) ? (estado as RuleState) : "borrador",
    severity: r.severidad === "observacion" ? "observacion" : "bloqueante",
    normaCode: codigo,
    normaLabel: etiqueta,
    ...(texto(r.tipo) ? { kind: texto(r.tipo) } : {}),
    ...(condicion ? { condition: condicion } : {}),
    ...(aplicaSi ? { appliesIf: aplicaSi } : {}),
    ...(texto(r.nota) ? { note: texto(r.nota) } : legible ? {} : { note: "La regla no tiene la forma esperada en el catálogo; revise el archivo." }),
    validFrom: texto(vigencia.desde) ?? null,
    validTo: texto(vigencia.hasta) ?? null,
  };
}

/** Un archivo del catálogo (lista de reglas). Si no es una lista, no aporta reglas. */
export function traducirArchivo(json: unknown, normas: Norma[], archivo: string): ComplianceRule[] {
  if (!Array.isArray(json)) return [];
  return json.map((r, i) => traducirRegla(r, normas, archivo, i));
}
