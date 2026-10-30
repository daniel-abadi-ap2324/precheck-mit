import { etapaDe, type EtapaClave } from "@/features/rondas/lib/rondas";
import type { CorridaRonda, EstabilidadPlano, GrupoRondas, MedidasPlano, NivelCorrida, Ronda } from "@/services/rondas/tipos";

/**
 * «Estabilidad por ronda» (ADR-0015): una fila por grupo de rondas × plano × modelo con cuánto se repite el modelo
 * entre sus corridas, cuánto coincide con la mayoría y cuánto cuesta. Las medidas vienen del servidor
 * (web/.data/rondas-estabilidad.json); el costo, los minutos y las decisiones, de las métricas de cada corrida.
 * No hay ninguna medida contra respuestas «correctas»: todavía no hay una referencia confirmada.
 */
export interface Fila {
  clave: string;
  grupo: string;
  /** Las rondas del grupo, de menor a mayor. */
  rondas: number[];
  titulo: string | null;
  etapa: EtapaClave;
  fecha: string | null;
  plano: string;
  modelo: string;
  corridas: number;
  /** Entre las repeticiones de este modelo en el plano (null con menos de dos corridas). */
  acuerdoRepeticiones: number | null;
  solapamientoRepeticiones: number | null;
  /** Del plano en el grupo, iguales para todos sus modelos: entre corridas de modelos distintos y entre todas. */
  acuerdoEntreModelos: number | null;
  acuerdoTodas: number | null;
  solapamientoTodas: number | null;
  /** Con la mayoría de todas las corridas del plano en el grupo. */
  acuerdoMayoria: number | null;
  niveles: Record<NivelCorrida, number>;
  superficiales: number;
  hallazgos: number | null;
  /** Parte de los datos que piden las reglas que escribió (0 a 1). */
  datos: number | null;
  usd: number | null;
  minutos: number | null;
  decisiones: number | null;
  infoRequerida: number | null;
  projectIds: string[];
}

const media = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const NIVELES_VACIOS = (): Record<NivelCorrida, number> => ({ estandar: 0, desviante: 0, rarisimo: 0, sin_clasificar: 0 });

/**
 * Filas de la tabla. Con `sinSuperficiales` las medidas se toman sin las corridas posiblemente superficiales (y esas
 * corridas no cuentan en los totales); si el plano no tuvo ninguna, las medidas son las mismas.
 */
export function filasDe(planos: EstabilidadPlano[], rondas: Ronda[], grupos: GrupoRondas[], sinSuperficiales = false): Fila[] {
  const metricas = new Map<string, CorridaRonda>();
  for (const r of rondas) for (const c of r.corridas) if (c.precheckId) metricas.set(c.precheckId, c);
  const porNumero = new Map(rondas.map((r) => [r.ronda, r]));
  const grupoDe = new Map(grupos.map((g) => [g.id, g]));
  return planos.flatMap((p) => {
    const medidas: MedidasPlano = (sinSuperficiales && p.sinSuperficiales) || p.todas;
    const g = grupoDe.get(p.grupo);
    const numeros = g?.rondas ?? [...new Set(p.corridas.map((c) => c.ronda))].sort((a, b) => a - b);
    const primera = porNumero.get(numeros[0]);
    return medidas.modelos.map((m): Fila => {
      const corridas = p.corridas.filter((c) => c.modelo === m.modelo && !(sinSuperficiales && p.sinSuperficiales && c.superficial));
      const met = corridas.map((c) => metricas.get(c.precheckId));
      const niveles = NIVELES_VACIOS();
      for (const c of corridas) niveles[c.nivel] += 1;
      return {
        clave: `${p.grupo}|${p.plano}|${m.modelo}`,
        grupo: p.grupo,
        rondas: numeros,
        titulo: g?.titulo ?? primera?.titulo ?? null,
        etapa: primera ? etapaDe(primera) : "sin-etapa",
        fecha: met.map((x) => x?.fecha).filter((f): f is string => Boolean(f)).sort().at(-1) ?? null,
        plano: p.plano,
        modelo: m.modelo,
        corridas: m.corridas,
        acuerdoRepeticiones: m.entreRepeticiones.acuerdoCatalogo,
        solapamientoRepeticiones: m.entreRepeticiones.solapamientoHallazgos,
        acuerdoEntreModelos: medidas.entreModelos.acuerdoCatalogo,
        acuerdoTodas: medidas.todas.acuerdoCatalogo,
        solapamientoTodas: medidas.todas.solapamientoHallazgos,
        acuerdoMayoria: medidas.corridas >= 2 ? m.acuerdoMayoria : null,
        niveles,
        superficiales: corridas.filter((c) => c.superficial).length,
        hallazgos: media(corridas.map((c) => c.hallazgos)),
        datos: media(corridas.map((c) => (c.datos.total ? c.datos.n / c.datos.total : null))),
        usd: media(met.map((x) => x?.usd)),
        minutos: media(met.map((x) => x?.minutos)),
        decisiones: media(met.map((x) => x?.decisiones)),
        infoRequerida: media(met.map((x) => x?.dictamen?.informacionRequerida)),
        projectIds: corridas.map((c) => c.projectId).filter((x): x is string => Boolean(x)),
      };
    });
  });
}

