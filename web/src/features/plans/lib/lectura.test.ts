import { describe, expect, it } from "vitest";
import type { PlanExtraction, PlanFact } from "@/types";
import { contrastar, describirFuente, filasDeHechos, REQUISITOS, resumenPaginas } from "./lectura";

const hecho = (h: Partial<PlanFact> & Pick<PlanFact, "hecho">): PlanFact => ({ valor: null, confianza: 0.99, estado: "ok", fuente: { metodo: "pdf_texto", pagina: 1, bbox: [0, 0, 1, 1] }, ...h });
const extraccion = (hechos: PlanFact[], paginas: Partial<PlanExtraction["paginas"][number]>[] = []): PlanExtraction => ({
  formato: "1.0.0",
  documento: "plano.pdf",
  sha256: "x",
  escalas: [100, 5000],
  requisitos_anexo_iv: [],
  hechos,
  paginas: paginas.map((p, i) => ({ numero: i + 1, tipo: "vectorial", ancho_mm: 914, alto_mm: 610, lineas: 10, miniatura: `p${i + 1}.png`, lamina: { codigo: null, titulo: null, escala: null, hoja: null, total_hojas: null }, ...p })),
});

describe("lectura del plano", () => {
  it("describe la procedencia: método, página y confianza", () => {
    expect(describirFuente(hecho({ hecho: "lote.area_m2", valor: 727.54, confianza: 0.99 }))).toBe("Texto del PDF · página 1 · confianza 99 %");
    expect(describirFuente(hecho({ hecho: "lote.area_m2", fuente: { metodo: "ocr", pagina: 3, bbox: [0, 0, 1, 1] }, confianza: 0.72 }))).toBe("OCR (lámina escaneada) · página 3 · confianza 72 %");
  });

  it("filas legibles: valor con unidad, candidatos en revisión y ausencia sin afirmar incumplimiento", () => {
    const filas = filasDeHechos(
      extraccion([
        hecho({ hecho: "lote.area_m2", valor: 2980 }),
        hecho({ hecho: "lote.finca", valor: null, estado: "revision", candidatos: ["071091", "071122"] }),
        hecho({ hecho: "lote.corregimiento", valor: null, estado: "no_encontrado", fuente: null }),
        hecho({ hecho: "plano.zonificacion_declarada", valor: "1ZM6" }),
      ]),
    );
    expect(filas.map((f) => [f.etiqueta, f.valor, f.estado])).toEqual([
      ["Área del lote", "2,980 m²", "ok"],
      ["Finca", "Varias: 071091, 071122", "revision"],
      ["Corregimiento", "No se encontró en el plano", "no_encontrado"],
      ["Zonificación declarada", "1ZM6", "ok"],
    ]);
  });

  it("datos medidos del dibujo: unidad, candidatos «16 o 15», nota y procedencia geométrica", () => {
    const geo = { metodo: "pdf_geometria" as const, pagina: 2, bbox: [0, 0, 1, 1] as [number, number, number, number] };
    const filas = filasDeHechos(
      extraccion([
        hecho({ hecho: "proyecto.pisos_totales", estado: "revision", candidatos: [16, 15], confianza: 0.6, nota: "Art. 38" }),
        hecho({ hecho: "lote.frente_m", valor: 26.02, fuente: geo, confianza: 0.8 }),
        hecho({ hecho: "lote.area_geometrica_m2", valor: 725.45, fuente: geo, confianza: 0.9 }),
        hecho({ hecho: "proyecto.unidades_vivienda", valor: 72 }),
        hecho({ hecho: "proyecto.densidad_pers_ha", estado: "no_encontrado", fuente: null, confianza: 0.5 }),
      ]),
    );
    expect(filas.map((f) => [f.etiqueta, f.valor])).toEqual([
      ["Pisos", "16 o 15"],
      ["Frente del lote", "26.02 m"],
      ["Área del lote medida en el dibujo", "725.45 m²"],
      ["Unidades de vivienda", "72"],
      ["Densidad", "No se encontró en el plano"],
    ]);
    expect(filas[0].nota).toBe("Art. 38");
    expect(filas[1].fuente).toBe("Geometría del PDF · página 2 · confianza 80 %");
  });

  it("resume las láminas: vectoriales y escaneadas", () => {
    expect(resumenPaginas(extraccion([], [{ tipo: "vectorial" }, { tipo: "escaneada" }, { tipo: "escaneada" }]))).toBe("3 láminas · 1 con texto del PDF · 2 escaneadas (OCR)");
    expect(resumenPaginas(extraccion([], [{ tipo: "vectorial" }]))).toBe("1 lámina · con texto del PDF");
  });

  it("los requisitos del Anexo IV tienen nombre legible", () => {
    expect(REQUISITOS.localizacion_regional).toBe("Localización regional");
    expect(REQUISITOS.cuadro_de_areas).toBe("Cuadro de áreas");
  });
});

describe("contraste con el expediente", () => {
  it("compara corregimiento, área y zona; lo que el plano no trae no se da por bueno ni por malo", () => {
    const ext = extraccion([
      hecho({ hecho: "lote.area_m2", valor: 960 }),
      hecho({ hecho: "lote.corregimiento", valor: "San Francisco" }),
      hecho({ hecho: "plano.zonificacion_declarada", valor: "1RM-2" }),
    ]);
    const c = contrastar(ext, { corregimiento: "Betania", zona: "RM-2", areaM2: 960 });
    expect(c.map((x) => [x.dato, x.coincide])).toEqual([
      ["Corregimiento", false],
      ["Área del lote", true],
      ["Zona", true],
    ]);
    const sinDatos = contrastar(extraccion([hecho({ hecho: "lote.area_m2", valor: null, estado: "no_encontrado" })]), { corregimiento: "Betania", zona: "RM-2", areaM2: 960 });
    expect(sinDatos.every((x) => x.coincide === null)).toBe(true);
  });

  it("el área coincide con una tolerancia del 1 % (la misma de la regla del Anexo IV)", () => {
    const ext = extraccion([hecho({ hecho: "lote.area_m2", valor: 969 })]);
    expect(contrastar(ext, { areaM2: 960 }).find((x) => x.dato === "Área del lote")?.coincide).toBe(true);
    expect(contrastar(extraccion([hecho({ hecho: "lote.area_m2", valor: 980 })]), { areaM2: 960 }).find((x) => x.dato === "Área del lote")?.coincide).toBe(false);
  });
});
