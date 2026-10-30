import { describe, expect, it } from "vitest";
import type { Project } from "@/types";
import { ultimaPorModelo } from "./conclusiones-modelos";

const p = (name: string, updatedAt = "2026-10-14T00:00:00Z"): Project => ({ id: name, name, updatedAt, status: "REVIEW_REQUIRED", precheckId: `pck-${name}` }) as Project;

describe("ultimaPorModelo", () => {
  it("toma por modelo la prueba de ronda más alta, deja fuera las manuales y ordena Sonnet, Opus…", () => {
    const r = ultimaPorModelo([
      p("Bella Vista - prueba 43 con Opus 5.5"),
      p("Bella Vista - prueba 45 con Sonnet 5.5"),
      p("Bella Vista - prueba 44 con Sonnet 5.5"),
      p("Bella Vista - prueba con Opus 5.5"),
      p("Bella Vista - manual (RLA-0000-6)"),
    ]);
    expect(r.map((x) => [x.modelo, x.ronda])).toEqual([
      ["Sonnet 5.5", 45],
      ["Opus 5.5", 43],
    ]);
  });
});