export interface FiltrosExplorador {
  planos: string[];
  modelos: string[];
  etapas: EtapaClave[];
  /** Por la primera ronda del grupo. */
  desde: number | null;
  hasta: number | null;
  /** Solo los grupos con al menos dos corridas del mismo modelo (donde se puede medir la repetición). */
  soloConRepeticiones: boolean;
  /** Medir sin las corridas posiblemente superficiales. */
  sinSuperficiales: boolean;
  texto: string;
}
/** Listas vacías = todo. */
export const FILTROS_VACIOS: FiltrosExplorador = { planos: [], modelos: [], etapas: [], desde: null, hasta: null, soloConRepeticiones: false, sinSuperficiales: false, texto: "" };

export const etiquetaRondas = (rondas: number[]) => (rondas.length === 1 ? `${rondas[0]}` : `${rondas[0]}–${rondas[rondas.length - 1]}`);

export function filtrarFilas(filas: Fila[], f: FiltrosExplorador): Fila[] {
  const t = f.texto.trim().toLowerCase();
  return filas.filter(
    (x) =>
      (!f.planos.length || f.planos.includes(x.plano)) &&
      (!f.modelos.length || f.modelos.includes(x.modelo)) &&
      (!f.etapas.length || f.etapas.includes(x.etapa)) &&
      (f.desde === null || x.rondas[0] >= f.desde) &&
      (f.hasta === null || x.rondas[0] <= f.hasta) &&
      (!f.soloConRepeticiones || x.corridas >= 2) &&
      (!t || `${x.plano} ${x.modelo} ronda ${x.rondas.join(" ")} ${x.titulo ?? ""}`.toLowerCase().includes(t)),
  );
}

export type Agrupar = "fila" | "grupo-modelo" | "plano-modelo" | "modelo";
export const AGRUPACIONES: { id: Agrupar; label: string }[] = [
  { id: "fila", label: "Grupo × plano × modelo" },
  { id: "grupo-modelo", label: "Grupo × modelo (promedio de los planos)" },
  { id: "plano-modelo", label: "Plano × modelo (promedio de los grupos)" },
  { id: "modelo", label: "Por modelo" },
];

/** Una fila de la tabla: la de un modelo en un plano y grupo, o el promedio de varias. */
export interface Registro extends Omit<Fila, "grupo" | "rondas" | "titulo" | "plano" | "etapa"> {
  /** Cuántas filas (grupo × plano × modelo) se promediaron. */
  n: number;
  grupo: string | null;
  rondas: number[] | null;
  titulo: string | null;
  plano: string | null;
  etapa: EtapaClave | null;
}

function unico<T>(xs: T[]): T | null {
  return new Set(xs).size === 1 ? xs[0] : null;
}

const NUMERICAS = [
  "acuerdoRepeticiones",
  "solapamientoRepeticiones",
  "acuerdoEntreModelos",
  "acuerdoTodas",
  "solapamientoTodas",
  "acuerdoMayoria",
  "hallazgos",
  "datos",
  "usd",
  "minutos",
  "decisiones",
  "infoRequerida",
] as const;

