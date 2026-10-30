import { leerNombrePrueba } from "@/lib/corridas-prueba";
import type { ComplianceResult, ComplianceStatus } from "@/types";
import { compararEjecuciones, datosEscritos, efectivo, normalizar, type Ejecucion } from "./comparacion";

// ---------------------------------------------------------------------------------------------------------------
// Clasificación automática de cada corrida respecto a las demás del mismo plano.

export type NivelClasificacion = "estandar" | "desviante" | "rarisimo" | "sin_clasificar";

export interface Clasificacion {
  nivel: NivelClasificacion;
  /** Cuántas desviaciones típicas robustas se aleja de lo habitual en la métrica en que más se aleja (0 si es de lo más normal). */
  puntaje: number;
  /** Por qué: una frase por cada métrica que se aleja, el aviso de revisión superficial si lo tiene, o que se parece a la mayoría. */
  motivos: string[];
  /** Hay pocas corridas del plano (menos de 6): la clasificación es orientativa. */
  orientativa: boolean;
}

/** A partir de cuántas desviaciones robustas una corrida es «desviante» y «rarísima». */
export const UMBRAL_DESVIANTE = 2;
export const UMBRAL_RARISIMO = 3.5;
export const MINIMO_CORRIDAS_CLASIFICAR = 3;

