import { spawn } from "node:child_process";
import type { AvisoDato } from "@/services/planos/cliente";
import { error, sinSesion } from "@/server/planos/respuestas";
import { partirComando, PYTHON, REPO } from "@/server/planos/procesar";

const LIMITE_MS = 20_000;
const sinCache = { "Cache-Control": "private, no-store" };

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Validación corta de los datos del usuario (precheck.planos.validar_datos): sin IA ni cuota, tarda menos de un segundo. */
export async function POST(request: Request) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const c = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const entrada = {
    zona: texto(c?.zona, 40),
    norma: texto(c?.norma, 60),
    finca: texto(c?.finca, 40),
    corregimiento: texto(c?.corregimiento, 80),
    ...(typeof c?.area_m2 === "number" && Number.isFinite(c.area_m2) ? { area_m2: c.area_m2 } : {}),
  };
  const propio = partirComando(process.env.VALIDAR_DATOS_COMANDO);
  const [bin, args] = propio?.length ? [propio[0], propio.slice(1)] : [PYTHON, ["-m", "precheck.planos.validar_datos"]];
  const salida = await new Promise<string | null>((ok) => {
    const p = spawn(/* turbopackIgnore: true */ bin, args, { cwd: REPO, stdio: ["pipe", "pipe", "ignore"] });
    let buf = "";
    const reloj = setTimeout(() => p.kill("SIGKILL"), LIMITE_MS);
    p.stdout.on("data", (d) => (buf += d));
    p.on("error", () => ok(null));
    p.on("close", (code) => {
      clearTimeout(reloj);
      ok(code === 0 ? buf : null);
    });
    p.stdin.end(JSON.stringify(entrada));
  });
  if (salida === null) return error(500, "validar.fallo", "No se pudieron validar los datos.");
  try {
    return Response.json(JSON.parse(salida) as { avisos: AvisoDato[] }, { headers: sinCache });
  } catch {
    return error(500, "validar.fallo", "No se pudieron validar los datos.");
  }
}
