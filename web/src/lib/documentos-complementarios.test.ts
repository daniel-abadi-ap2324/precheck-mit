import { describe, expect, it } from "vitest";
import type { PlanFact } from "@/types";
import { completarConDocumentos } from "./documentos-complementarios";
import { datosSinConfirmar } from "./barrera-precheck";

const h = (hecho: string, valor: string | number | null, extra: Partial<PlanFact> = {}): PlanFact => ({
  hecho,
  valor,
  confianza: 0.9,
  estado: "ok",
  fuente: { metodo: "pdf_texto", pagina: 1, bbox: [0, 0, 1, 1] },
  ...extra,
});

describe("completarConDocumentos", () => {
  it("toma del documento lo que el plano no trae y dice de dónde salió", () => {
    const r = completarConDocumentos([h("lote.finca", "078850")], [{ nombre: "Memoria.pdf", hechos: [h("lote.area_m2", 733.14)] }]);
    const area = r.find((x) => x.hecho === "lote.area_m2");
    expect(area).toMatchObject({ valor: 733.14, documento: "Memoria.pdf" });
    expect(area?.nota).toMatch(/Memoria\.pdf/);
  });

  it("reemplaza un dato dudoso del plano, pero no uno comprobado ni uno que confirmó la persona", () => {
    const plano = [
      h("lote.area_m2", 133.14, { estado: "revision", confianza: 0.6 }),
      h("lote.finca", "078850"),
      h("plano.zonificacion_declarada", "RM1", { confianza: 0.6, confirmado: true }),
    ];
    const doc = { nombre: "Cuadro.pdf", hechos: [h("lote.area_m2", 733.14), h("lote.finca", "044444", { confianza: 0.99 }), h("plano.zonificacion_declarada", "RM2", { confianza: 0.99 })] };
    const r = completarConDocumentos(plano, [doc]);
    expect(r.find((x) => x.hecho === "lote.area_m2")).toMatchObject({ valor: 733.14, documento: "Cuadro.pdf" });
    expect(r.find((x) => x.hecho === "lote.area_m2")?.nota).toMatch(/el plano decía 133\.14/);
    expect(r.find((x) => x.hecho === "lote.finca")?.valor).toBe("078850");
    expect(r.find((x) => x.hecho === "plano.zonificacion_declarada")?.valor).toBe("RM1");
  });

  it("un dato dudoso del documento no reemplaza nada", () => {
    const r = completarConDocumentos([], [{ nombre: "Carta.pdf", hechos: [h("lote.area_m2", 1, { estado: "revision", confianza: 0.5 })] }]);
    expect(r).toEqual([]);
  });

  it("con el documento, lo que faltaba deja de bloquear la ejecución", () => {
    const plano = [h("lote.finca", "078850"), h("plano.zonificacion_declarada", "RM1")];
    expect(datosSinConfirmar(plano)).toEqual(["el área del lote"]);
    expect(datosSinConfirmar(completarConDocumentos(plano, [{ nombre: "Memoria.pdf", hechos: [h("lote.area_m2", 733.14)] }]))).toEqual([]);
  });
});
