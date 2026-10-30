import { describe, expect, it } from "vitest";
import { pdfDeLaDpu, rutaInterna } from "./safe-url";

describe("rutaInterna (destino tras el login)", () => {
  it("acepta rutas de la propia aplicación", () => {
    expect(rutaInterna("/projects/prj-betania-01?tab=plans")).toBe("/projects/prj-betania-01?tab=plans");
  });
  it("rechaza destinos que el navegador trata como otro sitio", () => {
    for (const malo of ["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "", null, "dashboard"]) {
      expect(rutaInterna(malo)).toBeNull();
    }
  });
});

describe("pdfDeLaDpu", () => {
  it("solo deja pasar PDF por https de dpu.mupa.gob.pa", () => {
    expect(pdfDeLaDpu("https://dpu.mupa.gob.pa/wp-content/uploads/2025/03/10-3B.pdf")).toBe("https://dpu.mupa.gob.pa/wp-content/uploads/2025/03/10-3B.pdf");
    for (const malo of ["http://dpu.mupa.gob.pa/x.pdf", "https://dpu.mupa.gob.pa.evil.example/x.pdf", "https://evil.example/dpu.mupa.gob.pa", "data:text/html,x", null, undefined, "nada"]) {
      expect(pdfDeLaDpu(malo)).toBeNull();
    }
  });
});
