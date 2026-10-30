import { describe, expect, it } from "vitest";
import { projectStatusMeta } from "./status";

describe("metadatos de estado", () => {
  it("ningún estado de proyecto se llama «aprobado»", () => {
    expect(Object.values(projectStatusMeta).map((m) => m.label.toLowerCase())).not.toContain("aprobado");
  });
});

describe("«No cumple · con supuesto» (ADR-0016)", () => {
  it("tiene tono e icono propios y gana a «falta en el plano»; sin NO_CUMPLE no cambia nada", async () => {
    const { complianceMeta, conSupuestoMeta, faltaEnPlanoMeta, metaDeResultado, toneClasses } = await import("./status");
    expect(metaDeResultado("FAIL", false, true)).toBe(conSupuestoMeta);
    expect(metaDeResultado("FAIL", true, true)).toBe(conSupuestoMeta);
    expect(metaDeResultado("FAIL", true)).toBe(faltaEnPlanoMeta);
    expect(metaDeResultado("PASS", false, true)).toBe(complianceMeta.PASS);
    expect(conSupuestoMeta.tone).not.toBe(complianceMeta.FAIL.tone);
    expect(conSupuestoMeta.tone).not.toBe(complianceMeta.WARNING.tone);
    expect(toneClasses[conSupuestoMeta.tone].text).toBe("text-supuesto");
  });
});
