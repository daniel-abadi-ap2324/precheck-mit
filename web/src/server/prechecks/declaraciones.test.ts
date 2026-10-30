// @vitest-environment node
import { describe, expect, it } from "vitest";

const { limpiarDeclaraciones, validarDatos } = await import("./almacen");
const { loteJson } = await import("./motor");

const BASE = { nombreProyecto: "P", tramite: "RLA", fechaPresentacion: "2026-10-07", normaAplicable: "PLOT-A61-2021" };

describe("declaraciones sí/no del expediente (decisión D9)", () => {
  it("limpiarDeclaraciones solo conserva booleanos de las claves conocidas", () => {
    expect(limpiarDeclaraciones({ esUrbanizacionOParcelacion: true, requiereBcbrp: false, servidumbreOtraEntidad: "si", otraCosa: true })).toEqual({ esUrbanizacionOParcelacion: true, requiereBcbrp: false });
    expect(limpiarDeclaraciones({})).toBeUndefined();
    expect(limpiarDeclaraciones(undefined)).toBeUndefined();
  });

  it("validarDatos las deja pasar solo si vienen como booleanos", () => {
    const r = validarDatos({ ...BASE, declaraciones: { servidumbreFluvialOPluvial: true, esUrbanizacionOParcelacion: "x" } });
    expect("datos" in r && r.datos.declaraciones).toEqual({ servidumbreFluvialOPluvial: true });
    const sin = validarDatos(BASE);
    expect("datos" in sin && "declaraciones" in sin.datos).toBe(false);
  });

  it("loteJson escribe cada respuesta con su nombre de dato, confianza 1 y fuente declarada; sin responder no escribe nada", () => {
    const lote = loteJson({ ...BASE, declaraciones: { esUrbanizacionOParcelacion: false, servidumbreOtraEntidad: true, servidumbreFluvialOPluvial: false, requiereBcbrp: true } });
    expect(lote.proyecto?.es_urbanizacion_o_parcelacion).toMatchObject({ valor: false, confianza: 1, fuente: { metodo: "declarado" } });
    expect(lote.lote.servidumbre_otra_entidad).toMatchObject({ valor: true, confianza: 1 });
    expect(lote.lote.servidumbre_fluvial_o_pluvial).toMatchObject({ valor: false });
    expect(lote.expediente.requiere_bcbrp).toMatchObject({ valor: true });
    const vacio = loteJson(BASE);
    expect("proyecto" in vacio).toBe(false);
    expect(Object.keys(vacio.lote)).toEqual(["norma_aplicable"]);
    expect(Object.keys(vacio.expediente)).toEqual(["fecha_presentacion"]);
  });
});

describe("códigos de trámite", () => {
  it("acepta los códigos con guion bajo de las reglas del Acuerdo 110 y rechaza lo raro", () => {
    for (const t of ["RLA", "RDP", "OBRAS_MENORES", "PAGO_EXCEPCIONAL_COMPENSACION", "MODIFICACION_AS_BUILT"]) {
      const r = validarDatos({ ...BASE, tramite: t });
      expect("datos" in r && r.datos.tramite).toBe(t);
    }
    expect("mensaje" in validarDatos({ ...BASE, tramite: "RLA; DROP" })).toBe(true);
    expect("mensaje" in validarDatos({ ...BASE, tramite: "_RLA" })).toBe(true);
  });
});
