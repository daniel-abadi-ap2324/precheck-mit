import { CircleHelp, Cpu, Flag, Gavel, Scale, ScanText, SquareDashed, type LucideIcon } from "lucide-react";
import type { Tone } from "@/lib/status";
import type { CorridaRonda, EstabilidadPlano, EstabilidadRondas, EtapaRonda, GrupoRondas, NivelCorrida, Ronda } from "@/services/rondas/tipos";

/** Etapa de una ronda; las que no están en el catálogo (o no dicen su etapa) van a «sin-etapa». */
export type EtapaClave = EtapaRonda | "sin-etapa";

export const etapaMeta: Record<EtapaClave, { label: string; descripcion: string; icon: LucideIcon; tone: Tone }> = {
  "linea-base": { label: "Punto de partida", descripcion: "Las primeras pruebas: cómo revisaban los modelos sin ayuda, antes de cambiar nada.", icon: Flag, tone: "neutral" },
  lectura: { label: "Leer bien los datos", descripcion: "Criterios escritos y mediciones automáticas para que la IA lea cada dato del plano de la misma forma.", icon: ScanText, tone: "info" },
  regiones: { label: "Zonas marcadas en el plano", descripcion: "Marcar sobre la hoja dónde están el lote, los estacionamientos y otras partes, para que la IA mire en el lugar correcto.", icon: SquareDashed, tone: "processing" },
  dictamen: { label: "Decisiones de la IA", descripcion: "Que la IA no cambie lo que el motor de reglas ya decidió y que separe lo que falta en el plano de los documentos que faltan.", icon: Gavel, tone: "manual" },
  deepseek: { label: "DeepSeek", descripcion: "Pruebas con DeepSeek, un modelo mucho más barato que los de Anthropic, para ver si puede hacer el mismo trabajo.", icon: Cpu, tone: "warning" },
  comparativa: { label: "Comparación final", descripcion: "Todos los modelos con el mismo sistema y los mismos planos, repitiendo cada plano 3 veces, para ver cuánto se repite cada uno.", icon: Scale, tone: "pass" },
  "sin-etapa": { label: "Sin documentar", descripcion: "Rondas de las que hay resultados pero no se anotó qué se cambió.", icon: CircleHelp, tone: "neutral" },
};

export const etapaDe = (r: Ronda): EtapaClave => r.etapa ?? "sin-etapa";

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const unicos = <T>(xs: T[]) => [...new Set(xs)];

/** Costo medio por revisión (USD) de las corridas terminadas con costo. */
export const costoMedio = (cs: CorridaRonda[]) => media(cs.filter((c) => c.terminada && c.usd != null).map((c) => c.usd as number));
/** Minutos medios de las corridas terminadas. */
export const minutosMedios = (cs: CorridaRonda[]) => media(cs.filter((c) => c.terminada && c.minutos != null).map((c) => c.minutos as number));

/** DeepSeek factura ≈ 4 veces menos que el precio de lista con el que se cuenta (comprobado en el saldo de la cuenta). */
export const FACTOR_REAL_DEEPSEEK = 4;
export const esDeepSeek = (modelo: string) => modelo.toLowerCase().startsWith("deepseek");

/** «43–45», «59»; «9, 12» si el grupo no es seguido. */
export function etiquetaGrupo(rondas: number[]): string {
  const seguidas = rondas.every((n, i) => i === 0 || n === rondas[i - 1] + 1);
  if (rondas.length === 1) return String(rondas[0]);
  return seguidas ? `${rondas[0]}–${rondas[rondas.length - 1]}` : rondas.join(", ");
}
export const tituloGrupo = (g: GrupoRondas) => (g.rondas.length > 1 ? `Rondas ${etiquetaGrupo(g.rondas)}` : `Ronda ${g.rondas[0]}`);

