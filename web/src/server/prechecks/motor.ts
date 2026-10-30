import { spawn } from "node:child_process";
import { copyFile, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlanExtraction } from "@/types";
import { carpetaDe, leerEstado } from "@/server/planos/almacen";
import { completarConDocumentos, type DocumentoLeido } from "@/lib/documentos-complementarios";
import { aplicarCorrecciones, leerCorrecciones } from "@/server/planos/correcciones";
import { partirComando, PYTHON, REPO } from "@/server/planos/procesar";
import { actualizarProyecto, esIdProyectoWeb } from "@/server/proyectos/almacen";
import { carpetaPreCheck, escribirEstadoPreCheck, leerEstadoPreCheck, valoresDefinidos, type DatosPreCheck } from "./almacen";
import { leerPreCheckReal } from "./traducir";
import { enCurso, encolar, esperar } from "@/server/trabajos";

/**
 * Motor determinístico del núcleo (precheck.planos.revisar): extracción corregida + datos del lote → hechos.json,
 * resultado.json y resumen.md. Sin bitácora ni identidad del sistema operativo: es la ruta sin estado del motor.
 * PRECHECK_REVISOR permite otro comando (pruebas). Una ejecución a la vez.
 */
const LIMITE_MS = 5 * 60_000;
const MENSAJE_FALLO = "El motor de reglas no pudo evaluar este plano. Revise los datos del lote e inténtelo de nuevo.";

const dato = (valor: string | number | boolean, detalle: string) => ({ valor, confianza: 1, fuente: { metodo: "declarado", detalle } });

type Dato = ReturnType<typeof dato>;
const DETALLE_CUADRO = "declarado por el usuario en el cuadro de datos";

/** El cuadro de datos como árbol de hechos: { proyecto: { retiro_posterior_m: … }, acceso_vehicular: { … } }. */
function arbolDeclarados(declarados: Record<string, number> | undefined): Record<string, Record<string, Dato>> {
  const arbol: Record<string, Record<string, Dato>> = {};
  for (const [clave, valor] of Object.entries(declarados ?? {})) {
    const [rama, hoja] = clave.split(".");
    if (!rama || !hoja) continue;
    (arbol[rama] ??= {})[hoja] = dato(valor, DETALLE_CUADRO);
  }
  return arbol;
}

/**
 * lote.json: lo que el usuario confirmó (norma, zona, trámite, fecha y, si las respondió, las declaraciones sí/no del
 * expediente: urbanización, servidumbres, BCBRP) y lo que declaró en el cuadro de datos del anteproyecto (retiros,
 * área, alturas…). El motor lo deja prevalecer sobre la lectura del plano. Una declaración sin responder no se
 * escribe: la regla que la necesita queda en revisión (decisión D9).
 */
export function loteJson(d: DatosPreCheck) {
  const dec = d.declaraciones ?? {};
  const declarado = "declarado por el usuario";
  // Solo hay claves del catálogo (validarDatos): ramas lote, proyecto y acceso_vehicular.
  const { lote: loteCuadro, proyecto: proyectoCuadro, ...otrasRamas } = arbolDeclarados(d.datosDeclarados);
  const proyecto = {
    ...(dec.esUrbanizacionOParcelacion !== undefined ? { es_urbanizacion_o_parcelacion: dato(dec.esUrbanizacionOParcelacion, declarado) } : {}),
    ...proyectoCuadro,
  };
  return {
    tramite: dato(d.tramite, "indicado por el usuario"),
    expediente: {
      fecha_presentacion: dato(d.fechaPresentacion, "indicada por el usuario"),
      ...(dec.requiereBcbrp !== undefined ? { requiere_bcbrp: dato(dec.requiereBcbrp, declarado) } : {}),
    },
    lote: {
      ...loteCuadro,
      norma_aplicable: dato(d.normaAplicable, "elegida por el usuario"),
      ...(d.codigoZona ? { codigo_zona: dato(d.codigoZona, "indicado por el usuario") } : {}),
      ...(dec.servidumbreOtraEntidad !== undefined ? { servidumbre_otra_entidad: dato(dec.servidumbreOtraEntidad, declarado) } : {}),
      ...(dec.servidumbreFluvialOPluvial !== undefined ? { servidumbre_fluvial_o_pluvial: dato(dec.servidumbreFluvialOPluvial, declarado) } : {}),
    },
    ...(Object.keys(proyecto).length ? { proyecto } : {}),
    ...otrasRamas,
  };
}

function comando(extraccion: string, lote: string, salida: string): [string, string[]] {
  const propio = partirComando(process.env.PRECHECK_REVISOR);
  const args = ["--extraccion", extraccion, "--lote", lote, "--salida", salida];
  if (propio?.length) return [propio[0], [...propio.slice(1), ...args]];
  return [PYTHON, ["-m", "precheck.planos.revisar", ...args]];
}

