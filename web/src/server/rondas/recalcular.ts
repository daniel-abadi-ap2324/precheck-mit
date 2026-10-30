import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PYTHON, REPO, partirComando } from "@/server/planos/procesar";
import { enCurso, encolar } from "@/server/trabajos";
import type { ResumenRecalculo } from "@/services/rondas/tipos";
import { archivoMetricas, leerRondas } from "./datos";
import { recalcularEstabilidad } from "./estabilidad";

/**
 * «Recalcular métricas» de /rondas, en dos pasos y uno a la vez (cola «rondas»):
 * 1. scripts/analisis/rondas.py --salida <archivo de métricas que lee la página>, con el Python del núcleo, desde la
 *    raíz del repositorio. RONDAS_RECALCULAR permite otro comando (pruebas). Si falla, falla todo.
 * 2. La estabilidad entre corridas (server/rondas/estabilidad.ts). Si falla, las métricas ya quedaron: la respuesta
 *    lleva un aviso en vez de fallar.
 */
export const CLAVE_RECALCULO = "rondas:recalcular";
const LIMITE_MS = 5 * 60_000;
const script = () => join(REPO, "scripts", "analisis", "rondas.py");

export type Recalculo = { ok: true; resumen: ResumenRecalculo } | { ok: false; status: number; code: string; message: string };

const cola = (t: string, n = 1500) => (t.length > n ? `…${t.slice(-n)}` : t).trim();

function comando(): [string, string[]] | null {
  const propio = partirComando(process.env.RONDAS_RECALCULAR);
  if (propio?.length) return [propio[0], propio.slice(1)];
  return existsSync(script()) ? [PYTHON, [script(), "--salida", archivoMetricas()]] : null;
}

function ejecutar(bin: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string; vencido: boolean }> {
  return new Promise((listo) => {
    execFile(
      /* turbopackIgnore: true */ bin,
      args,
      { cwd: REPO, timeout: LIMITE_MS, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        const vencido = Boolean(error && "killed" in error && error.killed);
        listo({ ok: !error, stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), vencido });
      },
    );
  });
}

export async function recalcularRondas(): Promise<Recalculo> {
  if (enCurso(CLAVE_RECALCULO)) return { ok: false, status: 409, code: "rondas.en_curso", message: "Ya se están recalculando las métricas. Espere a que termine." };
  const cmd = comando();
  if (!cmd) {
    return { ok: false, status: 409, code: "rondas.sin_script", message: "Falta scripts/analisis/rondas.py en el repositorio: no hay con qué recalcular las métricas." };
  }
  type Paso = Awaited<ReturnType<typeof ejecutar>> & { estabilidad: ResumenRecalculo["estabilidad"]; aviso?: string };
  const resultado = await new Promise<Paso>((listo) => {
    encolar("rondas", CLAVE_RECALCULO, async () => {
      let metricas: Awaited<ReturnType<typeof ejecutar>>;
      try {
        metricas = await ejecutar(...cmd);
      } catch (e) {
        return listo({ ok: false, stdout: "", stderr: e instanceof Error ? e.message : "error", vencido: false, estabilidad: null });
      }
      if (!metricas.ok) return listo({ ...metricas, estabilidad: null });
      try {
        listo({ ...metricas, estabilidad: await recalcularEstabilidad() });
      } catch (e) {
        listo({ ...metricas, estabilidad: null, aviso: `Las métricas se recalcularon, pero no la estabilidad entre corridas: ${e instanceof Error ? e.message : "error"}.` });
      }
    });
  });
  if (!resultado.ok) {
    const detalle = cola(resultado.stderr || resultado.stdout, 400);
    const message = resultado.vencido
      ? "El cálculo de métricas tardó más de 5 minutos y se detuvo."
      : `El cálculo de métricas falló${detalle ? `: ${detalle}` : "."}`;
    return { ok: false, status: 500, code: "rondas.fallo", message };
  }
  const datos = await leerRondas();
  return {
    ok: true,
    resumen: {
      generado: datos.generado,
      rondas: datos.rondas.filter((r) => r.corridas.length).length,
      corridas: datos.rondas.reduce((n, r) => n + r.corridas.length, 0),
      salida: cola(resultado.stdout),
      estabilidad: resultado.estabilidad,
      ...(resultado.aviso ? { aviso: resultado.aviso } : {}),
    },
  };
}
