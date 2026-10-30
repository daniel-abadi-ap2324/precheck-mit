import { describe, expect, it } from "vitest";
import { formatFromName, projectInfoSchema } from "./project";

describe("formatFromName", () => {
  it("toma el formato de la extensión", () => {
    expect(formatFromName("A-101_planta.pdf")).toBe("PDF");
    expect(formatFromName("modelo.IFC")).toBe("IFC");
  });
  it("un nombre sin extensión no se acepta aunque coincida con un formato", () => {
    for (const n of ["pdf", "DWG", ".pdf", "plano."]) expect(formatFromName(n)).toBeNull();
  });
});

describe("ID de propiedad", () => {
  const datos = { name: "Proyecto", finca: "07081", address: "Calle 17", corregimiento: "Betania", projectType: "Residencial multifamiliar", applicant: "Test User" };
  it("es opcional (un lote dibujado no tiene ID de catastro) pero, si se escribe, con formato PAR-000000", () => {
    expect(projectInfoSchema.safeParse({ ...datos, propertyId: "" }).success).toBe(true);
    expect(projectInfoSchema.safeParse({ ...datos, propertyId: "PAR-081400" }).success).toBe(true);
    expect(projectInfoSchema.safeParse({ ...datos, propertyId: "81400" }).success).toBe(false);
  });
});
