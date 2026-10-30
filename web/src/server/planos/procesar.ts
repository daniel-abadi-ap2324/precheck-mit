import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { enCurso, encolar, esperar } from "@/server/trabajos";
import { entornoOcr } from "@/lib/lector-ocr";
import { carpetaDe, escribirEstado, leerEstado, type EstadoPlano } from "./almacen";

/**
 * Extracción con el módulo Python del núcleo (precheck/planos: texto del PDF u OCR con Tesseract). Una a la vez:
 * el OCR de una hoja escaneada ocupa un núcleo entero. PLANOS_EXTRACTOR permite otro comando (pruebas, backend).
 */
export const REPO = resolve(process.cwd(), "..");
/** PRECHECK_PYTHON, o el `.venv` del repositorio si existe, o el `python` del PATH. */
function pythonPorDefecto() {
  const venv = process.platform === "win32" ? join(REPO, ".venv", "Scripts", "python.exe") : join(REPO, ".venv", "bin", "python");
  if (existsSync(/* turbopackIgnore: true */ venv)) return venv;
  return process.platform === "win32" ? "python" : "python3";
}
export const PYTHON = process.env.PRECHECK_PYTHON ?? pythonPorDefecto();
const MENSAJE_FALLO = "No se pudo leer el plano. Verifique que el PDF no esté dañado ni protegido.";
/** Un plano grande escaneado puede tardar varios minutos; más que esto es un proceso colgado. */
const LIMITE_MS = 20 * 60_000;

/** Separa un comando por espacios, pero respeta las comillas dobles (rutas de Windows como «C:\Program Files\…»). */
export const partirComando = (texto: string | undefined) => texto?.match(/"[^"]*"|\S+/g)?.map((t) => t.replace(/^"|"$/g, ""));

function comando(pdf: string, salida: string): [string, string[]] {
  const propio = partirComando(process.env.PLANOS_EXTRACTOR);
  if (propio?.length) return [propio[0], [...propio.slice(1), pdf, "--salida", salida]];
  return [PYTHON, ["-m", "precheck.planos", pdf, "--salida", salida]];
}

function ejecutar(id: string, entorno: Record<string, string>): Promise<boolean> {
  const dir = carpetaDe(id);
  const [bin, args] = comando(join(dir, "original.pdf"), dir);
  return new Promise((ok) => {
    const p = spawn(/* turbopackIgnore: true */ bin, args, { cwd: REPO, env: { ...process.env, ...entorno }, stdio: ["ignore", "ignore", "pipe"] });
    const reloj = setTimeout(() => p.kill("SIGKILL"), LIMITE_MS);
    p.on("error", () => ok(false));
    p.on("close", (code) => {
      clearTimeout(reloj);
      ok(code === 0);
    });
  });
}

/** Encola la extracción de un plano ya guardado; el estado pasa por processing → ready | failed. */
export function encolarExtraccion(id: string): void {
  encolar("planos", `plano:${id}`, async () => {
    const { ocr } = await escribirEstado(id, { status: "processing" });
    const ok = await ejecutar(id, entornoOcr(ocr));
    // La propuesta se encola antes de marcar el plano «listo»: así, cuando la interfaz monta las regiones, ya ve
    // «proponiendo» y consulta hasta que terminen (con «sin regiones» a secas no volvería a consultar). Import dinámico
    // porque regiones.ts importa de este módulo; si algo falla, el plano igual queda leído.
    if (ok) await import("./regiones").then((m) => m.proponerRegionesSiFaltan(id)).catch(() => undefined);
    await escribirEstado(id, ok ? { status: "ready", error: undefined } : { status: "failed", error: MENSAJE_FALLO });
  });
}

/**
 * Estado de un plano. Si quedó «en cola» o «leyendo» pero ya no hay lectura en curso (el servidor se reinició), se
 * vuelve a encolar: el PDF original sigue en su carpeta.
 */
export async function estadoVigente(id: string): Promise<EstadoPlano> {
  const estado = await leerEstado(id);
  if ((estado.status === "queued" || estado.status === "processing") && !enCurso(`plano:${id}`)) {
    encolarExtraccion(id);
    return { ...estado, status: "queued" };
  }
  return estado;
}

/** Para pruebas: espera a que la cola termine. */
export const esperarCola = () => esperar("planos");