/** Promedia las medidas de las filas de cada grupo (cada fila pesa lo mismo) y suma las corridas. */
export function agrupar(filas: Fila[], por: Agrupar): Registro[] {
  const clave = (x: Fila) => (por === "fila" ? x.clave : por === "grupo-modelo" ? `${x.grupo}|${x.modelo}` : por === "plano-modelo" ? `${x.plano}|${x.modelo}` : x.modelo);
  const grupos = new Map<string, Fila[]>();
  for (const x of filas) grupos.set(clave(x), [...(grupos.get(clave(x)) ?? []), x]);
  return [...grupos].map(([k, xs]) => {
    const niveles = NIVELES_VACIOS();
    for (const x of xs) for (const n of Object.keys(niveles) as NivelCorrida[]) niveles[n] += x.niveles[n];
    const grupo = unico(xs.map((x) => x.grupo));
    return {
      clave: k,
      n: xs.length,
      grupo,
      rondas: grupo === null ? null : xs[0].rondas,
      titulo: grupo === null ? null : xs[0].titulo,
      plano: unico(xs.map((x) => x.plano)),
      modelo: xs[0].modelo,
      etapa: unico(xs.map((x) => x.etapa)),
      fecha: xs.map((x) => x.fecha).filter((f): f is string => !!f).sort().at(-1) ?? null,
      corridas: xs.reduce((a, x) => a + x.corridas, 0),
      ...(Object.fromEntries(NUMERICAS.map((c) => [c, media(xs.map((x) => x[c]))])) as Record<(typeof NUMERICAS)[number], number | null>),
      niveles,
      superficiales: xs.reduce((a, x) => a + x.superficiales, 0),
      projectIds: xs.flatMap((x) => x.projectIds),
    };
  });
}

export type ColumnaId =
  | "rondas"
  | "plano"
  | "modelo"
  | "etapa"
  | "fecha"
  | "corridas"
  | "acuerdoRepeticiones"
  | "solapamientoRepeticiones"
  | "acuerdoEntreModelos"
  | "acuerdoTodas"
  | "solapamientoTodas"
  | "acuerdoMayoria"
  | "niveles"
  | "superficiales"
  | "hallazgos"
  | "datos"
  | "usd"
  | "minutos"
  | "decisiones"
  | "infoRequerida";

export const COLUMNAS: { id: ColumnaId; label: string; numerica: boolean; porcentaje?: boolean; ayuda: string }[] = [
  { id: "rondas", label: "Rondas", numerica: true, ayuda: "Rondas del grupo: repiten la misma configuración y se miden juntas." },
  { id: "plano", label: "Plano", numerica: false, ayuda: "Anteproyecto revisado." },
  { id: "modelo", label: "Modelo", numerica: false, ayuda: "Modelo de IA que hizo la revisión." },
  { id: "etapa", label: "Etapa", numerica: false, ayuda: "Etapa del proyecto a la que pertenece el grupo." },
  { id: "fecha", label: "Fecha", numerica: false, ayuda: "Día de la corrida más reciente." },
  { id: "corridas", label: "Corridas", numerica: true, ayuda: "Corridas terminadas que entran en la fila." },
  { id: "acuerdoRepeticiones", label: "Se repite (reglas)", numerica: true, porcentaje: true, ayuda: "Entre las corridas del mismo modelo: de las reglas del catálogo que decidieron las dos de cada par, en qué parte dicen lo mismo." },
  { id: "solapamientoRepeticiones", label: "Se repite (hallazgos)", numerica: true, porcentaje: true, ayuda: "Entre las corridas del mismo modelo: de los hallazgos propios que propone alguna de las dos, qué parte proponen ambas." },
  { id: "acuerdoEntreModelos", label: "Entre modelos", numerica: true, porcentaje: true, ayuda: "Acuerdo en reglas del catálogo entre corridas de modelos distintos del mismo plano." },
  { id: "acuerdoTodas", label: "Entre todas", numerica: true, porcentaje: true, ayuda: "Acuerdo en reglas del catálogo entre todas las corridas del plano en el grupo." },
  { id: "solapamientoTodas", label: "Hallazgos entre todas", numerica: true, porcentaje: true, ayuda: "Solapamiento de hallazgos propios entre todas las corridas del plano en el grupo." },
  { id: "acuerdoMayoria", label: "Con la mayoría", numerica: true, porcentaje: true, ayuda: "En qué parte de las reglas y hallazgos dice lo mismo que la mayoría de las corridas del plano." },
  { id: "niveles", label: "Clasificación", numerica: false, ayuda: "Cuántas corridas son estándar, desviantes o rarísimas frente a las demás del plano (hacen falta 3 corridas del plano)." },
  { id: "superficiales", label: "Superficiales", numerica: true, ayuda: "Corridas que la web marcó como posiblemente superficiales (muy pocos hallazgos propios)." },
  { id: "hallazgos", label: "Hallazgos", numerica: true, ayuda: "Hallazgos propios (fuera del catálogo) por corrida." },
  { id: "datos", label: "Datos escritos", numerica: true, porcentaje: true, ayuda: "Parte de los datos que piden las reglas del plano que escribió la corrida." },
  { id: "usd", label: "USD", numerica: true, ayuda: "Costo por revisión, a precio de lista." },
  { id: "minutos", label: "Min", numerica: true, ayuda: "Minutos que tardó la revisión." },
  { id: "decisiones", label: "Decisiones", numerica: true, ayuda: "Reglas sobre las que la IA dio una decisión." },
  { id: "infoRequerida", label: "Info. requerida", numerica: true, ayuda: "Reglas que quedaron pendientes de un documento externo." },
];
export const COLUMNAS_INICIALES: ColumnaId[] = ["rondas", "plano", "modelo", "corridas", "acuerdoRepeticiones", "solapamientoRepeticiones", "acuerdoMayoria", "niveles", "usd", "minutos"];

