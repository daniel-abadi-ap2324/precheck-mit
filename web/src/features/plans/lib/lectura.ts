import { UMBRAL_COMPROBADO } from "@/lib/barrera-precheck";
import type { PlanExtraction, PlanFact } from "@/types";
import { formatNumber } from "@/lib/format";
import { normalizar } from "@/features/gis/lib/buscar-lugares";

/** Nombres legibles de los requisitos del Anexo IV que el lector reconoce por texto. */
export const REQUISITOS: Record<string, string> = {
  cuadro_de_areas: "Cuadro de áreas",
  localizacion_regional: "Localización regional",
  propietario: "Datos del propietario",
  profesional_responsable: "Profesional responsable",
  fecha: "Fecha",
  numero_de_hoja: "Número de lámina",
  escala: "Escala",
};

const ETIQUETA: Record<string, string> = {
  "lote.area_m2": "Área del lote",
  "lote.finca": "Finca",
  "lote.fincas": "Fincas",
  "lote.cantidad_fincas": "Cantidad de fincas",
  "proyecto.ocupacion_pct": "Ocupación",
  "lote.corregimiento": "Corregimiento",
  "plano.zonificacion_declarada": "Zonificación declarada",
  "proyecto.pisos_totales": "Pisos",
  "lote.frente_m": "Frente del lote",
  "lote.area_geometrica_m2": "Área del lote medida en el dibujo",
  "proyecto.unidades_vivienda": "Unidades de vivienda",
  "proyecto.densidad_pers_ha": "Densidad",
};

/** Unidad de los datos numéricos (skill mupa-medicion-planos). */
const UNIDAD: Record<string, string> = {
  "lote.area_m2": "m²",
  "lote.area_geometrica_m2": "m²",
  "lote.frente_m": "m",
  "proyecto.densidad_pers_ha": "pers/ha",
};

const METODO = { pdf_texto: "Texto del PDF", ocr: "OCR (lámina escaneada)", pdf_geometria: "Geometría del PDF", humano: "Corregido por el usuario" } as const;

/** «Texto del PDF · página 1 · confianza 99 %». */
export function describirFuente(h: PlanFact): string | null {
  if (h.agregado) return "Agregado por el usuario";
  if (h.corregido) return h.valorOriginal == null ? "Corregido por el usuario · el lector no lo había leído con certeza" : `Corregido por el usuario · el lector había leído ${h.valorOriginal}`;
  if (h.confirmado) return h.fuente?.pagina ? `Confirmado por el usuario · leído en la página ${h.fuente.pagina}` : "Confirmado por el usuario";
  if (!h.fuente) return null;
  return `${METODO[h.fuente.metodo]} · página ${h.fuente.pagina} · confianza ${Math.round(h.confianza * 100)} %`;
}

/** Revisión de la persona (paso 1): sin revisar, confirmado tal como se leyó o corregido (o agregado). */
/** «comprobado»: la lectura lo dio claro (confianza >= 0.85) y no hace falta que la persona lo confirme. */
export type RevisionHecho = "pendiente" | "comprobado" | "confirmado" | "corregido";

export interface FilaHecho {
  hecho: string;
  etiqueta: string;
  valor: string;
  estado: PlanFact["estado"];
  fuente: string | null;
  nota?: string;
  revision: RevisionHecho;
  /** Se puede confirmar sin cambiarlo: el lector lo leyó con un solo valor y nadie lo revisó todavía. */
  confirmable: boolean;
}

export const revisionDe = (h: PlanFact): RevisionHecho =>
  h.corregido ? "corregido" : h.confirmado ? "confirmado" : h.estado === "ok" && h.valor !== null && h.confianza >= UMBRAL_COMPROBADO ? "comprobado" : "pendiente";

const conUnidad = (hecho: string, v: string | number) =>
  typeof v === "number" ? (UNIDAD[hecho] ? `${formatNumber(v)} ${UNIDAD[hecho]}` : formatNumber(v)) : v;

