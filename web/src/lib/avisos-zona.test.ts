import { describe, expect, it } from "vitest";
import { esAvisoDeZona, textoAvisoDeZona } from "./avisos-zona";

describe("avisos de zona", () => {
  it("reconoce la discrepancia y el código inexistente, y no otros avisos", () => {
    expect(esAvisoDeZona("ZONA_DISCREPANTE: la zona usada ('R2', calculo) difiere de la que declara el plano ('R2-A').")).toBe(true);
    expect(esAvisoDeZona("El código de zona 'MP-C2' no existe en la norma PLOT-A61-2021 (no aparece en ningún aplica_si).")).toBe(true);
    expect(esAvisoDeZona("DATO_DUDOSO: proyecto.altura_m = 0")).toBe(false);
  });

  it("quita el prefijo técnico", () => {
    expect(textoAvisoDeZona("ZONA_DISCREPANTE: la zona usada ('R2') difiere.")).toBe("La zona usada ('R2') difiere.");
  });
});

describe("avisos en lenguaje llano (ADR-0016)", () => {
  it("la zona de trabajo cuenta como aviso de zona y ningún aviso conserva el prefijo técnico", async () => {
    const { textoDeAviso } = await import("./avisos");
    expect(esAvisoDeZona("ZONA_TRABAJO: Zona 1R2, según un documento oficial; otras fuentes declaran R2-A.")).toBe(true);
    expect(textoDeAviso("ZONA_TRABAJO: zona 1R2, según un documento oficial.")).toBe("Zona 1R2, según un documento oficial.");
    expect(textoDeAviso("DATO_DUDOSO: algo")).toBe("Algo");
    expect(textoDeAviso("El código de zona 'RM3-C2' no existe en la norma X (no aparece en ningún aplica_si de sus reglas): se necesita la CEUS.")).toBe(
      "El código de zona 'RM3-C2' no existe en la norma X: se necesita la CEUS.",
    );
    expect(textoDeAviso("Falta lote.norma_aplicable: sin norma no se evalúa la zonificación.")).toBe("Falta la norma aplicable: sin norma no se evalúa la zonificación.");
  });

  it("la línea de las agrupadas dice qué falta cuando traen la decisión de respaldo del motor", async () => {
    const { resumenPorZona } = await import("./agrupar-zona");
    const viejo = { result: { group: "zona_por_confirmar" as const, status: "MANUAL_REVIEW" as const } };
    expect(resumenPorZona([viejo, viejo])).toEqual({ status: "MANUAL_REVIEW", texto: "2 reglas de otras zonas de la norma: dependen de confirmar el código de zona (CEUS). Siguen en «Requiere revisión»." });
    const nuevo = { result: { group: "zona_por_confirmar" as const, status: "WARNING" as const, dictamen: { decision: "OBSERVACION" as const, justificacion: "Depende de la zona del lote: falta la CEUS o la unidad territorial.", evidencia: [], origen: "motor" as const } } };
    expect(resumenPorZona([nuevo])).toEqual({ status: "WARNING", texto: "1 regla de otras zonas de la norma: depende de la zona del lote: falta la CEUS o la unidad territorial (información requerida)." });
  });
});
