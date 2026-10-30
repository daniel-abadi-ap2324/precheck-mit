import { describe, expect, it } from "vitest";
import { tipoLegible } from "./revisar";

describe("tipoLegible", () => {
  it("dice a la IA cómo escribir cada dato: número, sí/no o un texto de los que compara la regla", () => {
    expect(tipoLegible({ tipo: "numero" })).toBe("número");
    expect(tipoLegible({ tipo: "bool" })).toBe("sí/no");
    expect(tipoLegible({ tipo: "texto", valores: ["arquitectura"] })).toBe('texto, no sí/no (las reglas lo comparan escrito así: "arquitectura")');
    expect(tipoLegible({ tipo: "texto" })).toBe("texto, no sí/no");
  });

  it("con lista cerrada pide solo uno de sus valores (ADR-0019: «TERCER ORDEN» no es «tercer»)", () => {
    expect(tipoLegible({ tipo: "texto", valores: ["primer", "tercer"], cerrada: true })).toBe('texto, solo uno de: "primer", "tercer" (esa palabra sola, sin otras)');
  });
});
