// @vitest-environment node
import { describe, expect, it } from "vitest";
import { leerNormas, normaDeId, operadorDeCondicion, traducirArchivo, traducirRegla, zonaDeAplicaSi } from "./traductor";

const NORMAS = leerNormas({
  "A110-2025": { nombre: "Acuerdo N°110 de 22-04-2025", prefijos: ["A110-"] },
  "PLOT-A61-2021": { nombre: "PLOT, Acuerdo 61 de 2021", prefijos: ["PLOT-"] },
  "PLOT-A61-2021+A270-2025": { nombre: "PLOT con el Acuerdo 270 de 2025 (San Francisco)", prefijos: ["SF-"] },
  "MIVIOT-EC-R192-2013": { nombre: "El Carmen, Resolución N°192-2013 (ZOT-E9)", prefijos: ["EC-"] },
  "MIVIOT-XX": { nombre: "Zona de prueba, Resolución ficticia", prefijos: ["XX-"] },
  MIVIOT: { nombre: "Sin reglas", prefijos: [] },
});

const fuente = { norma: "Norma de prueba", articulo: "Artículo 1", pagina_pdf: 3, cita_textual: "Hasta 100 personas por hectárea." };
const vigencia = { desde: "2013-04-30", hasta: null };

/** Una muestra sintética de cada forma del catálogo. */
const CUANTITATIVA = {
  id: "EC-R1A-DENSIDAD",
  version: 1,
  titulo: "R1-A: densidad neta máxima",
  fuente,
  tipo: "cuantitativa",
  aplica_si: "lote.norma_aplicable == 'MIVIOT-EC-R192-2013' and lote.codigo_zona in ['R1-A', 'R1A']",
  entradas: ["proyecto.densidad_pers_ha"],
  condicion: "proyecto.densidad_pers_ha <= 100",
  unidad: "pers/ha",
  tolerancia: 0.5,
  severidad: "bloqueante",
  mensaje_no_cumple: "La densidad neta excede 100 personas por hectárea de la zona R1-A.",
  vigencia,
  estado_revision: "borrador",
  nota: "nota de prueba",
};
const RANGO = { ...CUANTITATIVA, id: "XX-R1-FRENTE", titulo: "R1: frente", condicion: "lote.frente_m >= 15 and lote.frente_m <= 25", unidad: "m", aplica_si: "lote.codigo_zona == 'R1'" };
const ESTRICTA = { ...CUANTITATIVA, id: "XX-VI-DENSIDAD", condicion: "proyecto.densidad_pers_ha < 300" };
const CRITERIO = { id: "PLOT-R1-USOS", version: 1, titulo: "R1: usos permitidos", fuente, tipo: "criterio", aplica_si: "lote.codigo_zona in ['R1', '1R1']", entradas: [], severidad: "bloqueante", mensaje_no_cumple: "Uso no permitido.", vigencia, estado_revision: "borrador" };
const DOCUMENTAL = { id: "A110-AIV-FINCA-COINCIDE", version: 2, titulo: "Finca coincide", fuente, tipo: "documental", aplica_si: "tramite in ['RLA', 'RDP']", entradas: ["plano.finca"], condicion: "plano.finca == registro_publico.finca", severidad: "observacion", mensaje_no_cumple: "No coincide.", vigencia, estado_revision: "aprobada" };
const PLAZO = { id: "A110-ATC-VIGENCIA", version: 1, titulo: "ATC vigente", fuente, tipo: "plazo", condicion: "atc.dias <= 120 or (atc.extendida == true and atc.dias <= 150)", severidad: "bloqueante", mensaje_no_cumple: "Vencida.", vigencia, estado_revision: "borrador" };

