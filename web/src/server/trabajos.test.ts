// @vitest-environment node
import { describe, expect, it } from "vitest";
import { enCurso, enEspera, encolarLimitado, esperarPrefijo, estadoLimite } from "./trabajos";

/** Una tarea que se queda esperando hasta que el test la libera, y anota cuántas corren a la vez. */
function controlada(nombre: string, activas: { n: number; max: number }) {
  let liberar!: () => void;
  const libre = new Promise<void>((r) => (liberar = r));
  const tarea = async () => {
    activas.n += 1;
    activas.max = Math.max(activas.max, activas.n);
    await libre;
    activas.n -= 1;
  };
  return { nombre, tarea, liberar };
}
const turno = () => new Promise((r) => setTimeout(r, 5));

describe("encolarLimitado", () => {
  it("nunca corren más tareas del grupo que el máximo; las demás esperan turno y siguen «en curso»", async () => {
    const activas = { n: 0, max: 0 };
    const t = ["a", "b", "c", "d"].map((n) => controlada(n, activas));
    t.forEach((x) => encolarLimitado(`t:${x.nombre}`, `t:${x.nombre}`, "grupo-prueba", 2, x.tarea));
    await turno();
    expect(activas.n).toBe(2);
    expect(estadoLimite("grupo-prueba")).toEqual({ corriendo: 2, esperando: 2 });
    expect(t.map((x) => enEspera(`t:${x.nombre}`))).toEqual([false, false, true, true]);
    expect(t.every((x) => enCurso(`t:${x.nombre}`))).toBe(true);

    t[0].liberar();
    await turno();
    expect(activas.n).toBe(2);
    expect(enEspera("t:c")).toBe(false);
    expect(enEspera("t:d")).toBe(true);

    t.slice(1).forEach((x) => x.liberar());
    await esperarPrefijo("t:");
    expect(activas.max).toBe(2);
    expect(estadoLimite("grupo-prueba")).toEqual({ corriendo: 0, esperando: 0 });
    expect(t.some((x) => enCurso(`t:${x.nombre}`))).toBe(false);
  });

  it("una tarea que falla libera su lugar", async () => {
    encolarLimitado("f:1", "f:1", "grupo-falla", 1, async () => {
      throw new Error("falla");
    });
    let corrio = false;
    encolarLimitado("f:2", "f:2", "grupo-falla", 1, async () => {
      corrio = true;
    });
    await esperarPrefijo("f:");
    expect(corrio).toBe(true);
    expect(estadoLimite("grupo-falla").corriendo).toBe(0);
  });
});
