import { describe, expect, it } from "vitest";
import { calcularPendientes, clasificarMotivo, mensajeDeSegundaPasada } from "./pendientes";

const R = (regla_id: string, motivo: string, extra: object = {}) => ({ regla_id, resultado: "REQUIERE_REVISION", motivo, ...extra });

describe("clasificarMotivo (textos reales del motor)", () => {
  it("reconoce lo que se arregla escribiendo datos y saca la clave", () => {
    expect(clasificarMotivo(R("A", "dato faltante: proyecto.altura_m"))).toEqual({ clase: "escribible", claves: ["proyecto.altura_m"] });
    expect(clasificarMotivo(R("A", "no se puede determinar si aplica: falta lote.frente_m"))).toEqual({ clase: "escribible", claves: ["lote.frente_m"] });
    expect(clasificarMotivo(R("A", "la confianza de proyecto.pisos_totales (0.70) está bajo el mínimo 0.85"))).toEqual({ clase: "escribible", claves: ["proyecto.pisos_totales"] });
    expect(clasificarMotivo(R("A", "no se puede determinar si aplica: la confianza de lote.a (0.80) está bajo el mínimo 0.85; la confianza de proyecto.b (0.60) está bajo el mínimo 0.85")).claves).toEqual(["lote.a", "proyecto.b"]);
  });

  it("separa lo que NO se arregla con datos", () => {
    expect(clasificarMotivo(R("A", "regla de criterio: requiere juicio del revisor")).clase).toBe("criterio");
    expect(clasificarMotivo(R("A", "valor dentro de la tolerancia (0.5) del límite")).clase).toBe("tolerancia");
    expect(clasificarMotivo(R("A", "error al evaluar la regla: división por cero")).clase).toBe("error");
    // La zona por confirmar manda sobre el texto del motivo, aunque mencione la confianza del sector.
    expect(clasificarMotivo(R("A", "no se puede determinar si aplica: la confianza de lote.sf_sector (0.80) está bajo el mínimo 0.85", { grupo: "zona_por_confirmar" })).clase).toBe("zona");
    expect(clasificarMotivo(R("A", "x", { motivo_tipo: "zona_por_confirmar" })).clase).toBe("zona");
  });

  it("no pide a la IA los datos que fija el trámite, el usuario o el expediente", () => {
    expect(clasificarMotivo(R("A", "dato faltante: expediente.requiere_bcbrp")).clase).toBe("otro");
    expect(clasificarMotivo(R("A", "dato faltante: lote.codigo_zona")).clase).toBe("otro");
    expect(clasificarMotivo(R("A", "dato faltante: tramite")).clase).toBe("otro");
  });
});

describe("calcularPendientes y el mensaje de la segunda pasada", () => {
  const resultado = {
    resultados: [
      R("R-1", "dato faltante: proyecto.altura_m"),
      R("R-2", "dato faltante: proyecto.altura_m"),
      R("R-3", "la confianza de proyecto.pisos_totales (0.70) está bajo el mínimo 0.85"),
      R("R-4", "regla de criterio: requiere juicio del revisor"),
      R("R-5", "x", { grupo: "zona_por_confirmar" }),
      { regla_id: "R-6", resultado: "CUMPLE", motivo: "dato faltante: nunca" },
    ],
  };

  it("agrupa por dato, ordena por reglas afectadas y cuenta lo no escribible aparte", () => {
    const p = calcularPendientes(resultado);
    expect(p.datos.map((d) => [d.clave, d.reglas])).toEqual([["proyecto.altura_m", ["R-1", "R-2"]], ["proyecto.pisos_totales", ["R-3"]]]);
    expect(p.noEscribibles).toEqual({ criterio: 1, tolerancia: 0, zona: 1, error: 0, otro: 0 });
  });

  it("sin resultado o sin reglas en revisión no hay pendientes", () => {
    expect(calcularPendientes(null).datos).toEqual([]);
    expect(calcularPendientes({ resultados: [{ regla_id: "R", resultado: "CUMPLE" }] }).datos).toEqual([]);
  });

  it("el mensaje nombra cada dato con su motivo, repite la regla de confianza y limita la lista", () => {
    const m = mensajeDeSegundaPasada(calcularPendientes(resultado));
    expect(m).toContain("Segunda pasada dirigida");
    expect(m).toContain("- proyecto.altura_m (2 reglas): dato faltante: proyecto.altura_m");
    expect(m).toContain("Amplía la lámina pertinente a 150 ppp");
    expect(m).toContain("confianza 0.6 o menos solo si la zona es ilegible");
    // Con criterios, cada dato pendiente lleva el suyo para que el modelo no repita el mismo «no» dudoso.
    const conCriterio = mensajeDeSegundaPasada(calcularPendientes(resultado), 40, new Map([["proyecto.altura_m", "número: altura CRITERIO: mide hasta el remate"]]));
    expect(conCriterio).toContain("- proyecto.altura_m (2 reglas): dato faltante: proyecto.altura_m — CRITERIO: mide hasta el remate");
    const muchos = { resultados: Array.from({ length: 50 }, (_, i) => R(`R-${i}`, `dato faltante: proyecto.d${String(i).padStart(2, "0")}`)) };
    const corto = mensajeDeSegundaPasada(calcularPendientes(muchos), 5);
    expect(corto.match(/^- proyecto\.d/gm)).toHaveLength(5);
    expect(corto).toContain("y 45 más");
  });
});