function ejecutar(dir: string): Promise<{ ok: boolean; stderr: string }> {
  const [bin, args] = comando(join(/* turbopackIgnore: true */ dir, "extraccion.json"), join(/* turbopackIgnore: true */ dir, "lote.json"), dir);
  return new Promise((fin) => {
    const p = spawn(/* turbopackIgnore: true */ bin, args, { cwd: REPO, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (c: Buffer) => {
      stderr = (stderr + c.toString("utf8")).slice(-2000);
    });
    const reloj = setTimeout(() => p.kill("SIGKILL"), LIMITE_MS);
    p.on("error", () => fin({ ok: false, stderr: "no se pudo lanzar Python" }));
    p.on("close", (code) => {
      clearTimeout(reloj);
      fin({ ok: code === 0, stderr });
    });
  });
}

/**
 * Vuelve a correr el motor sobre la carpeta tal como está (con el `lote.json` que dejó la IA), sin reescribir las
 * entradas: a diferencia de `prepararEntradas`, no borra lo que la IA escribió. La usa la segunda pasada dirigida.
 */
export function reevaluar(id: string): Promise<{ ok: boolean; stderr: string }> {
  return ejecutar(carpetaPreCheck(id));
}

/** Lecturas listas (con las correcciones del usuario) de los planos o de los documentos complementarios de la lista. */
async function leidos(planIds: string[], complementarios: boolean): Promise<{ id: string; nombre: string; extraccion: PlanExtraction }[]> {
  const salida = [];
  for (const id of planIds) {
    const estado = await leerEstado(id).catch(() => null);
    if (estado?.status !== "ready" || (estado.rol === "complementario") !== complementarios) continue;
    const texto = await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ carpetaDe(id), "extraccion.json"), "utf8").catch(() => null);
    if (!texto) continue;
    const extraccion = aplicarCorrecciones(JSON.parse(texto) as PlanExtraction, await leerCorrecciones(id));
    // El documento lleva el nombre con que se cargó (el lector solo ve «original.pdf»).
    salida.push({ id, nombre: estado.fileName || extraccion.documento, extraccion: { ...extraccion, documento: estado.fileName || extraccion.documento } });
  }
  return salida;
}

/** Documentos complementarios ya leídos (memoria, cuadro de áreas, cartas…). */
export const documentosComplementarios = (planIds: string[]) => leidos(planIds, true);

/**
 * El plano principal: el primero ya leído de la lista (el motor evalúa un plano por vez), con sus datos completados por
 * los documentos complementarios donde el plano no los trae o los trae dudosos.
 */
export async function planPrincipal(planIds: string[]): Promise<{ id: string; extraccion: PlanExtraction } | null> {
  const plano = (await leidos(planIds, false))[0];
  if (!plano) return null;
  const docs: DocumentoLeido[] = (await documentosComplementarios(planIds)).map((d) => ({ nombre: d.nombre, hechos: d.extraccion.hechos }));
  return { id: plano.id, extraccion: { ...plano.extraccion, hechos: completarConDocumentos(plano.extraccion.hechos, docs) } };
}

/** Copia los PDF complementarios a la carpeta del PreCheck (complementario-N.pdf) para que la IA los lea. */
async function copiarComplementarios(planIds: string[], destino: string) {
  const docs = await documentosComplementarios(planIds);
  const lista = docs.map((d, i) => ({ archivo: `complementario-${i + 1}.pdf`, nombre: d.nombre }));
  await Promise.all(docs.map((d, i) => copyFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ carpetaDe(d.id), "original.pdf"), join(/* turbopackIgnore: true */ destino, lista[i].archivo))));
  await writeFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ destino, "documentos.json"), JSON.stringify(lista, null, 1));
}

async function copiarMiniaturas(origen: string, destino: string) {
  const nombres = (await readdir(/* turbopackIgnore: true */ origen)).filter((n) => /^p[1-9]\d{0,2}\.png$/.test(n));
  await Promise.all(nombres.map((n) => copyFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ origen, n), join(/* turbopackIgnore: true */ destino, n))));
}

/**
 * Regiones del plano (paso 2): `regiones.json` y sus raster `r<N>.png`, si el plano las tiene. Si no, se borra el
 * `regiones.json` de una ejecución anterior para que la carpeta quede en su estado inicial.
 */
async function copiarRegiones(origen: string, destino: string) {
  const nombres = (await readdir(/* turbopackIgnore: true */ origen)).filter((n) => n === "regiones.json" || /^r[1-9]\d{0,2}\.png$/.test(n));
  if (!nombres.includes("regiones.json")) {
    await rm(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ destino, "regiones.json"), { force: true });
    return;
  }
  await Promise.all(nombres.map((n) => copyFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ origen, n), join(/* turbopackIgnore: true */ destino, n))));
}

