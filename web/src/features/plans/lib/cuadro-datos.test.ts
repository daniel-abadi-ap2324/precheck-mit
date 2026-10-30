import { describe, expect, it } from "vitest";
import { leerCuadro, mensajeErroresCuadro, textosDe } from "./cuadro-datos";

describe("cuadro de datos: de lo escrito a lo que se envía", () => {
  it("lee números con coma o punto, omite vacíos y marca lo que no es razonable", () => {
    const r = leerCuadro({ "proyecto.retiro_posterior_m": "2,5", "lote.area_m2": "1.250,75", "lote.frente_m": " ", "proyecto.ocupacion_pct": "120", "proyecto.altura_m": "alto" });
    expect(r.datos).toEqual({ "proyecto.retiro_posterior_m": 2.5, "lote.area_m2": 1250.75 });
    expect(Object.keys(r.errores).sort()).toEqual(["proyecto.altura_m", "proyecto.ocupacion_pct"]);
    expect(r.errores["proyecto.altura_m"]).toMatch(/escriba un número/);
    expect(mensajeErroresCuadro(r.errores)).toMatch(/^Corrija el cuadro de datos del anteproyecto: /);
    expect(mensajeErroresCuadro({})).toBeNull();
  });

  it("los datos de un PreCheck anterior vuelven como texto", () => {
    expect(textosDe({ "proyecto.estacionamientos": 15 })).toEqual({ "proyecto.estacionamientos": "15" });
    expect(textosDe(undefined)).toEqual({});
  });
});
