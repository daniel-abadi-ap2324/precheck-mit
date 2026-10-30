import { describe, expect, it } from "vitest";
import { compararEjecuciones, consensoDe, claveDeRegla, estabilidadDe, tablaDeDatos, tablaDeSupuestos, contarEstados, contarFaltasEnPlano, esHallazgoTipificado, parecido, planoDe, resumenPorModelo, type Ejecucion } from "./comparacion";

const ej = (nombre: string, resultados: Ejecucion["resultados"], titulos: Record<string, string>): Ejecucion => ({ projectId: nombre, nombre, modelo: "m", iaTerminada: true, resultados, titulos });

describe("compararEjecuciones", () => {
  const a = ej("A", [{ ruleId: "R-1", status: "PASS" }, { ruleId: "R-2", status: "FAIL" }, { ruleId: "HALLAZGO-1", status: "FAIL", fueraDeCatalogo: true }, { ruleId: "R-3", status: "NOT_APPLICABLE" }], { "HALLAZGO-1": "Acabados generales" });
  const b = ej("B", [{ ruleId: "R-1", status: "PASS" }, { ruleId: "R-2", status: "WARNING" }, { ruleId: "HALLAZGO-4", status: "FAIL", fueraDeCatalogo: true }], { "HALLAZGO-4": "Acabados  generales" });

  it("empareja los hallazgos por título aunque cambie su número, y las reglas por id", () => {
    const filas = compararEjecuciones([a, b]);
    const acabados = filas.find((f) => f.fueraDeCatalogo);
    expect(acabados?.estados).toEqual(["FAIL", "FAIL"]);
    expect(acabados?.difiere).toBe(false);
    expect(filas.filter((f) => f.fueraDeCatalogo)).toHaveLength(1);
  });

  it("marca lo que difiere, pone primero lo que coincide y omite lo que no aplica", () => {
    const filas = compararEjecuciones([a, b]);
    // Lo estable arriba (R-1 coincide en las dos corridas), lo que difiere después.
    expect(filas[0]).toMatchObject({ clave: "R:R-1", difiere: false });
    expect(filas.findIndex((f) => f.difiere)).toBeGreaterThan(filas.map((f) => f.difiere).lastIndexOf(false));
    expect(filas.find((f) => f.clave === "R:R-2")).toMatchObject({ difiere: true, estados: ["FAIL", "WARNING"] });
    expect(filas.some((f) => f.clave === "R:R-3")).toBe(false);
    expect(filas.find((f) => f.clave === "R:R-1")?.difiere).toBe(false);
  });

  it("un hallazgo que solo tiene una ejecución cuenta como diferencia", () => {
    const solo = ej("C", [{ ruleId: "HALLAZGO-2", status: "FAIL", fueraDeCatalogo: true }], { "HALLAZGO-2": "Drenaje pluvial" });
    const fila = compararEjecuciones([a, solo]).find((f) => f.titulo === "Drenaje pluvial");
    expect(fila).toMatchObject({ estados: [null, "FAIL"], difiere: true });
  });

  it("une los hallazgos que cada ejecución redactó distinto y separa los que no tienen que ver", () => {
    const x = ej("X", [{ ruleId: "HALLAZGO-1", status: "FAIL", fueraDeCatalogo: true }, { ruleId: "HALLAZGO-2", status: "WARNING", fueraDeCatalogo: true }], { "HALLAZGO-1": "Linderos sin rumbos", "HALLAZGO-2": "Sin solución al drenaje pluvial dentro de la propiedad" });
    const y = ej("Y", [{ ruleId: "HALLAZGO-1", status: "FAIL", fueraDeCatalogo: true }, { ruleId: "HALLAZGO-2", status: "FAIL", fueraDeCatalogo: true }], { "HALLAZGO-1": "Localización general: linderos sin rumbos", "HALLAZGO-2": "Fecha del pie descriptivo anterior a la presentación" });
    const filas = compararEjecuciones([x, y]);
    expect(filas).toHaveLength(3);
    expect(filas.find((f) => f.titulo === "Linderos sin rumbos")?.estados).toEqual(["FAIL", "FAIL"]);
    expect(filas.find((f) => f.titulo.startsWith("Sin solución"))?.estados).toEqual(["WARNING", null]);
  });

  it("parecido: mismo hallazgo con otra redacción sí, títulos cortos o ajenos no", () => {
    expect(parecido("Acabados generales de todos los ambientes", "Sin acabados generales de los ambientes")).toBe(1);
    expect(parecido("Solución al drenaje de aguas pluviales dentro de la propiedad", "Sin solución al drenaje pluvial dentro de la propiedad")).toBeGreaterThanOrEqual(0.8);
    expect(parecido("Linderos sin rumbos", "Fecha del pie descriptivo")).toBe(0);
    expect(parecido("Patios", "Patios")).toBe(0);
  });

  it("cuenta los estados de una ejecución", () => {
    expect(contarEstados(a)).toEqual({ PASS: 1, FAIL: 2, WARNING: 0, MANUAL_REVIEW: 0 });
  });
});

