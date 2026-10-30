import { describe, expect, it } from "vitest";
import type { CorridaEstable, RespuestaRondas } from "@/services/rondas/tipos";
import type { Project } from "@/types";
import { revisionesDe } from "./model-comparison";

const p = (name: string): Project => ({ id: name, name, updatedAt: "2026-10-14T00:00:00Z", status: "REVIEW_REQUIRED", precheckId: `pck-${name}` }) as Project;
const estable = (projectId: string, nivel: CorridaEstable["nivel"]) => ({ projectId, nivel, superficial: false, motivos: [] }) as unknown as CorridaEstable;
const DATOS = {
  rondas: [
    { ronda: 43, grupo: "r43-45", etapa: "comparativa" },
    { ronda: 44, grupo: "r43-45", etapa: "comparativa" },
    { ronda: 59, grupo: "r59", etapa: "deepseek" },
  ],
  grupos: [
    { id: "r43-45", rondas: [43, 44, 45], titulo: "Comparar los cinco modelos", agrupada: true },
    { id: "r59", rondas: [59], titulo: "Ronda 59", agrupada: false },
  ],
  estabilidad: { generado: "", sinLeer: 0, planos: [{ corridas: [estable("Casco - prueba 44 con Opus 5.5", "rarisimo")] }] },
} as unknown as RespuestaRondas;

describe("revisionesDe", () => {
  it("numera 1, 2, 3… por plano, grupo y modelo, en orden de ronda y repetición, con su grupo, etapa y clasificación", () => {
    const r = revisionesDe(
      [
        p("Casco - prueba 44 con Opus 5.5"),
        p("Casco - prueba 43 con Opus 5.5 (2)"),
        p("Casco - prueba 43 con Opus 5.5"),
        p("Casco - prueba 43 con Sonnet 5.5"),
        p("Casco - prueba 59 con Opus 5.5"),
        p("Tocumen - prueba 43 con Opus 5.5"),
        p("Casco - manual 1"),
      ],
      DATOS,
    );
    const de = (n: string) => r.find((x) => x.proyecto.name === n);
    expect(de("Casco - prueba 43 con Opus 5.5")).toMatchObject({ numero: 1, repeticion: 1, ronda: 43, etapa: "comparativa", estable: null });
    expect(de("Casco - prueba 43 con Opus 5.5 (2)")).toMatchObject({ numero: 2, repeticion: 2 });
    expect(de("Casco - prueba 44 con Opus 5.5")).toMatchObject({ numero: 3, estable: { nivel: "rarisimo" } });
    expect(de("Casco - prueba 44 con Opus 5.5")?.grupo?.id).toBe("r43-45");
    // Otro modelo, otro grupo u otro plano empiezan de nuevo en 1.
    expect(de("Casco - prueba 43 con Sonnet 5.5")?.numero).toBe(1);
    expect(de("Casco - prueba 59 con Opus 5.5")).toMatchObject({ numero: 1, etapa: "deepseek" });
    expect(de("Tocumen - prueba 43 con Opus 5.5")?.numero).toBe(1);
    // Sin ronda en el nombre: sin grupo.
    expect(de("Casco - manual 1")).toMatchObject({ ronda: null, grupo: null, etapa: null });
  });

  it("sin datos de /rondas no hay grupo ni clasificación, pero sí la numeración", () => {
    const r = revisionesDe([p("Casco - prueba 43 con Opus 5.5"), p("Casco - prueba 43 con Opus 5.5 (2)")], undefined);
    expect(r.map((x) => [x.numero, x.grupo, x.estable])).toEqual([
      [1, null, null],
      [2, null, null],
    ]);
  });
});