/** Un grupo de rondas con todo lo que la página muestra de él. */
export interface GrupoVista {
  grupo: GrupoRondas;
  /** De la más antigua a la más reciente. */
  rondas: Ronda[];
  etapa: EtapaClave;
  fecha: string | null;
  corridas: CorridaRonda[];
  /** Estabilidad por plano que calculó el servidor (vacío si no se calculó). */
  estabilidad: EstabilidadPlano[];
  /** Por modelo, con los modelos que más se repiten primero. */
  modelos: ResumenModeloGrupo[];
  /** Algún modelo revisó algún plano dos veces o más en el grupo. */
  conRepeticiones: boolean;
}

export interface ResumenModeloGrupo {
  modelo: string;
  corridas: number;
  planos: number;
  /** Media, sobre los planos, del acuerdo entre sus repeticiones en las reglas del catálogo (null sin repeticiones). */
  seRepite: number | null;
  /** Lo mismo con los hallazgos fuera del catálogo. */
  hallazgosRepiten: number | null;
  /** Media, sobre los planos con más de una corrida, del acuerdo con la mayoría de las corridas del plano. */
  conMayoria: number | null;
  niveles: Record<NivelCorrida, number>;
  superficiales: number;
  usd: number | null;
  minutos: number | null;
}

const NIVELES_VACIOS = (): Record<NivelCorrida, number> => ({ estandar: 0, desviante: 0, rarisimo: 0, sin_clasificar: 0 });

/** Resumen por modelo de un grupo: cuánto se repite, cuánto coincide con la mayoría, su clasificación y su costo. */
export function resumenModelos(estabilidad: EstabilidadPlano[], corridas: CorridaRonda[]): ResumenModeloGrupo[] {
  const modelos = unicos([...corridas.map((c) => c.modelo), ...estabilidad.flatMap((p) => p.todas.modelos.map((m) => m.modelo))]);
  return modelos
    .map((modelo): ResumenModeloGrupo => {
      const medidas = estabilidad.flatMap((p) => p.todas.modelos.filter((m) => m.modelo === modelo).map((m) => ({ m, plano: p })));
      const conPares = medidas.filter(({ m }) => m.entreRepeticiones.pares > 0);
      const niveles = NIVELES_VACIOS();
      let superficiales = 0;
      for (const p of estabilidad)
        for (const c of p.corridas)
          if (c.modelo === modelo) {
            niveles[c.nivel] += 1;
            if (c.superficial) superficiales += 1;
          }
      const propias = corridas.filter((c) => c.modelo === modelo);
      return {
        modelo,
        corridas: propias.length,
        planos: unicos(propias.map((c) => c.plano)).length,
        seRepite: media(conPares.flatMap(({ m }) => (m.entreRepeticiones.acuerdoCatalogo === null ? [] : [m.entreRepeticiones.acuerdoCatalogo]))),
        hallazgosRepiten: media(conPares.flatMap(({ m }) => (m.entreRepeticiones.solapamientoHallazgos === null ? [] : [m.entreRepeticiones.solapamientoHallazgos]))),
        conMayoria: media(medidas.filter(({ plano }) => plano.todas.corridas > 1).map(({ m }) => m.acuerdoMayoria)),
        niveles,
        superficiales,
        usd: costoMedio(propias),
        minutos: minutosMedios(propias),
      };
    })
    .sort((a, b) => (b.seRepite ?? -1) - (a.seRepite ?? -1) || b.corridas - a.corridas);
}