describe("consenso, hallazgos tipificados y resumen por modelo", () => {
  const h = (ruleId: string, status: "FAIL" | "WARNING" | "PASS") => ({ ruleId, status, fueraDeCatalogo: true });
  const run = (nombre: string, modelo: string, resultados: Ejecucion["resultados"], titulos: Record<string, string> = {}): Ejecucion => ({ projectId: nombre, nombre, modelo, iaTerminada: true, resultados, titulos });

  it("el consenso es el estado más frecuente; «consistente» pide al menos dos de cada tres", () => {
    expect(consensoDe(["FAIL", "FAIL", "FAIL", "WARNING", "FAIL", "FAIL"])).toEqual({ estado: "FAIL", coinciden: 5, de: 6, consistente: true });
    expect(consensoDe(["PASS", "WARNING", "FAIL"])).toMatchObject({ coinciden: 1, de: 3, consistente: false });
    expect(consensoDe(["FAIL", null, null])).toMatchObject({ estado: null, coinciden: 2, consistente: true });
    expect(consensoDe([])).toMatchObject({ consistente: false });
  });

  it("los hallazgos tipificados se emparejan por su id aunque el título cambie, y los numéricos no se mezclan con ellos", () => {
    expect(esHallazgoTipificado("HALLAZGO-LAMINAS-FALTANTES")).toBe(true);
    expect(esHallazgoTipificado("HALLAZGO-3")).toBe(false);
    const a = run("A", "m1", [h("HALLAZGO-LAMINAS-FALTANTES", "FAIL"), h("HALLAZGO-1", "WARNING")], { "HALLAZGO-LAMINAS-FALTANTES": "Láminas 08 a 11 no presentadas", "HALLAZGO-1": "Láminas faltantes del juego" });
    const b = run("B", "m2", [h("HALLAZGO-LAMINAS-FALTANTES", "FAIL")], { "HALLAZGO-LAMINAS-FALTANTES": "Faltan las hojas 08 a 11" });
    const filas = compararEjecuciones([a, b]);
    const tipificada = filas.find((f) => f.clave === "T:HALLAZGO-LAMINAS-FALTANTES");
    expect(tipificada?.estados).toEqual(["FAIL", "FAIL"]);
    expect(tipificada?.consenso.consistente).toBe(true);
    expect(filas.find((f) => f.clave.startsWith("H:"))?.estados).toEqual(["WARNING", null]);
  });

  it("planoDe toma lo que va antes del primer « - »", () => {
    expect(planoDe("Casco Antiguo - prueba 2 con Opus 5.5")).toBe("Casco Antiguo");
    expect(planoDe("Residencia Betania 01")).toBe("Residencia Betania 01");
  });

  it("resumenPorModelo da el rango entre corridas del modelo y el acuerdo con la mayoría", () => {
    const r1 = run("1", "opus", [{ ruleId: "R-1", status: "FAIL" }, { ruleId: "R-2", status: "PASS" }]);
    const r2 = run("2", "opus", [{ ruleId: "R-1", status: "FAIL" }, { ruleId: "R-2", status: "WARNING" }]);
    const r3 = run("3", "sonnet", [{ ruleId: "R-1", status: "FAIL" }, { ruleId: "R-2", status: "PASS" }]);
    const filas = compararEjecuciones([r1, r2, r3]);
    const resumen = resumenPorModelo([r1, r2, r3], filas);
    const opus = resumen.find((x) => x.modelo === "opus")!;
    expect(opus.corridas).toBe(2);
    expect(opus.rango.PASS).toEqual([0, 1]);
    expect(opus.rango.WARNING).toEqual([0, 1]);
    // Mayoría: R-1 FAIL (3/3), R-2 PASS (2/3). La corrida r2 de opus coincide en 1 de 2 filas; r1 en 2 de 2.
    expect(opus.acuerdo).toBeCloseTo(0.75);
    expect(resumen.find((x) => x.modelo === "sonnet")?.acuerdo).toBe(1);
  });

  it("en el acuerdo con la mayoría, «no aplica» cuenta igual que «no aparece» (como en el consenso)", () => {
    const r1 = run("1", "opus", [{ ruleId: "R-1", status: "FAIL" }, { ruleId: "R-UT2", status: "NOT_APPLICABLE" }]);
    const r2 = run("2", "opus", [{ ruleId: "R-1", status: "FAIL" }]);
    const r3 = run("3", "sonnet", [{ ruleId: "R-1", status: "FAIL" }, { ruleId: "R-UT2", status: "PASS" }]);
    const filas = compararEjecuciones([r1, r2, r3]);
    // Mayoría de R-UT2: «no aparece» (2 de 3). r1 dice «no aplica»: coincide con la mayoría.
    expect(resumenPorModelo([r1, r2, r3], filas).find((x) => x.modelo === "opus")?.acuerdo).toBe(1);
  });
});

