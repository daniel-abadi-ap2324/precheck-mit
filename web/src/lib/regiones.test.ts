import { describe, expect, it } from "vitest";
import {
  aFraccion,
  agregarVertice,
  centroDe,
  colorDeTipo,
  confianzaDe,
  conteoPorTipo,
  ErrorRegiones,
  ladoMasCercano,
  MAX_REGIONES,
  MAX_VERTICES,
  moverVertice,
  nuevoIdRegion,
  puntoEnPoligono,
  quitarVertice,
  TIPOS_REGION,
  validarRegionesPlano,
  type Punto,
} from "./regiones";

const CUADRADO: Punto[] = [
  [0.1, 0.1],
  [0.3, 0.1],
  [0.3, 0.3],
  [0.1, 0.3],
];
const region = (extra: Record<string, unknown> = {}) => ({
  id: "r-1",
  pagina: 1,
  tipo: "estacionamiento",
  puntos: CUADRADO,
  origen: "vectorial",
  confianza: 0.7,
  etiqueta: "",
  confirmada: false,
  editada: false,
  ...extra,
});
const doc = (regiones: unknown[], paginas: unknown = { "1": { imagen: "r1.png", ancho_px: 2400, alto_px: 1600, ancho_mm: 914.4, alto_mm: 609.6, escala: 200 } }) => ({
  version: 1,
  generado: "2026-10-09T12:00:00Z",
  paginas,
  regiones,
});

describe("tabla de tipos", () => {
  it("tiene los 12 tipos del contrato con su color exacto", () => {
    expect(TIPOS_REGION.map((t) => t.tipo)).toEqual([
      "lote",
      "huella",
      "retiro_frontal",
      "retiro_lateral",
      "retiro_posterior",
      "estacionamiento",
      "acera",
      "area_verde",
      "tinaquera",
      "acceso_vehicular",
      "escalera_rampa",
      "otro",
    ]);
    expect(colorDeTipo("lote")).toBe("#2563eb");
    expect(colorDeTipo("escalera_rampa")).toBe("#db2777");
  });

  it("la confianza sigue el contrato y nunca llega al umbral del motor", () => {
    expect(confianzaDe({ confirmada: true, editada: false, origen: "vision" })).toBe(0.8);
    expect(confianzaDe({ confirmada: false, editada: true, origen: "vision" })).toBe(0.7);
    expect(confianzaDe({ confirmada: false, editada: false, origen: "humano" })).toBe(0.7);
    expect(confianzaDe({ confirmada: false, editada: false, origen: "vectorial" })).toBe(0.7);
    expect(confianzaDe({ confirmada: false, editada: false, origen: "vision" })).toBe(0.5);
  });
});

describe("validarRegionesPlano", () => {
  it("acepta el ejemplo del contrato y recorta la confianza a 0.80", () => {
    const v = validarRegionesPlano(doc([region({ confianza: 0.99 })]));
    expect(v.regiones[0]).toMatchObject({ id: "r-1", tipo: "estacionamiento", confianza: 0.8 });
    expect(v.paginas["1"]).toMatchObject({ imagen: "r1.png", ancho_px: 2400, escala: 200 });
  });

  it("rechaza tipos no permitidos, menos de 3 puntos, puntos fuera de 0–1 y páginas inexistentes", () => {
    const malos = [
      region({ tipo: "piscina" }),
      region({ puntos: CUADRADO.slice(0, 2) }),
      region({ puntos: [...CUADRADO.slice(0, 3), [1.2, 0.5]] }),
      region({ puntos: [...CUADRADO.slice(0, 3), [0.2, -0.01]] }),
      region({ puntos: [...CUADRADO.slice(0, 3), ["0.2", 0.5]] }),
      region({ pagina: 2 }),
      region({ origen: "magia" }),
      region({ confirmada: "sí" }),
      region({ id: "../x" }),
    ];
    for (const r of malos) expect(() => validarRegionesPlano(doc([r]))).toThrow(ErrorRegiones);
  });

  it("aplica los topes: 500 regiones, 200 vértices e ids únicos", () => {
    const muchos = Array.from({ length: MAX_VERTICES + 1 }, (_, i) => [i / 1000, 0.5 + (i % 2) / 100]);
    expect(() => validarRegionesPlano(doc([region({ puntos: muchos })]))).toThrow(/200 vértices/);
    const lista = Array.from({ length: MAX_REGIONES + 1 }, (_, i) => region({ id: `r-${i}` }));
    expect(() => validarRegionesPlano(doc(lista))).toThrow(/500 regiones/);
    expect(() => validarRegionesPlano(doc([region(), region()]))).toThrow(/repetido/);
  });

  it("rechaza una imagen con ruta o una versión distinta", () => {
    expect(() => validarRegionesPlano(doc([], { "1": { imagen: "../p1.png", ancho_px: 10, alto_px: 10 } }))).toThrow(ErrorRegiones);
    expect(() => validarRegionesPlano({ ...doc([]), version: 2 })).toThrow(ErrorRegiones);
  });
});

describe("geometría", () => {
  it("agrega un vértice después del índice y no pasa del tope", () => {
    expect(agregarVertice(CUADRADO, 0, [0.2, 0.1])).toEqual([[0.1, 0.1], [0.2, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3]]);
    expect(agregarVertice(CUADRADO, 3, [0.1, 0.2])).toHaveLength(5);
    const lleno = Array.from({ length: MAX_VERTICES }, (_, i) => [i / 1000, 0.5] as Punto);
    expect(agregarVertice(lleno, 0, [0.5, 0.5])).toBe(lleno);
  });

  it("quita un vértice, pero nunca deja menos de 3", () => {
    expect(quitarVertice(CUADRADO, 1)).toEqual([[0.1, 0.1], [0.3, 0.3], [0.1, 0.3]]);
    const triangulo = CUADRADO.slice(0, 3);
    expect(quitarVertice(triangulo, 0)).toBe(triangulo);
  });

  it("mueve un vértice recortándolo a la página y convierte píxeles a fracción", () => {
    expect(moverVertice(CUADRADO, 2, [1.4, -0.2])[2]).toEqual([1, 0]);
    expect(aFraccion(1200, 400, 2400, 1600)).toEqual([0.5, 0.25]);
    expect(aFraccion(-5, 044444, 2400, 1600)).toEqual([0, 1]);
  });

  it("encuentra el lado más cercano, el punto dentro del polígono y el centro", () => {
    const l = ladoMasCercano(CUADRADO, [0.2, 0.31]);
    expect(l.indice).toBe(2);
    expect(l.punto[0]).toBeCloseTo(0.2);
    expect(l.punto[1]).toBeCloseTo(0.3);
    expect(puntoEnPoligono([0.2, 0.2], CUADRADO)).toBe(true);
    expect(puntoEnPoligono([0.5, 0.2], CUADRADO)).toBe(false);
    expect(centroDe(CUADRADO)[0]).toBeCloseTo(0.2);
  });

  it("cuenta por tipo en el orden de la tabla y genera ids nuevos", () => {
    expect(conteoPorTipo([{ tipo: "estacionamiento" }, { tipo: "lote" }, { tipo: "estacionamiento" }]).map((t) => [t.tipo, t.conteo])).toEqual([
      ["lote", 1],
      ["estacionamiento", 2],
    ]);
    const id = nuevoIdRegion(["r-1"]);
    expect(id).toMatch(/^r-[0-9a-f]{8}$/);
  });
});
