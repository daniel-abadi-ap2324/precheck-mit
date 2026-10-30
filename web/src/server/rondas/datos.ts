import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { etapaDeSeveridad } from "@/lib/corridas-prueba";
import { REPO } from "@/server/planos/procesar";
import {
  ETAPAS_RONDA,
  type EstabilidadPlano,
  type EstabilidadRondas,
  type GrupoRondas,
  type Ronda,
  type RespuestaRondas,
} from "@/services/rondas/tipos";

/**
 * Lee y une los dos archivos de la página /rondas: el catálogo curado (docs/demo/rondas.json, en el repositorio) y
 * las métricas de las corridas (web/.data/rondas-metricas.json, de scripts/analisis/rondas.py). La validación es
 * tolerante: un archivo que no existe o no se entiende queda como «faltante» (con aviso si existía) y una entrada
 * suelta mal formada se descarta con aviso, sin tumbar la página.
 */
export const archivoCatalogo = () => resolve(/* turbopackIgnore: true */ process.env.RONDAS_CATALOGO ?? join(REPO, "docs", "demo", "rondas.json"));
export const archivoMetricas = () =>
  resolve(/* turbopackIgnore: true */ process.env.RONDAS_METRICAS ?? join(/* turbopackIgnore: true */ process.cwd(), ".data", "rondas-metricas.json"));

export const archivoEstabilidad = () =>
  resolve(/* turbopackIgnore: true */ process.env.RONDAS_ESTABILIDAD ?? join(/* turbopackIgnore: true */ process.cwd(), ".data", "rondas-estabilidad.json"));

const texto = z.string().nullish().catch(null).transform((v) => (v ? v : null));
const numero = z.number().finite().nullish().catch(null).transform((v) => v ?? null);
const entero = z.number().finite().nullish().catch(null).transform((v) => v ?? 0);
const lista = z.array(z.string()).nullish().catch([]).transform((v) => v ?? []);
const corrida = z.object({
  plano: z.string().min(1),
  modelo: z.string().min(1),
  proveedor: texto,
  precheckId: texto,
  projectId: texto,
  repeticion: z.number().int().positive().catch(1),
  fecha: texto,
  terminada: z.boolean().catch(false),
  error: texto,
  usd: numero,
  minutos: numero,
  decisiones: numero,
  dictamen: z
    .object({ contradiceMotor: entero, informacionRequerida: entero, externasSinEstado: entero })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  deepseek: z
    .object({ llamadas: entero, tokensEntradaMedia: entero })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
});

const numeroRonda = z.number().int().nonnegative();
const rondaCatalogo = z.object({
  ronda: numeroRonda,
  fecha: texto,
  tanda: texto,
  titulo: texto,
  cambioCorto: texto,
  efecto: texto,
  cambio: texto,
  hipotesis: texto,
  resultado: texto,
  modelos: lista,
  planos: lista,
  informe: texto,
  commits: lista,
  etapa: z.enum(ETAPAS_RONDA).nullish().catch(null).transform((v) => v ?? null),
});
const rondaMetricas = z.object({ ronda: numeroRonda, fecha: texto, corridas: z.array(z.unknown()).catch([]) });
const archivo = z.object({ generado: texto, rondas: z.array(z.unknown()) });
const grupoCatalogo = z.object({ rondas: z.array(numeroRonda).min(1), titulo: texto });
const extrasCatalogo = z.object({ grupos: z.array(z.unknown()).nullish().catch([]).transform((v) => v ?? []) });
const extrasMetricas = z.object({
  planos: lista,
  modelos: lista,
});

// La estabilidad la escribe el servidor (server/rondas/estabilidad.ts): se comprueba solo la forma de cada plano para
// que un archivo viejo o cortado no rompa la página.
const medidaPares = z.object({ acuerdoCatalogo: z.number().nullable(), solapamientoHallazgos: z.number().nullable(), pares: z.number() });
const medidasPlano = z.object({ corridas: z.number(), todas: medidaPares, entreModelos: medidaPares, modelos: z.array(z.object({ modelo: z.string(), entreRepeticiones: medidaPares }).loose()) }).loose();
const planoEstable = z
  .object({ grupo: z.string(), plano: z.string(), corridas: z.array(z.object({ precheckId: z.string(), modelo: z.string(), nivel: z.string() }).loose()), todas: medidasPlano, sinSuperficiales: medidasPlano.nullable() })
  .loose();
const archivoEstable = z.object({ generado: texto, planos: z.array(z.unknown()), sinLeer: entero });