const valorOrden = (r: Registro, col: ColumnaId): number | string | null => {
  if (col === "rondas") return r.rondas?.[0] ?? null;
  if (col === "niveles") return r.niveles.desviante + r.niveles.rarisimo;
  return r[col];
};

export function ordenar(rs: Registro[], col: ColumnaId, asc: boolean): Registro[] {
  return [...rs].sort((a, b) => {
    const x = valorOrden(a, col);
    const y = valorOrden(b, col);
    if (x === null && y === null) return 0;
    if (x === null) return 1; // los vacíos siempre al final
    if (y === null) return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es");
    return asc ? c : -c;
  });
}

export const textoNiveles = (n: Record<NivelCorrida, number>) =>
  [
    n.estandar ? `${n.estandar} estándar` : null,
    n.desviante ? `${n.desviante} desviante${n.desviante === 1 ? "" : "s"}` : null,
    n.rarisimo ? `${n.rarisimo} rarísima${n.rarisimo === 1 ? "" : "s"}` : null,
    n.sin_clasificar ? `${n.sin_clasificar} sin clasificar` : null,
  ]
    .filter(Boolean)
    .join(" · ");

const celdaCsv = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function aCsv(rs: Registro[], columnas: ColumnaId[]): string {
  const cols = COLUMNAS.filter((c) => columnas.includes(c.id));
  const valor = (r: Registro, c: (typeof COLUMNAS)[number]) => {
    if (c.id === "rondas") return r.rondas ? etiquetaRondas(r.rondas) : "";
    if (c.id === "niveles") return textoNiveles(r.niveles);
    const v = r[c.id];
    return c.porcentaje && typeof v === "number" ? Math.round(v * 1000) / 10 : v;
  };
  const cuerpo = rs.map((r) => cols.map((c) => celdaCsv(valor(r, c))).join(","));
  return [cols.map((c) => celdaCsv(c.porcentaje ? `${c.label} (%)` : c.label)).join(","), ...cuerpo].join("\n");
}

/** Media por grupo y modelo de una medida (promedio de los planos), para los gráficos de líneas. Solo los grupos con dato. */
export function seriePorGrupo(filas: Fila[], medida: "acuerdoRepeticiones" | "acuerdoMayoria"): { modelo: string; puntos: { grupo: string; x: number; etiqueta: string; valor: number; planos: number }[] }[] {
  const modelos = [...new Set(filas.map((f) => f.modelo))].sort();
  return modelos
    .map((modelo) => {
      const porGrupo = new Map<string, Fila[]>();
      for (const f of filas) if (f.modelo === modelo && f[medida] !== null) porGrupo.set(f.grupo, [...(porGrupo.get(f.grupo) ?? []), f]);
      const puntos = [...porGrupo].map(([grupo, xs]) => ({ grupo, x: xs[0].rondas[0], etiqueta: etiquetaRondas(xs[0].rondas), valor: media(xs.map((x) => x[medida])) as number, planos: xs.length }));
      return { modelo, puntos: puntos.sort((a, b) => a.x - b.x) };
    })
    .filter((s) => s.puntos.length);
}

export interface VistaGuardada {
  nombre: string;
  filtros: FiltrosExplorador;
  agrupar: Agrupar;
  columnas: ColumnaId[];
}