describe("sin perder filas al cambiar la selección", () => {
  const run = (nombre: string, resultados: Ejecucion["resultados"], titulos: Record<string, string> = {}): Ejecucion => ({ projectId: nombre, nombre, modelo: "m", iaTerminada: true, resultados, titulos });

  it("«No aplica» en una corrida no cuenta como diferencia con «no aparece», pero se muestra como «No aplica»", () => {
    const a = run("A", [{ ruleId: "R-1", status: "NOT_APPLICABLE" }, { ruleId: "R-2", status: "PASS" }]);
    const b = run("B", [{ ruleId: "R-2", status: "PASS" }]);
    const filas = compararEjecuciones([a, b]);
    // R-1 la dan por «no aplica» o no la mencionan: no aporta fila.
    expect(filas.map((f) => f.clave)).toEqual(["R:R-2"]);
    // Si otra corrida sí la decide, la fila aparece y la primera dice «No aplica» (no «no aparece»).
    const c = run("C", [{ ruleId: "R-1", status: "FAIL" }, { ruleId: "R-2", status: "PASS" }]);
    const con = compararEjecuciones([a, b, c]).find((f) => f.clave === "R:R-1");
    expect(con?.estados).toEqual(["NOT_APPLICABLE", null, "FAIL"]);
    expect(con?.difiere).toBe(true);
    expect(con?.consenso.estado).toBeNull();
  });

  it("dos hallazgos con el mismo título en una misma corrida no se pisan: el segundo va a otra fila", () => {
    const a = run("A", [{ ruleId: "HALLAZGO-1", status: "FAIL", fueraDeCatalogo: true }, { ruleId: "HALLAZGO-2", status: "WARNING", fueraDeCatalogo: true }], { "HALLAZGO-1": "Falta el drenaje", "HALLAZGO-2": "Falta el drenaje" });
    const filas = compararEjecuciones([a, run("B", [])]);
    expect(filas.map((f) => f.estados[0]).sort()).toEqual(["FAIL", "WARNING"]);
  });

  it("cada fila recuerda cómo la tituló cada corrida (los hallazgos parecidos se unen aunque se llamen distinto)", () => {
    const a = run("A", [{ ruleId: "HALLAZGO-1", status: "FAIL", fueraDeCatalogo: true }], { "HALLAZGO-1": "Linderos sin rumbos" });
    const b = run("B", [{ ruleId: "HALLAZGO-4", status: "FAIL", fueraDeCatalogo: true }], { "HALLAZGO-4": "Localización general: linderos sin rumbos" });
    const [fila] = compararEjecuciones([a, b]);
    expect(fila.titulosPorEjecucion).toEqual(["Linderos sin rumbos", "Localización general: linderos sin rumbos"]);
    expect(fila.estados).toEqual(["FAIL", "FAIL"]);
  });
});