const mediana = (v: number[]): number => {
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
const pct = (v: number) => `${Math.round(v * 100)} %`;

interface Metricas {
  acuerdo: number | null;
  cobertura: number | null;
  hallazgos: number;
  datos: number;
}

/**
 * Clasifica cada corrida como «estándar», «desviante» o «rarísima» según cuánto se aleja de lo habitual en las demás
 * corridas del mismo plano. Se miden cuatro cosas: el acuerdo con la mayoría en las reglas del catálogo, cuántos de los
 * hallazgos que casi todas encuentran incluye, cuántos hallazgos propone y cuántos de los 13 datos clave escribe. La
 * distancia usa mediana y MAD (robustas a que haya una o dos corridas raras) con una dispersión mínima por métrica,
 * para que no se exagere una diferencia pequeña cuando casi todas coinciden. Una corrida con aviso de revisión
 * superficial es, como mínimo, desviante. Con menos de 3 corridas no se clasifica.
 */
export function clasificarCorridas(ejecuciones: Ejecucion[]): Record<string, Clasificacion> {
  const salida: Record<string, Clasificacion> = {};
  const n = ejecuciones.length;
  if (n < MINIMO_CORRIDAS_CLASIFICAR) {
    for (const e of ejecuciones) {
      salida[e.projectId] = { nivel: "sin_clasificar", puntaje: 0, motivos: [`Hacen falta al menos ${MINIMO_CORRIDAS_CLASIFICAR} corridas terminadas del plano para clasificar.`], orientativa: true };
    }
    return salida;
  }
  const filas = compararEjecuciones(ejecuciones);
  const catalogo = filas.filter((f) => !f.fueraDeCatalogo);
  const nucleo = filas.filter((f) => f.fueraDeCatalogo && f.estados.filter((x) => efectivo(x) !== null).length >= Math.ceil(n / 2));

  const m: Metricas[] = ejecuciones.map((e, i) => {
    const comparables = catalogo.filter((f) => efectivo(f.estados[i]) !== null || f.consenso.estado !== null);
    const acuerdo = comparables.length ? comparables.filter((f) => efectivo(f.estados[i]) === f.consenso.estado).length / comparables.length : null;
    const cobertura = nucleo.length ? nucleo.filter((f) => efectivo(f.estados[i]) !== null).length / nucleo.length : null;
    const hallazgos = e.resultados.filter((r) => r.fueraDeCatalogo && r.status !== "NOT_APPLICABLE").length;
    // Fracción de los datos que piden las reglas de su plano que escribió.
    const { n: escritos, total } = datosEscritos(e);
    const datos = total ? escritos / total : 0;
    return { acuerdo, cobertura, hallazgos, datos };
  });

  const metricas: { clave: keyof Metricas; piso: number; lado: "bajo" | "ambos"; texto: (v: number, med: number) => string }[] = [
    { clave: "acuerdo", piso: 0.05, lado: "bajo", texto: (v, md) => `Coincide con la mayoría en ${pct(v)} de las reglas del catálogo (lo habitual: ${pct(md)}).` },
    { clave: "cobertura", piso: 0.08, lado: "bajo", texto: (v, md) => `Incluye ${pct(v)} de los hallazgos que casi todas las corridas encuentran (lo habitual: ${pct(md)}).` },
    { clave: "hallazgos", piso: 2, lado: "ambos", texto: (v, md) => `Propone ${v} ${v === 1 ? "hallazgo" : "hallazgos"} fuera del catálogo (lo habitual: ${Math.round(md)}).` },
    { clave: "datos", piso: 0.15, lado: "bajo", texto: (v, md) => `Escribió el ${pct(v)} de los datos que piden las reglas de su plano (lo habitual: ${pct(md)}).` },
  ];
  const estadisticas = metricas.map((mt) => {
    const valores = m.map((x) => x[mt.clave]).filter((v): v is number => v !== null);
    const med = valores.length ? mediana(valores) : 0;
    const mad = valores.length ? mediana(valores.map((v) => Math.abs(v - med))) : 0;
    return { med, escala: Math.max(1.4826 * mad, mt.piso) };
  });

  ejecuciones.forEach((e, i) => {
    let puntaje = 0;
    const motivos: { z: number; texto: string }[] = [];
    metricas.forEach((mt, k) => {
      const v = m[i][mt.clave];
      if (v === null) return;
      const { med, escala } = estadisticas[k];
      const z = mt.lado === "bajo" ? (med - v) / escala : Math.abs(v - med) / escala;
      if (z > puntaje) puntaje = z;
      if (z >= UMBRAL_DESVIANTE) motivos.push({ z, texto: mt.texto(v, med) });
    });
    let nivel: NivelClasificacion = puntaje >= UMBRAL_RARISIMO ? "rarisimo" : puntaje >= UMBRAL_DESVIANTE ? "desviante" : "estandar";
    const textos = motivos.sort((a, b) => b.z - a.z).map((x) => x.texto);
    if (e.aviso) {
      textos.push("La web la marcó como posiblemente superficial (muy pocos hallazgos propios).");
      if (nivel === "estandar") nivel = "desviante";
    }
    if (nivel === "estandar") textos.push("Se parece a la mayoría de las corridas de este plano.");
    salida[e.projectId] = { nivel, puntaje: Math.max(0, Math.round(puntaje * 10) / 10), motivos: textos, orientativa: n < 6 };
  });
  return salida;
}

// ---------------------------------------------------------------------------------------------------------------
// Filtros de la lista de corridas.

export interface Filtros {
  modelos: string[];
  /** Número de ronda («prueba 3 con…»); null = todas. */
  ronda: number | null;
  /** Con `ronda`: esa ronda y las posteriores (para clasificar solo dentro de una época). */
  rondaEnAdelante: boolean;
  /** Día local (AAAA-MM-DD); vacío = sin límite. */
  desde: string;
  hasta: string;
  niveles: NivelClasificacion[];
  texto: string;
  sinSuperficiales: boolean;
}

export const FILTROS_VACIOS: Filtros = { modelos: [], ronda: null, rondaEnAdelante: false, desde: "", hasta: "", niveles: [], texto: "", sinSuperficiales: false };

const dos = (n: number) => String(n).padStart(2, "0");

/** Día local (AAAA-MM-DD) de una fecha ISO; vacío si no es una fecha. */
export const diaLocal = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};

/** Hoy (AAAA-MM-DD, hora local) y hace `dias` días. */
export const hoyLocal = (dias = 0): string => diaLocal(new Date(Date.now() - dias * 86_400_000).toISOString());

