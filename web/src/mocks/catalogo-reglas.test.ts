import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComplianceRule } from "@/types";
import { olvidarCatalogo } from "@/services/reglas/cliente";
import { mockClient } from "./adapter";

const REAL: ComplianceRule = {
  id: "PLOT-RM-2-DENSIDAD",
  version: 1,
  title: "RM-2: densidad máxima (catálogo real)",
  category: "density",
  zoning: "RM-2",
  description: "",
  operator: "<=",
  value: 1500,
  unit: "pers/ha",
  regulation: { id: "PLOT-RM-2-DENSIDAD", norma: "Anexo 4 PLOT", article: "Ficha RM-2", quote: "1,500 pers/ha" },
  state: "borrador",
  severity: "bloqueante",
  normaCode: "PLOT-A61-2021",
  normaLabel: "PLOT",
};

let responde = true;
beforeEach(() => {
  olvidarCatalogo();
  responde = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => (url === "/api/reglas" && responde ? Response.json({ items: [REAL] }) : new Response("{}", { status: 500 }))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  olvidarCatalogo();
});

describe("mockClient · catálogo de reglas", () => {
  it("listRules devuelve el catálogo real de /api/reglas", async () => {
    expect((await mockClient.listRules()).map((r) => r.title)).toEqual(["RM-2: densidad máxima (catálogo real)"]);
  });

  it("si la ruta no responde, usa las reglas de la demostración y lo vuelve a intentar después", async () => {
    responde = false;
    const demo = await mockClient.listRules();
    expect(demo.length).toBeGreaterThan(1);
    responde = true;
    expect(await mockClient.listRules()).toHaveLength(1);
  });

  it("el PreCheck de Betania lleva de respaldo solo las reglas de demostración que no están en el catálogo real", async () => {
    const pc = await mockClient.getPreCheck("pc-betania-01");
    const ids = new Set(pc.rules?.map((r) => r.id));
    expect(ids.has("PLOT-RM-2-DENSIDAD")).toBe(false);
    expect(ids.size).toBeGreaterThan(0);
    // Todo resultado tiene su regla: en el catálogo real o en el respaldo.
    expect(pc.results.filter((r) => r.ruleId !== REAL.id && !ids.has(r.ruleId))).toEqual([]);
  });
});
