// @vitest-environment node
import { describe, expect, it } from "vitest";
import { errorDatoDeclarado, validarDatosDeclarados } from "@/lib/datos-declarados";

const { validarDatos } = await import("./almacen");
const { loteJson } = await import("./motor");

const BASE = { nombreProyecto: "P", tramite: "RLA", fechaPresentacion: "2026-10-07", normaAplicable: "PLOT-A61-2021" };
const DECLARADO = { confianza: 1, fuente: { metodo: "declarado", detalle: "declarado por el usuario en el cuadro de datos" } };

describe("cuadro de datos del anteproyecto (paso 0): validación", () => {
  it("acepta números ≥ 0 dentro del rango del dato; un retiro puede ser 0", () => {
    expect(errorDatoDeclarado("proyecto.retiro_lateral_m", 0)).toBeNull();
    expect(errorDatoDeclarado("lote.area_m2", 727.54)).toBeNull();
    expect(errorDatoDeclarado("proyecto.ocupacion_pct", 100)).toBeNull();
  });

  it("rechaza negativos, porcentajes sobre 100, decimales en conteos, ceros en medidas del lote y lo que no es número", () => {
    expect(errorDatoDeclarado("proyecto.retiro_posterior_m", -1)).toMatch(/no puede ser negativo/);
    expect(errorDatoDeclarado("proyecto.area_libre_pct", 100.5)).toMatch(/no puede pasar de 100/);
    expect(errorDatoDeclarado("proyecto.estacionamientos", 12.5)).toMatch(/entero/);
    expect(errorDatoDeclarado("lote.area_m2", 0)).toMatch(/mayor que 0/);
    expect(errorDatoDeclarado("proyecto.altura_m", 1000)).toMatch(/no puede pasar de/);
    expect(errorDatoDeclarado("proyecto.altura_m", "12")).toMatch(/escriba un número/);
    expect(errorDatoDeclarado("proyecto.altura_m", Number.NaN)).toMatch(/escriba un número/);
    expect(errorDatoDeclarado("lote.norma_aplicable", 1)).toMatch(/no es un dato del cuadro/);
  });

  it("validarDatosDeclarados omite los vacíos y devuelve el primer error", () => {
    expect(validarDatosDeclarados(undefined)).toEqual({ datos: undefined });
    expect(validarDatosDeclarados({ "proyecto.altura_m": null, "lote.frente_m": "" })).toEqual({ datos: undefined });
    expect(validarDatosDeclarados({ "proyecto.altura_m": 12, "lote.frente_m": null })).toEqual({ datos: { "proyecto.altura_m": 12 } });
    expect(validarDatosDeclarados([1])).toMatchObject({ mensaje: expect.any(String) });
    expect(validarDatosDeclarados({ "proyecto.ocupacion_pct": 140 })).toMatchObject({ mensaje: "Ocupación: no puede pasar de 100 %." });
  });

  it("validarDatos los incluye en DatosPreCheck o responde el mensaje", () => {
    const r = validarDatos({ ...BASE, datosDeclarados: { "proyecto.retiro_posterior_m": 2.2 } });
    expect("datos" in r && r.datos.datosDeclarados).toEqual({ "proyecto.retiro_posterior_m": 2.2 });
    expect(validarDatos({ ...BASE, datosDeclarados: { "proyecto.retiro_posterior_m": -2 } })).toEqual({ mensaje: "Retiro posterior: no puede ser negativo." });
    expect(validarDatos({ ...BASE, datosDeclarados: { "../x": 1 } })).toMatchObject({ mensaje: expect.stringMatching(/no es un dato del cuadro/) });
    const sin = validarDatos(BASE);
    expect("datos" in sin && "datosDeclarados" in sin.datos).toBe(false);
  });
});

describe("loteJson con datos declarados", () => {
  it("escribe cada dato en su rama con método «declarado», confianza 1 y sin pisar lo demás", () => {
    const lote = loteJson({
      ...BASE,
      codigoZona: "RM1",
      declaraciones: { esUrbanizacionOParcelacion: false },
      datosDeclarados: { "lote.area_m2": 727.54, "proyecto.retiro_posterior_m": 2.2, "proyecto.estacionamientos": 15, "acceso_vehicular.rotura_cordon_m": 6 },
    });
    expect(lote.lote).toMatchObject({ area_m2: { valor: 727.54, ...DECLARADO }, norma_aplicable: { valor: "PLOT-A61-2021" }, codigo_zona: { valor: "RM1" } });
    expect(lote.proyecto).toEqual({
      es_urbanizacion_o_parcelacion: { valor: false, confianza: 1, fuente: { metodo: "declarado", detalle: "declarado por el usuario" } },
      retiro_posterior_m: { valor: 2.2, ...DECLARADO },
      estacionamientos: { valor: 15, ...DECLARADO },
    });
    expect(lote).toMatchObject({ acceso_vehicular: { rotura_cordon_m: { valor: 6, ...DECLARADO } } });
  });

  it("sin cuadro no agrega ramas", () => {
    const lote = loteJson({ ...BASE, datosDeclarados: {} });
    expect(Object.keys(lote).sort()).toEqual(["expediente", "lote", "tramite"]);
  });
});
