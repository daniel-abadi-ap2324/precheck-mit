import { describe, expect, it } from "vitest";
import type { ComplianceResult, ComplianceRule } from "@/types";
import { aplicarAlLote, indiceDeCumplimiento, LOTE_DEPENDIENTES } from "./aplicabilidad";

const regla = (id: string, zoning: string | null) => ({ id, zoning }) as ComplianceRule;
const res = (ruleId: string, status: ComplianceResult["status"], official = true): ComplianceResult => ({ ruleId, status, official, explanation: "calculado" });
const REGLAS = [regla("PLOT-RM-2-DENSIDAD", "RM-2"), regla("PLOT-RM-2-ALTURA", "RM-2"), regla("ACUERDO-110-ACCESIBILIDAD", null), regla("A110-AIV-AREA-LOTE", null)];
const RESULTADOS = [res("PLOT-RM-2-DENSIDAD", "PASS"), res("PLOT-RM-2-ALTURA", "FAIL"), res("ACUERDO-110-ACCESIBILIDAD", "PASS"), res("A110-AIV-AREA-LOTE", "PASS")];

describe("aplicarAlLote", () => {
  it("en un lote con la misma ficha los resultados no cambian", () => {
    expect(aplicarAlLote(RESULTADOS, REGLAS, { id: "PAR-081400", zoningCode: "RM-2", normaZona: "ficha" })).toEqual(RESULTADOS);
  });

  it("en un lote de otra zona, los resultados de reglas de zona pasan a revisión, no oficiales y con el motivo", () => {
    const out = aplicarAlLote(RESULTADOS, REGLAS, { id: "PAR-081400", zoningCode: "ZM7", normaZona: "ficha" });
    expect(out.slice(0, 2).map((r) => [r.status, r.official])).toEqual([["MANUAL_REVIEW", false], ["MANUAL_REVIEW", false]]);
    expect(out[0].explanation).toBe("Resultado de demostración calculado para la zona RM-2; la zona de este lote es ZM7: requiere revisión.");
    expect(out[2]).toEqual(RESULTADOS[2]);
  });

  it("si la zona del lote está en revisión (MIVIOT, sin código único…), también", () => {
    const out = aplicarAlLote(RESULTADOS, REGLAS, { id: "PAR-081400", zoningCode: "", normaZona: "revision" });
    expect(out[0].status).toBe("MANUAL_REVIEW");
    expect(out[0].explanation).toBe("Resultado de demostración calculado para la zona RM-2; la zona de este lote requiere revisión.");
  });
});

describe("reglas que dependen del lote (finca, área, frente)", () => {
  it("en otro lote pasan a revisión aunque la zona coincida", () => {
    const out = aplicarAlLote(RESULTADOS, REGLAS, { id: "DECL-0001", zoningCode: "RM-2", normaZona: "ficha" });
    const area = out.find((r) => r.ruleId === "A110-AIV-AREA-LOTE");
    expect([area?.status, area?.official]).toEqual(["MANUAL_REVIEW", false]);
    expect(area?.explanation).toBe("Resultado de demostración calculado con los datos del lote PAR-081400; este proyecto está en el lote DECL-0001: requiere revisión.");
    expect(out.find((r) => r.ruleId === "ACUERDO-110-ACCESIBILIDAD")?.status).toBe("PASS");
    expect(LOTE_DEPENDIENTES).toEqual(expect.arrayContaining(["A110-AIV-FINCA-COINCIDE", "A110-AIV-AREA-LOTE", "A110-PDC-ACERA-LONGITUD"]));
  });
});

describe("indiceDeCumplimiento", () => {
  it("es cumple / evaluadas (como en el informe: sin contar «no aplica»), redondeado", () => {
    expect(indiceDeCumplimiento([res("a", "PASS"), res("b", "FAIL"), res("c", "PASS"), res("d", "MANUAL_REVIEW"), res("e", "NOT_APPLICABLE")])).toBe(50);
    expect(indiceDeCumplimiento([res("d", "MANUAL_REVIEW")])).toBe(0);
    expect(indiceDeCumplimiento([res("e", "NOT_APPLICABLE")])).toBeUndefined();
  });
});