/** Número de ronda de un proyecto «<Plano> - prueba [N] con <Modelo>»; 1 si no lo trae, null si no es una prueba de modelos. */
export const rondaDe = (nombre: string): number | null => leerNombrePrueba(nombre)?.ronda ?? null;

export interface CorridaFiltrable {
  nombre: string;
  modelo: string | null;
  fecha: string | null;
  nivel: NivelClasificacion;
  aviso?: string;
}

export function coincideFiltros(c: CorridaFiltrable, f: Filtros): boolean {
  if (f.modelos.length && !(c.modelo && f.modelos.includes(c.modelo))) return false;
  if (f.ronda !== null) {
    const r = rondaDe(c.nombre);
    if (r === null || (f.rondaEnAdelante ? r < f.ronda : r !== f.ronda)) return false;
  }
  const dia = c.fecha ? diaLocal(c.fecha) : "";
  if (f.desde && (!dia || dia < f.desde)) return false;
  if (f.hasta && (!dia || dia > f.hasta)) return false;
  if (f.niveles.length && !f.niveles.includes(c.nivel)) return false;
  if (f.texto.trim() && !normalizar(c.nombre).includes(normalizar(f.texto))) return false;
  if (f.sinSuperficiales && c.aviso) return false;
  return true;
}

/** Cuántos filtros hay activos (para el botón «Limpiar»). */
export const filtrosActivos = (f: Filtros): number =>
  [f.modelos.length > 0, f.ronda !== null, f.desde !== "", f.hasta !== "", f.niveles.length > 0, f.texto.trim() !== "", f.sinSuperficiales].filter(Boolean).length;

// ---------------------------------------------------------------------------------------------------------------
// Motor frente a IA, regla por regla, para una corrida.

export interface DetalleRegla {
  ruleId: string;
  titulo: string;
  fueraDeCatalogo: boolean;
  /** Lo que determinó el motor; null si el motor no evaluó esa regla (hallazgo propuesto por la IA). */
  motor: ComplianceStatus | null;
  motorMotivo?: string;
  /** Lo que decidió la IA; null si la IA no la decidió (la decidió el motor solo). */
  ia: ComplianceStatus | null;
  justificacion?: string;
  valorLeido?: string;
  limite?: string;
  subsanar?: string;
}

/** Una fila por regla con lo que dijo el motor y lo que dijo la IA, para ver dónde la IA cambió el resultado. */
export function detalleDeCorrida(resultados: ComplianceResult[], titulos: Record<string, string>): DetalleRegla[] {
  return resultados.map((r) => {
    // La decisión de respaldo del motor (ADR-0016) es del motor, no de la IA.
    const respaldo = r.dictamen?.origen === "motor";
    const tieneIa = Boolean(r.dictamen) && !respaldo;
    return {
      ruleId: r.ruleId,
      titulo: titulos[r.ruleId] ?? r.ruleId,
      fueraDeCatalogo: Boolean(r.fueraDeCatalogo),
      motor: r.fueraDeCatalogo ? null : tieneIa ? (r.motorStatus ?? null) : r.status,
      motorMotivo: respaldo ? r.dictamen?.justificacion : r.motorReason,
      ia: tieneIa ? r.status : null,
      justificacion: tieneIa ? r.dictamen?.justificacion : undefined,
      valorLeido: tieneIa ? r.dictamen?.valorLeido : undefined,
      limite: tieneIa ? r.dictamen?.limite : undefined,
      subsanar: tieneIa ? r.dictamen?.subsanar : undefined,
    };
  });
}

/** Cuántas reglas cambió la IA respecto al motor (el motor las evaluó y la IA decidió otro estado). */
export const cambiosDeLaIa = (filas: DetalleRegla[]): number => filas.filter((f) => f.motor !== null && f.ia !== null && f.motor !== f.ia).length;