/** Los grupos de rondas con sus rondas, corridas y estabilidad, del más reciente al más antiguo. */
export function gruposVista(rondas: Ronda[], grupos: GrupoRondas[], estabilidad: EstabilidadRondas | null): GrupoVista[] {
  const porNumero = new Map(rondas.map((r) => [r.ronda, r]));
  return grupos
    .map((grupo): GrupoVista => {
      const rs = grupo.rondas.flatMap((n) => (porNumero.has(n) ? [porNumero.get(n) as Ronda] : []));
      const corridas = rs.flatMap((r) => r.corridas);
      const planos = (estabilidad?.planos ?? []).filter((p) => p.grupo === grupo.id);
      const modelos = resumenModelos(planos, corridas);
      return {
        grupo,
        rondas: rs,
        etapa: rs[0] ? etapaDe(rs[0]) : "sin-etapa",
        fecha: rs.find((r) => r.fecha)?.fecha ?? null,
        corridas,
        estabilidad: planos,
        modelos,
        conRepeticiones: modelos.some((m) => m.seRepite !== null),
      };
    })
    .filter((g) => g.rondas.length > 0)
    .sort((a, b) => b.grupo.rondas[0] - a.grupo.rondas[0]);
}

/** El grupo más reciente en el que algún modelo repitió algún plano: de él sale la conclusión. */
export const ultimoConRepeticiones = (grupos: GrupoVista[]) => grupos.find((g) => g.conRepeticiones) ?? null;

/** Lo que se anotó del grupo: el cambio y el resultado de su primera ronda que los tenga (las demás suelen repetirla). */
export function textosDeGrupo(g: GrupoVista): { cambio: string | null; resultado: string | null } {
  const cambio = g.rondas.map((r) => r.cambioCorto ?? r.titulo).find(Boolean) ?? g.grupo.titulo;
  const resultado = g.rondas.map((r) => r.efecto).find((e) => e && !/^Ver ronda \d+\.?$/.test(e)) ?? null;
  return { cambio: cambio ?? null, resultado };
}

/** Una corrida de la carpeta de pruebas, con su clasificación si se midió. */
export interface CorridaCarpeta {
  corrida: CorridaRonda;
  ronda: number;
  nivel: NivelCorrida | null;
  superficial: boolean;
}

/** Carpeta de corridas de prueba: por plano, una fila por grupo (del más reciente) con las corridas de cada modelo. */
export interface PlanoCarpeta {
  plano: string;
  modelos: string[];
  corridas: number;
  filas: { grupo: GrupoRondas; celdas: Map<string, CorridaCarpeta[]> }[];
}

export function carpetaDeCorridas(grupos: GrupoVista[]): PlanoCarpeta[] {
  const planos = new Map<string, PlanoCarpeta>();
  for (const g of grupos) {
    const estables = new Map(g.estabilidad.flatMap((p) => p.corridas.map((c) => [c.precheckId, c] as const)));
    for (const r of g.rondas)
      for (const c of r.corridas) {
        const p = planos.get(c.plano) ?? { plano: c.plano, modelos: [], corridas: 0, filas: [] };
        planos.set(c.plano, p);
        let fila = p.filas.find((f) => f.grupo.id === g.grupo.id);
        if (!fila) {
          fila = { grupo: g.grupo, celdas: new Map() };
          p.filas.push(fila);
        }
        const e = c.precheckId ? estables.get(c.precheckId) : undefined;
        fila.celdas.set(c.modelo, [...(fila.celdas.get(c.modelo) ?? []), { corrida: c, ronda: r.ronda, nivel: e?.nivel ?? null, superficial: e?.superficial ?? false }]);
        if (!p.modelos.includes(c.modelo)) p.modelos.push(c.modelo);
        p.corridas += 1;
      }
  }
  for (const p of planos.values())
    for (const f of p.filas) for (const cs of f.celdas.values()) cs.sort((a, b) => a.ronda - b.ronda || a.corrida.repeticion - b.corrida.repeticion);
  return [...planos.values()].sort((a, b) => b.corridas - a.corridas || a.plano.localeCompare(b.plano, "es"));
}

/** Ancla de un plano en la carpeta: «corridas-bella-vista». */
export const anclaPlano = (plano: string) =>
  `corridas-${plano
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;

export const formatoPorcentaje = (x: number) => `${Math.round(x * 100)} %`;
export const formatoUsd = (x: number) => `${x.toFixed(2)} USD`;