function valorLegible(h: PlanFact): string {
  if (h.estado === "no_encontrado") return "No se encontró en el plano";
  if (h.estado === "revision" && h.candidatos?.length) {
    // Medidas: «16 o 15» (la lectura principal primero). Identificadores (fincas): «Varias: …».
    if (h.candidatos.every((c) => typeof c === "number")) return h.candidatos.map((c) => conUnidad(h.hecho, c)).join(" o ");
    return `Varias: ${h.candidatos.join(", ")}`;
  }
  if (h.valor === null) return "Requiere revisión";
  return conUnidad(h.hecho, h.valor);
}

/** Datos leídos del plano, listos para mostrar (en el orden en que los trae la extracción). */
export function filasDeHechos(ext: PlanExtraction): FilaHecho[] {
  return ext.hechos.map((h) => ({
    hecho: h.hecho,
    etiqueta: ETIQUETA[h.hecho] ?? h.hecho,
    valor: valorLegible(h),
    estado: h.estado,
    fuente: describirFuente(h),
    nota: h.colindantes?.length ? `Colindantes mencionadas: ${h.colindantes.join(", ")}` : h.nota,
    revision: revisionDe(h),
    confirmable: revisionDe(h) === "pendiente" && h.estado === "ok" && h.valor !== null,
  }));
}

/** «3 láminas · 1 con texto del PDF · 2 escaneadas (OCR)». */
export function resumenPaginas(ext: PlanExtraction): string {
  const n = ext.paginas.length;
  const vect = ext.paginas.filter((p) => p.tipo === "vectorial").length;
  const esc = n - vect;
  const laminas = `${n} ${n === 1 ? "lámina" : "láminas"}`;
  if (esc === 0) return `${laminas} · con texto del PDF`;
  if (vect === 0) return `${laminas} · escaneadas (OCR)`;
  return `${laminas} · ${vect} con texto del PDF · ${esc} ${esc === 1 ? "escaneada" : "escaneadas"} (OCR)`;
}

export interface Contraste {
  dato: string;
  plano: string | null;
  expediente: string | null;
  /** true / false; null si falta uno de los dos (no se da por bueno ni por malo). */
  coincide: boolean | null;
}

/** «1RM-2» (rótulo con prefijo de clase de suelo) y «RM-2» (ficha) son la misma zona. */
const zonaComparable = (z: string) => normalizar(z).replace(/^\d/, "").replace(/[\s-]/g, "");
/** La misma tolerancia de la regla A110-AIV-AREA-LOTE: diferencia ≤ 1 % del área de referencia. */
const TOLERANCIA_AREA = 0.01;

/** Contrasta lo leído del plano con los datos del expediente (lote y proyecto). Es información para el revisor. */
export function contrastar(ext: PlanExtraction, exp: { corregimiento?: string | null; zona?: string | null; areaM2?: number | null }): Contraste[] {
  const valor = (hecho: string) => {
    const h = ext.hechos.find((x) => x.hecho === hecho);
    return h?.estado === "ok" && h.valor !== null ? h.valor : null;
  };
  const corr = valor("lote.corregimiento") as string | null;
  const area = valor("lote.area_m2") as number | null;
  const zona = valor("plano.zonificacion_declarada") as string | null;
  const ambos = <T,>(a: T | null | undefined, b: T | null | undefined, igual: (a: T, b: T) => boolean) => (a == null || b == null ? null : igual(a, b));
  return [
    { dato: "Corregimiento", plano: corr, expediente: exp.corregimiento ?? null, coincide: ambos(corr, exp.corregimiento, (a, b) => normalizar(a) === normalizar(b)) },
    {
      dato: "Área del lote",
      plano: area == null ? null : `${formatNumber(area)} m²`,
      expediente: exp.areaM2 == null ? null : `${formatNumber(exp.areaM2)} m²`,
      coincide: ambos(area, exp.areaM2, (a, b) => Math.abs(a - b) <= TOLERANCIA_AREA * b),
    },
    { dato: "Zona", plano: zona, expediente: exp.zona ?? null, coincide: ambos(zona, exp.zona, (a, b) => zonaComparable(a) === zonaComparable(b)) },
  ];
}
