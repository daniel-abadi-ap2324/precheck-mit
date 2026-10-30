import { describe, expect, it } from "vitest";
import { etiquetaZona, mensajeSinFicha, PARAMETRO_EN_REVISION } from "./norma-zona";

describe("mensajeSinFicha", () => {
  it("explica por qué no hay ficha y que va a revisión, sin sugerir otra ficha", () => {
    expect(mensajeSinFicha("ficha_no_cargada", "R4")).toBe("La ficha R4 del PLOT no está cargada: los parámetros de la zona requieren revisión.");
    expect(mensajeSinFicha("miviot", "MP-C2")).toBe("Zona MP-C2 con norma del MIVIOT, no cargada: los parámetros de la zona requieren revisión.");
    expect(mensajeSinFicha("anexo5", "3H-R")).toBe("Suelo 3H-R del Anexo 5 (matriz de usos), no cargado: los parámetros de la zona requieren revisión.");
    expect(mensajeSinFicha("revision", "Sin código único")).toBe("El lote cae en un polígono sin código único en el Documento Gráfico: la zona requiere revisión.");
    expect(mensajeSinFicha("ficha", "RM-2")).toBeNull();
    expect(PARAMETRO_EN_REVISION).toBe("Requiere revisión");
  });
});

describe("etiquetaZona", () => {
  it("un lote sin zona determinada no muestra un texto como si fuera un código", () => {
    expect(etiquetaZona("RM-2")).toBe("Zona RM-2");
    expect(etiquetaZona("")).toBe("Zona por revisar");
    expect(etiquetaZona(null)).toBe("Zona por revisar");
  });
});
