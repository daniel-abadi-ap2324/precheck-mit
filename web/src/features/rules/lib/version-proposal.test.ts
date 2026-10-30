import { describe, expect, it } from "vitest";
import { versionProposalSchema } from "./version-proposal";

const valid = {
  description: "El número de pisos no excede la altura máxima.",
  operator: "<=",
  value: "40",
  unit: "pisos",
  validFrom: "2026-10-01",
  reason: "Corrección tras revisión de la ficha RM-2.",
  norma: "Anexo 4 PLOT",
  article: "Ficha RM-2",
  quote: "Altura máxima: 40 pisos",
};

const errorsFor = (input: Record<string, unknown>) => {
  const r = versionProposalSchema.safeParse(input);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("versionProposalSchema", () => {
  it("acepta una propuesta con fuente completa", () => {
    expect(versionProposalSchema.safeParse(valid).success).toBe(true);
  });

  it("exige norma, artículo y cita literal (ninguna conclusión sin fuente)", () => {
    const errors = errorsFor({ ...valid, norma: " ", article: "", quote: "" });
    expect(errors.norma).toBe("Indique la norma de la que sale la regla.");
    expect(errors.article).toBe("Indique el artículo o la sección de la norma.");
    expect(errors.quote).toBe("Copie la cita literal de la norma.");
  });

  it("rechaza la propuesta si falta cualquiera de los campos de fuente", () => {
    for (const field of ["norma", "article", "quote"] as const) {
      const rest: Record<string, unknown> = { ...valid };
      delete rest[field];
      expect(versionProposalSchema.safeParse(rest).success, field).toBe(false);
    }
  });
});
