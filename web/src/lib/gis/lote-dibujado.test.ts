import { describe, expect, it } from "vitest";
import { anilloCerrado, areaM2, centroide, leerCoordenadas, limpiarVertices, validarLote } from "./lote-dibujado";

// Cuadrado de ~30 m × ~30 m en Betania (1″ ≈ 30,9 m de latitud).
const d = 30 / 111_320;
const dx = 30 / (111_320 * Math.cos((8.995 * Math.PI) / 180));
const CUADRADO: [number, number][] = [[-79.53, 8.995], [-79.53 + dx, 8.995], [-79.53 + dx, 8.995 + d], [-79.53, 8.995 + d]];

describe("lote dibujado", () => {
  it("calcula el área en m² con proyección local", () => {
    expect(areaM2(CUADRADO)).toBeCloseTo(900, -1);
  });

  it("cierra el anillo y ubica el centroide dentro", () => {
    expect(anilloCerrado(CUADRADO)).toHaveLength(5);
    expect(anilloCerrado(CUADRADO)[4]).toEqual(CUADRADO[0]);
    const [x, y] = centroide(CUADRADO);
    expect(x).toBeCloseTo(-79.53 + dx / 2, 7);
    expect(y).toBeCloseTo(8.995 + d / 2, 7);
  });

  it("valida el polígono: mínimo 3 vértices, sin cruces y con un área razonable", () => {
    expect(validarLote(CUADRADO.slice(0, 2))).toBe("Marque al menos 3 vértices.");
    const cruzado: [number, number][] = [CUADRADO[0], CUADRADO[2], CUADRADO[1], CUADRADO[3]];
    expect(validarLote(cruzado)).toBe("Los lados del lote se cruzan. Revise el orden de los vértices.");
    const chico: [number, number][] = CUADRADO.map(([x, y]) => [-79.53 + (x + 79.53) / 10, 8.995 + (y - 8.995) / 10]);
    expect(validarLote(chico)).toBe("El lote mide menos de 20 m². Revise el dibujo.");
    const enorme: [number, number][] = CUADRADO.map(([x, y]) => [-79.53 + (x + 79.53) * 60, 8.995 + (y - 8.995) * 60]);
    expect(validarLote(enorme)).toBe("El lote mide más de 100 ha. Revise el dibujo.");
    expect(validarLote(CUADRADO)).toBeNull();
  });

  it("lee coordenadas pegadas: «lat, lng» por línea (WGS84) o «Este Norte» en UTM 17N", () => {
    expect(leerCoordenadas("8.995, -79.53\n8.995 -79.5297\n\n8.9953,-79.5297")).toEqual({
      puntos: [[-79.53, 8.995], [-79.5297, 8.995], [-79.5297, 8.9953]],
    });
    const utm = leerCoordenadas("660000 994000\n660030 994000\n660030 994030");
    expect("puntos" in utm && utm.puntos[0][0]).toBeCloseTo(-79.544508, 5);
    expect("puntos" in utm && utm.puntos[0][1]).toBeCloseTo(8.989419, 5);
    expect(leerCoordenadas("8.995, -79.53\nhola")).toEqual({ error: "La línea 2 no tiene dos números." });
    expect(leerCoordenadas("45, 10")).toEqual({ error: "La línea 1 está fuera del distrito de Panamá." });
  });
});

describe("vértices repetidos y orden de coordenadas", () => {
  it("un anillo cerrado o un doble clic no se toman como lados que se cruzan", () => {
    const cerrado: [number, number][] = [...CUADRADO, CUADRADO[0]];
    expect(limpiarVertices(cerrado)).toEqual(CUADRADO);
    expect(validarLote(cerrado)).toBeNull();
    const dobleClic: [number, number][] = [CUADRADO[0], CUADRADO[1], CUADRADO[1], CUADRADO[2], CUADRADO[3]];
    expect(validarLote(dobleClic)).toBeNull();
  });

  it("acepta «Norte Este» además de «Este Norte» (en el distrito no se confunden)", () => {
    const a = leerCoordenadas("994000 660000\n994000 660030\n994030 660030");
    const b = leerCoordenadas("660000 994000\n660030 994000\n660030 994030");
    expect(a).toEqual(b);
  });

  it("acepta vértices del extremo norte del distrito (hasta 9,50° N)", () => {
    expect(leerCoordenadas("9.501, -79.40")).toEqual({ puntos: [[-79.4, 9.501]] });
  });
});