describe("estabilidadDe", () => {
  const run = (nombre: string, resultados: Ejecucion["resultados"], titulos: Record<string, string> = {}): Ejecucion => ({ projectId: nombre, nombre, modelo: "m", iaTerminada: true, resultados, titulos });
  const h = (id: string) => ({ ruleId: id, status: "FAIL" as const, fueraDeCatalogo: true });

  it("mide el solapamiento de hallazgos y el acuerdo en el catálogo sobre los pares de corridas", () => {
    const a = run("A", [{ ruleId: "R-1", status: "PASS" }, { ruleId: "R-2", status: "FAIL" }, h("HALLAZGO-X"), h("HALLAZGO-Y")]);
    const b = run("B", [{ ruleId: "R-1", status: "PASS" }, { ruleId: "R-2", status: "PASS" }, h("HALLAZGO-X")]);
    const e = estabilidadDe([a, b], compararEjecuciones([a, b]));
    expect(e.acuerdoCatalogo).toBeCloseTo(0.5); // R-1 igual, R-2 distinta
    expect(e.solapamientoHallazgos).toBeCloseTo(0.5); // X en las dos; Y solo en A
  });

  it("devuelve null con menos de dos corridas", () => {
    const a = run("A", [{ ruleId: "R-1", status: "PASS" }]);
    expect(estabilidadDe([a], compararEjecuciones([a]))).toEqual({ solapamientoHallazgos: null, acuerdoCatalogo: null, pares: 0 });
  });

  it("el filtro de pares deja medir solo las repeticiones del mismo modelo o solo entre modelos", () => {
    const a = { ...run("A", [{ ruleId: "R-1", status: "PASS" }]), modelo: "opus" };
    const b = { ...run("B", [{ ruleId: "R-1", status: "PASS" }]), modelo: "opus" };
    const c = { ...run("C", [{ ruleId: "R-1", status: "FAIL" }]), modelo: "sonnet" };
    const todas = [a, b, c];
    const filas = compararEjecuciones(todas);
    expect(estabilidadDe(todas, filas)).toMatchObject({ acuerdoCatalogo: expect.closeTo(1 / 3), pares: 3 });
    expect(estabilidadDe(todas, filas, (i, j) => todas[i].modelo === todas[j].modelo)).toMatchObject({ acuerdoCatalogo: 1, pares: 1 });
    expect(estabilidadDe(todas, filas, (i, j) => todas[i].modelo !== todas[j].modelo)).toMatchObject({ acuerdoCatalogo: 0, pares: 2 });
  });
});