async function leerEstabilidad(avisos: string[]): Promise<EstabilidadRondas | null> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(await readFile(archivoEstabilidad(), "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") avisos.push("web/.data/rondas-estabilidad.json no es un JSON válido; recalcule las métricas.");
    return null;
  }
  const base = archivoEstable.safeParse(crudo);
  if (!base.success) {
    avisos.push("web/.data/rondas-estabilidad.json no tiene la forma esperada; recalcule las métricas.");
    return null;
  }
  const planos = base.data.planos.filter((p) => planoEstable.safeParse(p).success) as EstabilidadPlano[];
  const malos = base.data.planos.length - planos.length;
  if (malos) avisos.push(`web/.data/rondas-estabilidad.json: ${malos} plano(s) mal formado(s) se omitieron.`);
  return { generado: base.data.generado, planos, sinLeer: base.data.sinLeer };
}

type Lectura<T> = { faltante: boolean; aviso?: string; generado: string | null; rondas: T[]; descartadas: number; crudo?: unknown };

async function leerArchivo<T>(ruta: string, nombre: string, esquema: z.ZodType<T>): Promise<Lectura<T>> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(await readFile(ruta, "utf8"));
  } catch (e) {
    const noExiste = (e as NodeJS.ErrnoException)?.code === "ENOENT";
    return { faltante: true, aviso: noExiste ? undefined : `${nombre} no es un JSON válido; se ignora.`, generado: null, rondas: [], descartadas: 0 };
  }
  const base = archivo.safeParse(crudo);
  if (!base.success) return { faltante: true, aviso: `${nombre} no tiene la forma esperada ({ "rondas": [...] }); se ignora.`, generado: null, rondas: [], descartadas: 0 };
  const rondas: T[] = [];
  let descartadas = 0;
  for (const r of base.data.rondas) {
    const v = esquema.safeParse(r);
    if (v.success) rondas.push(v.data);
    else descartadas += 1;
  }
  return { faltante: false, generado: base.data.generado, rondas, descartadas, crudo };
}

const unicos = <T>(xs: Iterable<T>) => [...new Set(xs)];

const idDeGrupo = (rondas: number[]) => (rondas.length === 1 ? `r${rondas[0]}` : `r${rondas[0]}-${rondas[rondas.length - 1]}`);
const listaRondas = (ns: number[]) => (ns.length === 1 ? `la ronda ${ns[0]}` : `las rondas ${ns.join(", ")}`);

/**
 * Arma los grupos de rondas (`grupos` del catálogo, versión 2) y asigna a cada ronda el suyo. Tolerante como el resto:
 * un grupo mal formado se omite, una ronda que ya está en otro grupo se queda en el primero y una ronda que no existe
 * se quita del grupo, siempre con aviso. Un grupo que mezcla etapas o catálogos de severidad (ADR-0014) se arma igual,
 * pero con aviso: sus cifras no se comparan entre sí. Las rondas que no están en ningún grupo forman uno propio.
 */
function armarGrupos(rondas: Ronda[], crudos: unknown[], avisos: string[]): GrupoRondas[] {
  const porNumero = new Map(rondas.map((r) => [r.ronda, r]));
  const asignada = new Map<number, string>();
  const grupos: GrupoRondas[] = [];
  let malos = 0;
  for (const x of crudos) {
    const v = grupoCatalogo.safeParse(x);
    if (!v.success) {
      malos += 1;
      continue;
    }
    const numeros = unicos(v.data.rondas).sort((a, b) => a - b);
    const repetidas = numeros.filter((n) => asignada.has(n));
    for (const n of repetidas) avisos.push(`docs/demo/rondas.json: la ronda ${n} está en dos grupos; se queda en ${asignada.get(n)}.`);
    const libres = numeros.filter((n) => !asignada.has(n));
    const inexistentes = libres.filter((n) => !porNumero.has(n));
    if (inexistentes.length) avisos.push(`docs/demo/rondas.json: un grupo cita ${listaRondas(inexistentes)}, que no está en el catálogo ni en las métricas; se quita del grupo.`);
    const propias = libres.filter((n) => porNumero.has(n));
    if (!propias.length) continue;
    const id = idDeGrupo(propias);
    const etapas = unicos(propias.map((n) => porNumero.get(n)?.etapa).filter((e) => e != null));
    if (etapas.length > 1) avisos.push(`docs/demo/rondas.json: el grupo ${id} mezcla etapas (${etapas.join(", ")}).`);
    const severidades = unicos(propias.map(etapaDeSeveridad));
    if (severidades.length > 1) avisos.push(`docs/demo/rondas.json: el grupo ${id} mezcla catálogos de severidad (${severidades.join(", ")}); sus «no cumple» no se comparan.`);
    for (const n of propias) {
      asignada.set(n, id);
      const r = porNumero.get(n);
      if (r) r.grupo = id;
    }
    grupos.push({ id, rondas: propias, titulo: v.data.titulo ?? porNumero.get(propias[0])?.titulo ?? null, agrupada: propias.length > 1 });
  }
  if (malos) avisos.push(`docs/demo/rondas.json: ${malos} grupo(s) mal formado(s) se omitieron.`);
  for (const r of rondas) {
    if (asignada.has(r.ronda)) continue;
    r.grupo = idDeGrupo([r.ronda]);
    grupos.push({ id: r.grupo, rondas: [r.ronda], titulo: r.titulo, agrupada: false });
  }
  return grupos.sort((a, b) => a.rondas[0] - b.rondas[0]);
}