describe("traductor del catálogo de reglas", () => {
  it("regla cuantitativa simple: operador, valor, unidad, zona, norma, cita, estado y vigencia", () => {
    expect(traducirRegla(CUANTITATIVA, NORMAS, "reglas_el_carmen_borrador.json", 0)).toEqual({
      id: "EC-R1A-DENSIDAD",
      version: 1,
      title: "R1-A: densidad neta máxima",
      category: "density",
      zoning: "R1-A",
      description: "La densidad neta excede 100 personas por hectárea de la zona R1-A.",
      operator: "<=",
      value: 100,
      unit: "pers/ha",
      regulation: { id: "EC-R1A-DENSIDAD", norma: "Norma de prueba", article: "Artículo 1", quote: "Hasta 100 personas por hectárea.", sourcePage: 3 },
      state: "borrador",
      severity: "bloqueante",
      normaCode: "MIVIOT-EC-R192-2013",
      normaLabel: "El Carmen",
      kind: "cuantitativa",
      condition: "proyecto.densidad_pers_ha <= 100",
      appliesIf: CUANTITATIVA.aplica_si,
      note: "nota de prueba",
      validFrom: "2013-04-30",
      validTo: null,
    });
  });

  it("rangos, desigualdades estrictas y fórmulas no se reducen a un operador: quedan como condición literal", () => {
    for (const r of [RANGO, ESTRICTA, PLAZO]) {
      const t = traducirRegla(r, NORMAS, "x.json", 0);
      expect(t).toMatchObject({ operator: "criterio", value: null, condition: r.condicion });
    }
    expect(operadorDeCondicion("lote.area_m2 >= 500")).toEqual({ operator: ">=", value: 500 });
    expect(operadorDeCondicion("proyecto.pisos == 2")).toEqual({ operator: "=", value: 2 });
    expect(operadorDeCondicion("plano.finca == registro_publico.finca")).toEqual({ operator: "criterio", value: null });
  });

  it("criterio sin condición, documental aprobada con severidad de observación, y zona por «==»", () => {
    expect(traducirRegla(CRITERIO, NORMAS, "x.json", 0)).toMatchObject({ operator: "criterio", zoning: "R1", category: "zoning", normaLabel: "PLOT", kind: "criterio" });
    expect(traducirRegla(CRITERIO, NORMAS, "x.json", 0).condition).toBeUndefined();
    expect(traducirRegla(DOCUMENTAL, NORMAS, "x.json", 0)).toMatchObject({ state: "aprobada", severity: "observacion", version: 2, zoning: null, normaLabel: "Acuerdo 110", category: "site" });
    expect(traducirRegla(RANGO, NORMAS, "x.json", 0)).toMatchObject({ zoning: "R1", normaCode: "MIVIOT-XX", normaLabel: "Zona de prueba", category: "site" });
  });

  it("una regla incompleta o ilegible igual aparece, con lo que se pueda y en borrador", () => {
    const sinCampos = traducirRegla({ id: "SF-X-1", estado_revision: "vigente-raro" }, NORMAS, "reglas_sf.json", 4);
    expect(sinCampos).toMatchObject({ id: "SF-X-1", title: "SF-X-1", state: "borrador", normaLabel: "San Francisco", regulation: { norma: "Norma no indicada", article: "—", quote: "" } });
    const ilegible = traducirRegla("no es una regla", NORMAS, "reglas_sf.json", 4);
    expect(ilegible).toMatchObject({ id: "SIN-ID-reglas_sf-5", title: "Regla ilegible en reglas_sf.json (posición 5)", state: "borrador" });
    expect(ilegible.note).toMatch(/no tiene la forma esperada/);
    expect(normaDeId("ZZ-ALGO", NORMAS)).toEqual({ codigo: "ZZ", etiqueta: "Otra norma (ZZ)" });
  });

  it("un archivo que no es una lista no aporta reglas; una lista las traduce todas", () => {
    expect(traducirArchivo({ reglas: [] }, NORMAS, "x.json")).toEqual([]);
    expect(traducirArchivo([CUANTITATIVA, CRITERIO, null], NORMAS, "x.json").map((r) => r.id)).toEqual(["EC-R1A-DENSIDAD", "PLOT-R1-USOS", "SIN-ID-x-3"]);
  });

  it("zona desde aplica_si", () => {
    expect(zonaDeAplicaSi("lote.codigo_zona in ['RM-2', '1RM-2'] and x")).toBe("RM-2");
    expect(zonaDeAplicaSi("tramite == 'RLA'")).toBeNull();
    expect(zonaDeAplicaSi(undefined)).toBeNull();
  });
});