describe("tablaDeDatos", () => {
  const con = (nombre: string, datos: NonNullable<Ejecucion["datos"]>): Ejecucion => ({ projectId: nombre, nombre, modelo: "m", iaTerminada: true, resultados: [], titulos: {}, datos });

  it("una fila por dato clave aunque nadie lo haya escrito; marca el rango amplio y cuántas corridas lo escribieron", () => {
    const filas = tablaDeDatos([
      con("A", { "proyecto.retiro_posterior_m": { valor: "1.56" }, "lote.finca": { valor: "078850" } }),
      con("B", { "proyecto.retiro_posterior_m": { valor: "2.70" } }),
      con("C", { "proyecto.retiro_posterior_m": { valor: "2.66" }, "proyecto.otro_dato": { valor: "x", etiqueta: "Otro" } }),
    ]);
    const retiro = filas.find((f) => f.clave === "proyecto.retiro_posterior_m");
    expect(retiro).toMatchObject({ valores: ["1.56", "2.70", "2.66"], escritas: 3, rango: { min: 1.56, max: 2.7 }, amplio: true });
    expect(filas.find((f) => f.clave === "proyecto.altura_m")).toMatchObject({ escritas: 0, rango: null, amplio: false });
    expect(filas.find((f) => f.clave === "lote.finca")).toMatchObject({ escritas: 1, amplio: false });
    expect(filas.at(-1)).toMatchObject({ clave: "proyecto.otro_dato", etiqueta: "Otro" });
  });

  it("valores casi iguales no son un rango amplio", () => {
    const f = tablaDeDatos([con("A", { "proyecto.densidad_pers_ha": { valor: "716.0" } }), con("B", { "proyecto.densidad_pers_ha": { valor: "716.1" } })]);
    expect(f.find((x) => x.clave === "proyecto.densidad_pers_ha")).toMatchObject({ amplio: false });
  });
});

it("marca como distintos los sí/no o textos que no coinciden entre corridas, y no los que coinciden ni los faltantes", () => {
  const con = (nombre: string, datos: NonNullable<Ejecucion["datos"]>): Ejecucion => ({ projectId: nombre, nombre, modelo: "m", iaTerminada: true, resultados: [], titulos: {}, datos });
  const filas = tablaDeDatos([
    con("A", { "plano.centro_acopio.dentro_propiedad_y_accesible": { valor: "no" }, "plano.acera.corrida": { valor: "sí" }, "lote.finca": { valor: "078850" } }),
    con("B", { "plano.centro_acopio.dentro_propiedad_y_accesible": { valor: "sí" }, "plano.acera.corrida": { valor: "sí" } }),
    con("C", { "plano.centro_acopio.dentro_propiedad_y_accesible": { valor: "no" }, "plano.acera.corrida": { valor: "sí" } }),
  ]);
  const dif = (k: string) => filas.find((f) => f.clave === k)?.distintos;
  expect(dif("plano.centro_acopio.dentro_propiedad_y_accesible")).toBe(true);
  expect(dif("plano.acera.corrida")).toBe(false);
  expect(dif("lote.finca")).toBe(false);
});

