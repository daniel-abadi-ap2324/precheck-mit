import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/**
 * Revisión XTRA: varios agentes «empleados» revisan el mismo plano por separado, cada uno en su propia copia de la
 * carpeta del caso (xtra/empleado-<n>), y después un agente «maestro» lee lo que dijeron, verifica en el plano los
 * puntos en que no coinciden y escribe el dictamen final en la carpeta del caso. No se llama «corrida» para no
 * confundirla con las corridas de prueba de modelos (rondas).
 */
export const MAX_EMPLEADOS = 10;
export const CARPETA_XTRA = "xtra";

export interface PedidoXtra {
  empleados: number;
  modeloEmpleados: string;
}

/** Valida el pedido que llega del navegador; null si no es una revisión XTRA válida. */
export function leerPedidoXtra(v: unknown): PedidoXtra | null {
  if (!v || typeof v !== "object") return null;
  const { empleados, modeloEmpleados } = v as Record<string, unknown>;
  if (typeof empleados !== "number" || !Number.isInteger(empleados) || empleados < 1 || empleados > MAX_EMPLEADOS) return null;
  if (typeof modeloEmpleados !== "string" || !modeloEmpleados) return null;
  return { empleados, modeloEmpleados };
}

export const carpetaEmpleado = (dir: string, n: number) => join(/* turbopackIgnore: true */ dir, CARPETA_XTRA, `empleado-${n}`);

/** Lo que no se copia a la carpeta de un empleado: el estado, los registros, el dictamen y las carpetas de trabajo. */
const NO_COPIAR = /^(estado\.json|dictamen\.json|informe\.md|ia\.log\..*|xtra|tmp)$/;

/** Copia los archivos de la carpeta del caso (ya en su estado inicial) a la carpeta de un empleado. */
export async function prepararCarpetaEmpleado(dir: string, n: number): Promise<string> {
  const destino = carpetaEmpleado(dir, n);
  await rm(/* turbopackIgnore: true */ destino, { recursive: true, force: true });
  await mkdir(/* turbopackIgnore: true */ destino, { recursive: true });
  for (const e of await readdir(/* turbopackIgnore: true */ dir, { withFileTypes: true })) {
    if (!e.isFile() || NO_COPIAR.test(e.name)) continue;
    await copyFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, e.name), join(/* turbopackIgnore: true */ destino, e.name));
  }
  return destino;
}

/** Corre las tareas con un máximo a la vez; devuelve el resultado de cada una (sin cortar si alguna falla). */
export async function enGrupos<T>(tareas: (() => Promise<T>)[], maximo: number): Promise<PromiseSettledResult<T>[]> {
  const resultados: PromiseSettledResult<T>[] = new Array(tareas.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < tareas.length) {
      const i = siguiente++;
      try {
        resultados[i] = { status: "fulfilled", value: await tareas[i]() };
      } catch (e) {
        resultados[i] = { status: "rejected", reason: e };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(maximo, tareas.length)) }, trabajador));
  return resultados;
}

/** Instrucciones que se agregan al prompt del maestro. `listos`: números de los empleados que dejaron dictamen. */
export function instruccionesMaestro(dir: string, listos: number[], total: number): string[] {
  const carpetas = listos.map((n) => `\`${carpetaEmpleado(dir, n)}\``).join(", ");
  return [
    `- REVISIÓN XTRA: eres el AGENTE MAESTRO. Antes que tú, ${total} agentes empleados revisaron este mismo plano por separado y ${listos.length} terminaron. Sus carpetas: ${carpetas}. Cada una tiene su lote.json (los datos que escribió), su resultado.json (el motor con esos datos) y su dictamen.json.`,
    "- Excepción a la regla de independencia: SÍ debes leer esas carpetas de empleados (solo esas; ninguna otra revisión).",
    "- Tu trabajo: (1) compara dato por dato los lote.json de los empleados y decisión por decisión sus dictámenes; (2) lo que todos o casi todos dicen igual, adóptalo, pero si te parece raro compruébalo; (3) donde no coinciden, no votes a ciegas: ve tú al plano (amplía la lámina) y decide quién tiene razón; un solo empleado puede tener razón contra la mayoría; (4) busca lo que a todos se les pasó.",
    "- El resultado final es TUYO: escribe lote.json y dictamen.json en la carpeta del caso (no en las de los empleados), reevalúa con el motor como siempre y sigue todas las demás instrucciones.",
    "- En `supuestos` del dictamen agrega una línea por cada dato o decisión en que los empleados no coincidían: qué dijo cada uno (p. ej. «3 de 5 escribieron 0 y 2 escribieron 2.20») y qué decidiste tú y por qué.",
  ];
}