/** Une catálogo y métricas por número de ronda (de la más antigua a la más reciente). */
export async function leerRondas(): Promise<RespuestaRondas> {
  const avisosEstabilidad: string[] = [];
  const [cat, met, estabilidad] = await Promise.all([
    leerArchivo(archivoCatalogo(), "docs/demo/rondas.json", rondaCatalogo),
    leerArchivo(archivoMetricas(), "web/.data/rondas-metricas.json", rondaMetricas),
    leerEstabilidad(avisosEstabilidad),
  ]);
  const avisos = [cat.aviso, met.aviso, ...avisosEstabilidad].filter((a): a is string => Boolean(a));
  if (cat.descartadas) avisos.push(`docs/demo/rondas.json: ${cat.descartadas} ronda(s) mal formada(s) se omitieron.`);
  if (met.descartadas) avisos.push(`web/.data/rondas-metricas.json: ${met.descartadas} ronda(s) mal formada(s) se omitieron.`);

  const porNumero = new Map<number, Ronda>();
  const vacia = (n: number): Ronda => ({
    ronda: n,
    documentada: false,
    fecha: null,
    tanda: null,
    titulo: null,
    cambioCorto: null,
    efecto: null,
    cambio: null,
    hipotesis: null,
    resultado: null,
    modelos: [],
    planos: [],
    informe: null,
    commits: [],
    etapa: null,
    grupo: idDeGrupo([n]),
    corridas: [],
  });
  for (const c of cat.rondas) {
    const previa = porNumero.get(c.ronda);
    porNumero.set(c.ronda, { ...(previa ?? vacia(c.ronda)), ...c, documentada: true, corridas: previa?.corridas ?? [] });
  }
  let corridasMalas = 0;
  for (const m of met.rondas) {
    const r = porNumero.get(m.ronda) ?? vacia(m.ronda);
    for (const x of m.corridas) {
      const v = corrida.safeParse(x);
      if (v.success) r.corridas.push(v.data);
      else corridasMalas += 1;
    }
    r.fecha ??= m.fecha;
    porNumero.set(m.ronda, r);
  }
  if (corridasMalas) avisos.push(`web/.data/rondas-metricas.json: ${corridasMalas} corrida(s) mal formada(s) se omitieron.`);
  // Una ronda sin documentar toma sus modelos y planos de las corridas.
  for (const r of porNumero.values()) {
    r.modelos = unicos([...r.modelos, ...r.corridas.map((c) => c.modelo)]);
    r.planos = unicos([...r.planos, ...r.corridas.map((c) => c.plano)]);
  }
  const rondas = [...porNumero.values()].sort((a, b) => a.ronda - b.ronda);
  for (const r of rondas) r.corridas.sort((a, b) => a.plano.localeCompare(b.plano, "es") || a.modelo.localeCompare(b.modelo, "es") || a.repeticion - b.repeticion);
  const extrasCat = extrasCatalogo.safeParse(cat.crudo ?? {});
  const grupos = armarGrupos(rondas, extrasCat.success ? extrasCat.data.grupos : [], avisos);
  const extras = extrasMetricas.safeParse(met.crudo ?? {});
  const ex = extras.success ? extras.data : { planos: [], modelos: [] };
  return {
    rondas,
    grupos,
    planos: unicos([...ex.planos, ...rondas.flatMap((r) => r.planos)]).sort((a, b) => a.localeCompare(b, "es")),
    modelos: unicos([...ex.modelos, ...rondas.flatMap((r) => r.modelos)]),
    generado: met.faltante ? null : met.generado,
    catalogoGenerado: cat.faltante ? null : cat.generado,
    estabilidad,
    faltantes: { catalogo: cat.faltante, metricas: met.faltante },
    avisos,
  };
}