describe("tablaDeSupuestos", () => {
  const con = (nombre: string, supuestos: NonNullable<Ejecucion["supuestos"]>): Ejecucion => ({ projectId: nombre, nombre, modelo: "m", iaTerminada: true, resultados: [], titulos: {}, supuestos });

  it("resalta lo que las corridas no asumieron igual (la unidad territorial) y lo pone primero", () => {
    const filas = tablaDeSupuestos([
      con("A", { "lote.codigo_zona": { valor: "1ZM7", etiqueta: "Zona" }, "lote.sf_unidad_territorial": { valor: "3", etiqueta: "Unidad territorial" } }),
      con("B", { "lote.codigo_zona": { valor: "1ZM7", etiqueta: "Zona" }, "lote.sf_unidad_territorial": { valor: "6", etiqueta: "Unidad territorial" } }),
      con("C", { "lote.codigo_zona": { valor: "1ZM7", etiqueta: "Zona" } }),
    ]);
    expect(filas[0]).toMatchObject({ hecho: "lote.sf_unidad_territorial", etiqueta: "Unidad territorial", valores: ["3", "6", null], difiere: true });
    expect(filas[1]).toMatchObject({ hecho: "lote.codigo_zona", valores: ["1ZM7", "1ZM7", "1ZM7"], difiere: false });
  });

  it("que una corrida calle un supuesto no es un desacuerdo: solo difiere si dos corridas dieron valores distintos", () => {
    const filas = tablaDeSupuestos([
      con("A", { "lote.finca": { valor: "078850", etiqueta: "Finca" }, "lote.densidad": { valor: "716", etiqueta: "Densidad" } }),
      con("B", {}),
      con("C", { "lote.densidad": { valor: "700", etiqueta: "Densidad" } }),
    ]);
    expect(filas.find((f) => f.hecho === "lote.finca")).toMatchObject({ valores: ["078850", null, null], difiere: false });
    expect(filas.find((f) => f.hecho === "lote.densidad")).toMatchObject({ valores: ["716", null, "700"], difiere: true });
  });

  it("sin supuestos no hay filas", () => {
    expect(tablaDeSupuestos([con("A", {}), con("B", {})])).toEqual([]);
  });

  it("muestra el valor que usó el motor y no marca desacuerdo por mayúsculas ni por «false» escrito como texto (ADR-0019)", () => {
    const conDatos = (nombre: string, supuestos: NonNullable<Ejecucion["supuestos"]>, datos: NonNullable<Ejecucion["datos"]>): Ejecucion => ({ ...con(nombre, supuestos), datos });
    const filas = tablaDeSupuestos([
      conDatos("Sonnet", { "lote.orden_conservacion": { valor: "tercer", etiqueta: "Orden" }, "proyecto.obra_nueva": { valor: "no", etiqueta: "Obra nueva" } }, { "lote.orden_conservacion": { valor: "tercer" }, "proyecto.obra_nueva": { valor: "no" } }),
      con("DeepSeek", { "lote.orden_conservacion": { valor: "Tercer", etiqueta: "Orden" }, "proyecto.obra_nueva": { valor: "false", etiqueta: "Obra nueva" } }),
      conDatos("Opus", { "lote.orden_conservacion": { valor: "TERCER ORDEN", etiqueta: "Orden" } }, { "lote.orden_conservacion": { valor: "tercer" } }),
    ]);
    expect(filas.find((f) => f.hecho === "lote.orden_conservacion")).toMatchObject({ valores: ["tercer", "Tercer", "tercer"], difiere: false });
    expect(filas.find((f) => f.hecho === "proyecto.obra_nueva")).toMatchObject({ valores: ["no", "no", null], difiere: false });
  });
});

describe("contarEstados con la misma regla repetida por unidad territorial", () => {
  it("cuenta una vez el grupo de reglas idénticas, con su estado más grave", () => {
    const e: Ejecucion = { projectId: "a", nombre: "a", modelo: "m", iaTerminada: true, titulos: {}, resultados: [
      { ruleId: "SF-SAN-FRANCISCO-CENTRO-UT3-ZM7-ALTURA", status: "PASS" },
      { ruleId: "SF-SAN-FRANCISCO-CENTRO-UT6-ZM7-ALTURA", status: "FAIL" },
      { ruleId: "SF-SAN-FRANCISCO-CENTRO-UT7-ZM7-ALTURA", status: "PASS" },
      { ruleId: "R-OTRA", status: "PASS" },
    ] };
    expect(contarEstados(e)).toEqual({ PASS: 1, FAIL: 1, WARNING: 0, MANUAL_REVIEW: 0 });
  });
});