/** Archivos del paso 0 y del paso 1 (reglas vigentes) que escribe el motor o la IA en la carpeta del PreCheck. */
export const ARCHIVOS_DE_ALCANCE = ["alcance_base.json", "alcance_ia.json", "reglas_a_evaluar.json", "propuestas_reglas.json"];

/**
 * Deja la carpeta del PreCheck en su estado inicial: reescribe `extraccion.json` (con las correcciones del usuario) y
 * `lote.json` desde `estado.json` y vuelve a correr el motor. Es determinista: sirve para la primera evaluación y para
 * que cada revisión con IA parta igual, sin lo que dejó una revisión anterior (la IA completa `lote.json` y
 * reevalúa sobre la misma carpeta). Devuelve null si ningún plano del proyecto está listo.
 */
export async function prepararEntradas(id: string): Promise<{ ok: boolean; stderr: string } | null> {
  const dir = carpetaPreCheck(id);
  const estado = await leerEstadoPreCheck(id);
  const plan = await planPrincipal(estado.planIds);
  if (!plan) return null;
  await writeFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, "extraccion.json"), JSON.stringify(plan.extraccion, null, 1));
  await writeFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, "lote.json"), JSON.stringify(loteJson(estado.datos), null, 1));
  await copiarMiniaturas(carpetaDe(plan.id), dir).catch(() => undefined);
  await copiarRegiones(carpetaDe(plan.id), dir).catch(() => undefined);
  await copiarComplementarios(estado.planIds, dir).catch(() => undefined);
  // El PDF del plano, para que el motor compruebe las citas del paso 1 (reglas vigentes) contra su texto.
  await copyFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ carpetaDe(plan.id), "original.pdf"), join(/* turbopackIgnore: true */ dir, "plano.pdf")).catch(() => undefined);
  // Paso 0 y paso 1 de la corrida anterior (precheck/planos/alcance.py): cada corrida decide sus reglas vigentes desde cero.
  await Promise.all(ARCHIVOS_DE_ALCANCE.map((n) => rm(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, n), { force: true })));
  // Variables definidas por el arquitecto: el motor las impone en cada evaluación, también las de la IA.
  const definidas = valoresDefinidos(estado.datos);
  if (Object.keys(definidas).length) await writeFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, "definidas.json"), JSON.stringify({ valores: definidas }, null, 1));
  else await rm(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, "definidas.json"), { force: true });
  return ejecutar(dir);
}

async function correr(id: string) {
  await escribirEstadoPreCheck(id, { status: "running" });
  try {
    const r = await prepararEntradas(id);
    if (!r) {
      await escribirEstadoPreCheck(id, { status: "failed", error: "Ningún plano PDF del proyecto está listo: espere a que termine su lectura." });
      return;
    }
    if (!r.ok) console.warn(`[prechecks] ${id}: ${r.stderr.slice(-300)}`);
    await escribirEstadoPreCheck(id, r.ok ? { status: "done", error: undefined } : { status: "failed", error: MENSAJE_FALLO });
    await anotarEnProyecto(id, r.ok);
  } catch (e) {
    console.warn(`[prechecks] ${id}: ${e instanceof Error ? e.message.slice(0, 300) : "error"}`);
    await escribirEstadoPreCheck(id, { status: "failed", error: MENSAJE_FALLO });
    await anotarEnProyecto(id, false);
  }
}

/** Un proyecto creado en la web guarda el resultado: así el panel y las pestañas lo muestran tras recargar. */
async function anotarEnProyecto(id: string, ok: boolean) {
  try {
    const estado = await leerEstadoPreCheck(id);
    if (!esIdProyectoWeb(estado.projectId)) return;
    if (!ok) {
      await actualizarProyecto(estado.projectId, { status: "FAILED", precheckId: id });
      return;
    }
    const real = await leerPreCheckReal(id);
    const s = real?.precheck.summary;
    const evaluadas = s ? s.passed + s.failed + s.warnings + s.manualReview : 0;
    await actualizarProyecto(estado.projectId, {
      status: "REVIEW_REQUIRED",
      precheckId: id,
      complianceIndex: s && evaluadas ? Math.round((s.passed / evaluadas) * 100) : 0,
    });
  } catch (e) {
    console.warn(`[prechecks] ${id}: no se pudo anotar en el proyecto (${e instanceof Error ? e.message.slice(0, 200) : "error"})`);
  }
}

/** Encola la evaluación; el estado pasa por queued → running → done | failed. */
export function encolarPreCheck(id: string): void {
  encolar("motor", `motor:${id}`, () => correr(id));
}

/** Si quedó «en cola» o «evaluando» sin trabajo en curso (el servidor se reinició), se vuelve a encolar. */
export async function reanudarSiHaceFalta(id: string): Promise<void> {
  const estado = await leerEstadoPreCheck(id).catch(() => null);
  if (estado && (estado.status === "queued" || estado.status === "running") && !enCurso(`motor:${id}`)) encolarPreCheck(id);
}

/** Para pruebas. */
export const esperarMotor = () => esperar("motor");