describe("la misma regla repetida por unidad territorial", () => {
  const run = (nombre: string, resultados: Ejecucion["resultados"], titulos: Record<string, string>): Ejecucion => ({ projectId: nombre, nombre, modelo: "m", iaTerminada: true, resultados, titulos });
  const SF3 = "SF-SAN-FRANCISCO-CENTRO-UT3-ZM7-ALTURA";
  const COCO = "SF-COCO-DEL-MAR-UT1-ZM7-ALTURA";

  it("claveDeRegla junta las UT con la misma regla y deja sola a la que no tiene equivalentes", () => {
    expect(claveDeRegla(SF3)).toBe("SF-UT*-ZM7-ALTURA");
    expect(claveDeRegla(COCO)).toBe("SF-UT*-ZM7-ALTURA");
    expect(claveDeRegla("A110-AIV-CURVAS-NIVEL")).toBe("A110-AIV-CURVAS-NIVEL");
    // Los usos prohibidos de Coco del Mar UT1 son propios de esa UT.
    expect(claveDeRegla("SF-COCO-DEL-MAR-UT1-ZM7-USOS-PROHIBIDOS")).toBe("SF-COCO-DEL-MAR-UT1-ZM7-USOS-PROHIBIDOS");
  });

  it("dos corridas que asumieron UT distintas ya no ven la misma regla como filas separadas ni como «no aplica»", () => {
    const a = run("A", [{ ruleId: SF3, status: "PASS" }], { [SF3]: "ZM7: altura máxima en pisos" });
    const b = run("B", [{ ruleId: COCO, status: "PASS" }], { [COCO]: "ZM7: altura máxima en pisos" });
    const filas = compararEjecuciones([a, b]);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ clave: "R:SF-UT*-ZM7-ALTURA", estados: ["PASS", "PASS"], difiere: false });
  });

  it("la fila muestra el título sin «Sector UTn:» y cada corrida conserva el suyo (así se ve qué UT usó)", () => {
    const d3 = "SF-SAN-FRANCISCO-CENTRO-UT3-DENSIDAD-MINIMA";
    const dc = "SF-COCO-DEL-MAR-UT1-DENSIDAD-MINIMA";
    const filas = compararEjecuciones([
      run("A", [{ ruleId: d3, status: "WARNING" }], { [d3]: "San Francisco Centro UT3: densidad residencial mínima de 200 pers/ha en usos mixtos" }),
      run("B", [{ ruleId: dc, status: "WARNING" }], { [dc]: "Coco del Mar UT1: densidad residencial mínima de 200 pers/ha en usos mixtos" }),
    ]);
    expect(filas).toHaveLength(1);
    expect(filas[0].titulo).toBe("Densidad residencial mínima de 200 pers/ha en usos mixtos");
    expect(filas[0].titulosPorEjecucion).toEqual(["San Francisco Centro UT3: densidad residencial mínima de 200 pers/ha en usos mixtos", "Coco del Mar UT1: densidad residencial mínima de 200 pers/ha en usos mixtos"]);
  });
});

describe("conclusionLegible", () => {
  it("cambia los estados del motor por palabras", async () => {
    const { conclusionLegible } = await import("./comparacion");
    expect(conclusionLegible("NO CUMPLE: 17 reglas con NO_CUMPLE y 11 en INFORMACION_REQUERIDA.")).toBe("NO CUMPLE: 17 reglas con no cumple y 11 en falta información.");
  });
});

describe("contarFaltasEnPlano", () => {
  it("cuenta una vez por regla los «no cumple» de contenido del plano", () => {
    const e: Ejecucion = {
      projectId: "p",
      nombre: "p",
      modelo: "m",
      iaTerminada: true,
      titulos: {},
      resultados: [
        { ruleId: "A110-AIII-5-ESCALA", status: "FAIL", faltaEnPlano: true },
        { ruleId: "ML2-C2-RETIRO-POSTERIOR", status: "FAIL" },
        { ruleId: "A110-AIII-5-ORIENTACION", status: "PASS" },
      ],
    };
    expect(contarEstados(e).FAIL).toBe(2);
    expect(contarFaltasEnPlano(e)).toBe(1);
  });
});
