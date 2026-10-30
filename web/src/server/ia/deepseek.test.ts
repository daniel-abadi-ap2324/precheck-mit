import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Cliente, costoDe, LIMITE_TEXTO_PAGINA1, leerGasto, type Mensaje, mensajeInicial, mensajeInicialCorto, recortarHistorial, revisarConDeepSeek, TOPE_USD } from "./deepseek";
import { type ContextoHerramientas, costoDeVerZona, definicionesParaApi, escribirHecho, fijarAlcance, HERRAMIENTAS, listaFaltantes, teselasDelMosaico } from "./herramientas-deepseek";
import type { RegistroIa } from "./registro";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "deepseek-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const uso = { prompt_tokens: 1000, completion_tokens: 200 };
const llamada = (nombre: string, args: object, id = "c1") => ({ id, type: "function" as const, function: { name: nombre, arguments: JSON.stringify(args) } });
// El registro real escribe en la carpeta del PreCheck; aquí basta con recoger las líneas.
const registroEn = (_d: string) => {
  const lineas: string[] = [];
  return { lineas, texto: (l: string) => lineas.push(l) } as unknown as RegistroIa;
};

const entrada = (estado: object = {}) => ({
  estado: { datos: { tramite: "RLA", fechaPresentacion: "2026-10-12", normaAplicable: "PLOT-A61-2021", codigoZona: "MP-C2" }, planIds: [], status: "done", ...estado } as never,
  pedidos: [{ clave: "proyecto.altura_m", reglas: 2, definicion: "número: altura CRITERIO: hasta el remate" }],
  textoZona: "Zona MP-C2.",
  conRegiones: false,
  reglasEnRevision: [{ regla_id: "R-1", titulo: "Altura", motivo_motor: "dato faltante: proyecto.altura_m", grupo: null, norma: "PLOT", articulo: "1", cita_textual: "Altura máxima 15 m." }],
  textoPagina1: '{"palabras":[["ALTURA",0.1,0.2]]}',
  numeroLaminas: 3,
});

describe("herramientas de DeepSeek", () => {
  it("las definiciones tienen el formato de tools de la API y cubren las 11 herramientas (12 con medir_dibujo)", () => {
    const defs = definicionesParaApi(false);
    expect(defs.map((d) => d.function.name).sort()).toEqual(HERRAMIENTAS.map((h) => h.nombre).sort());
    expect(defs).toHaveLength(11);
    expect(defs.map((d) => d.function.name)).toEqual(expect.arrayContaining(["medir_retiro", "buscar_texto", "ver_zona", "leer_zona"]));
    expect(defs.every((d) => d.type === "function" && d.function.parameters)).toBe(true);
  });

  it("escribir_hecho escribe con la forma de hechos y rechaza claves no pedidas o inválidas", async () => {
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(["proyecto.altura_m"]), reevaluar: async () => true };
    const ok = await escribirHecho(ctx, { clave: "proyecto.altura_m", valor: 12.5, confianza: 0.9, metodo: "lectura", detalle: "cota 12.50 en p2", pagina: 2 });
    expect(ok.texto).toContain("Escrito proyecto.altura_m");
    const lote = JSON.parse(readFileSync(join(dir, "lote.json"), "utf8")) as { proyecto: { altura_m: { valor: number; confianza: number; fuente: { metodo: string; pagina: number } } } };
    expect(lote.proyecto.altura_m).toMatchObject({ valor: 12.5, confianza: 0.9, fuente: { metodo: "lectura", pagina: 2 } });
    expect((await escribirHecho(ctx, { clave: "lote.area_m2", valor: 1, confianza: 0.9, metodo: "lectura", detalle: "" })).texto).toContain("no está entre los datos pedidos");
    expect((await escribirHecho(ctx, { clave: "sin-puntos", valor: 1, confianza: 0.9, metodo: "lectura", detalle: "" })).texto).toContain("Clave inválida");
    expect((await escribirHecho(ctx, { clave: "proyecto.altura_m", valor: { x: 1 }, confianza: 0.9, metodo: "lectura", detalle: "" })).texto).toContain("valor debe ser");
  });

  it("escribir_hecho exige texto en los datos de texto del contrato (profesional.disciplina = «arquitectura», no true)", async () => {
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(["profesional.disciplina"]), reevaluar: async () => true, tipos: new Map([["profesional.disciplina", "texto"]]) };
    expect((await escribirHecho(ctx, { clave: "profesional.disciplina", valor: true, confianza: 0.9, metodo: "vision", detalle: "" })).texto).toContain("es un texto");
    expect((await escribirHecho(ctx, { clave: "profesional.disciplina", valor: "arquitectura", confianza: 0.9, metodo: "vision", detalle: "sello" })).texto).toContain("Escrito");
  });

  it("un dato de lista cerrada solo se escribe con uno de sus valores, también en fijar_alcance (ADR-0019, ronda 80: «TERCER ORDEN»)", async () => {
    const ctx: ContextoHerramientas = {
      dir,
      pdf: null,
      clavesPermitidas: new Set(["lote.orden_conservacion"]),
      reevaluar: async () => true,
      tipos: new Map([["lote.orden_conservacion", "texto"], ["proyecto.obra_nueva", "bool"]]),
      listas: new Map([["lote.orden_conservacion", ["primer", "segundo", "tercer", "cuarto", "baldio"]]]),
    };
    const dato = { clave: "lote.orden_conservacion", valor: "TERCER ORDEN", confianza: 0.9, metodo: "lectura", detalle: "nota 2 de A-01", pagina: 1 };
    expect((await escribirHecho(ctx, dato)).texto).toContain('tiene que ser uno de: "primer"');
    expect((await escribirHecho(ctx, { ...dato, valor: "tercer" })).texto).toContain("Escrito");
    const alcance = await fijarAlcance(ctx, { datos_de_alcance: { "lote.orden_conservacion": { valor: "TERCER ORDEN" }, "proyecto.obra_nueva": { valor: "false" } } });
    expect(alcance.texto).toContain("No se fijó el alcance");
    expect(alcance.texto).toContain("es un dato sí/no");
    expect(() => readFileSync(join(dir, "alcance_ia.json"), "utf8")).toThrow();
  });
});

describe("controles del contrato en escribir_hecho", () => {
  const controlado = (medir = true): ContextoHerramientas => ({
    dir,
    pdf: null,
    clavesPermitidas: new Set(["plano.cuadro_acabados", "proyecto.retiro_posterior_m", "rampa.ancho_m"]),
    reevaluar: async () => true,
    controles: { ampliadas: new Set(), medidas: new Set(), medir, escaneadas: new Set([5]), leidas: new Set() },
  });

  it("un «no» con 0.85 o más exige haber ampliado esa lámina; con 0.6 pasa", async () => {
    const ctx = controlado();
    const no = { clave: "plano.cuadro_acabados", valor: false, confianza: 0.9, metodo: "lectura", detalle: "buscado ACABAD", pagina: 2 };
    expect((await escribirHecho(ctx, no)).texto).toContain("exige ampliar antes");
    expect((await escribirHecho(ctx, { ...no, confianza: 0.6 })).texto).toContain("Escrito");
    ctx.controles?.ampliadas.add(2);
    expect((await escribirHecho(ctx, no)).texto).toContain("Escrito");
  });

  it("con medir_dibujo, una medida dudosa o un 0 sin «no hay» exigen medir antes; no en láminas escaneadas", async () => {
    const ctx = controlado();
    const retiro = { clave: "proyecto.retiro_posterior_m", valor: 2.4, confianza: 0.7, metodo: "vision", detalle: "a ojo", pagina: 3 };
    expect((await escribirHecho(ctx, retiro)).texto).toContain("mídelo con medir_dibujo");
    expect((await escribirHecho(ctx, { ...retiro, valor: 0, confianza: 0.9 })).texto).toContain("solo si el plano muestra que el elemento no existe");
    expect((await escribirHecho(ctx, { clave: "rampa.ancho_m", valor: 0, confianza: 0.9, metodo: "vision", detalle: "no hay rampa en la planta baja", pagina: 3 })).texto).toContain("Escrito");
    expect((await escribirHecho(ctx, { ...retiro, pagina: 5 })).texto).toContain("Escrito");
    ctx.controles?.medidas.add(3);
    expect((await escribirHecho(ctx, retiro)).texto).toContain("Escrito");
    expect((await escribirHecho(controlado(false), retiro)).texto).toContain("Escrito");
  });

  it("en una lámina escaneada un número con 0.85 o más exige leer_zona en esa lámina; con 0.6 o un cálculo pasa", async () => {
    const ctx: ContextoHerramientas = { ...controlado(), clavesPermitidas: new Set(["lote.area_m2", "proyecto.densidad_pers_ha"]) };
    const area = { clave: "lote.area_m2", valor: 733.14, confianza: 0.9, metodo: "lectura", detalle: "cuadro de la finca", pagina: 5 };
    expect((await escribirHecho(ctx, area)).texto).toContain("léelo con leer_zona");
    expect((await escribirHecho(ctx, { ...area, pagina: undefined })).texto).toContain("Di en pagina");
    expect((await escribirHecho(ctx, { ...area, confianza: 0.6 })).texto).toContain("Escrito");
    expect((await escribirHecho(ctx, { clave: "proyecto.densidad_pers_ha", valor: 716, confianza: 0.9, metodo: "calculo", detalle: "", pagina: 5 })).texto).toContain("Escrito");
    // En una lámina vectorial no se controla.
    expect((await escribirHecho(ctx, { ...area, pagina: 2 })).texto).toContain("Escrito");
    ctx.controles?.leidas.add(5);
    expect((await escribirHecho(ctx, area)).texto).toContain("Escrito");
  });

  it("en una lámina escaneada el «no» pide leer_zona o ver_zona, y leerlas cuenta como ampliar", async () => {
    const ctx = controlado();
    const no = { clave: "plano.cuadro_acabados", valor: false, confianza: 0.9, metodo: "lectura", detalle: "buscado ACABAD", pagina: 5 };
    expect((await escribirHecho(ctx, no)).texto).toContain("leer_zona o ver_zona");
    // Sin PDF las herramientas no corren; lo que se prueba es que, hechas, la lámina queda como ampliada.
    ctx.controles?.ampliadas.add(5);
    expect((await escribirHecho(ctx, no)).texto).toContain("Escrito");
  });

  it("en una lámina escaneada una medida = 0 exige que el elemento no exista, con cualquier confianza", async () => {
    const ctx: ContextoHerramientas = { ...controlado(false), clavesPermitidas: new Set(["proyecto.altura_m", "proyecto.patio_lado_menor_m", "proyecto.retiro_posterior_m"]) };
    const altura = { clave: "proyecto.altura_m", valor: 0, confianza: 0.6, metodo: "vision", detalle: "la elevación no imprime la altura", pagina: 5 };
    expect((await escribirHecho(ctx, altura)).texto).toContain("no la escribas con 0");
    expect((await escribirHecho(ctx, { ...altura, pagina: undefined })).texto).toContain("no la escribas con 0");
    expect((await escribirHecho(ctx, { ...altura, clave: "proyecto.patio_lado_menor_m" })).texto).toContain("no la escribas con 0");
    // «No hay cota» no dice que el elemento falte; «adosado» sí.
    const retiro = { clave: "proyecto.retiro_posterior_m", valor: 0, confianza: 0.6, metodo: "vision", detalle: "no hay cota de retiro posterior impresa", pagina: 5 };
    expect((await escribirHecho(ctx, retiro)).texto).toContain("no la escribas con 0");
    expect((await escribirHecho(ctx, { ...retiro, detalle: "la torre está adosada al lindero posterior" })).texto).toContain("Escrito");
    // En una lámina vectorial sin medir_dibujo no se controla.
    expect((await escribirHecho(ctx, { ...altura, pagina: 2 })).texto).toContain("Escrito");
  });

  it("«no aplica» en un sí/no y la vigencia de la idoneidad sacada del plano no se escriben (ADR-0018)", async () => {
    const ctx: ContextoHerramientas = { ...controlado(false), clavesPermitidas: new Set(["rampa.inicia_en_linea_construccion", "profesional.idoneidad_jtia_vigente"]) };
    const rampa = { clave: "rampa.inicia_en_linea_construccion", valor: true, confianza: 0.9, metodo: "lectura", detalle: "no aplica: no hay rampa", pagina: 2 };
    expect((await escribirHecho(ctx, rampa)).texto).toContain("rampa.ancho_m = 0");
    expect((await escribirHecho(ctx, { ...rampa, valor: false, detalle: "No aplica, sin rampas" })).texto).toContain("NO_APLICA");
    expect((await escribirHecho(ctx, { ...rampa, detalle: "la rampa arranca detrás de la línea de construcción" })).texto).toContain("Escrito");
    const jtia = { clave: "profesional.idoneidad_jtia_vigente", valor: true, confianza: 0.6, metodo: "vision", detalle: "sello con licencia", pagina: 1 };
    expect((await escribirHecho(ctx, jtia)).texto).toContain("no sale del plano");
    expect((await escribirHecho(ctx, { ...jtia, metodo: "expediente", documento: "constancia-jtia.pdf" })).texto).toContain("Escrito");
  });

  it("el frente del lote no sale de una elevación ni de un corte", async () => {
    const ctx: ContextoHerramientas = { ...controlado(false), clavesPermitidas: new Set(["lote.frente_m"]) };
    const frente = { clave: "lote.frente_m", valor: 24.16, confianza: 0.6, metodo: "lectura", detalle: "elevación frontal: cota 24.16 sobre el ancho de la fachada", pagina: 2 };
    expect((await escribirHecho(ctx, frente)).texto).toContain("nunca de una elevación");
    // Un detalle que no dice de qué vista sale tampoco pasa.
    expect((await escribirHecho(ctx, { ...frente, detalle: "cota 24.16 leída con leer_zona" })).texto).toContain("nunca de una elevación");
    expect((await escribirHecho(ctx, { ...frente, metodo: "calculo", detalle: "área / fondo" })).texto).toContain("Escrito");
    expect((await escribirHecho(ctx, { ...frente, valor: 27.41, detalle: "localización general: cota 27.41 de la línea de propiedad sobre la calle" })).texto).toContain("Escrito");
  });
});

describe("mosaico de ver_zona", () => {
  it("parte la zona en filas×filas teselas con solape, sin salirse de la zona, y cuesta una imagen por tesela", () => {
    const t = teselasDelMosaico([0, 0, 1, 1], 3, 0.04);
    expect(t).toHaveLength(9);
    expect(t[0]).toEqual([0, 0, 0.373, 0.373]);
    expect(t[4]).toEqual([0.293, 0.293, 0.707, 0.707]);
    expect(t[8]).toEqual([0.627, 0.627, 1, 1]);
    const parte = teselasDelMosaico([0.5, 0.5, 1, 1], 2, 0.04);
    expect(parte.every(([a, b, c, d]) => a >= 0.5 && b >= 0.5 && c <= 1 && d <= 1)).toBe(true);
    expect(costoDeVerZona({ filas: 2 })).toBe(4);
    expect(costoDeVerZona({})).toBe(9);
  });
});

describe("bucle de DeepSeek", () => {
  it("si cierra sin decidir reglas vigentes en revisión se le devuelve una vez y se juntan las decisiones", async () => {
    let n = 0;
    const cliente: Cliente = async () => {
      n += 1;
      if (n === 1) return { message: { role: "assistant", content: '{"conclusion":"x","supuestos":[],"decisiones":[{"regla_id":"R-1","decision":"CUMPLE","justificacion":"ok"}]}' }, finish_reason: "stop", usage: uso };
      return { message: { role: "assistant", content: '{"conclusion":"y","supuestos":[],"decisiones":[{"regla_id":"R-2","decision":"OBSERVACION","justificacion":"falta cota"}]}' }, finish_reason: "stop", usage: uso };
    };
    writeFileSync(join(dir, "resultado.json"), JSON.stringify({ resultados: [{ regla_id: "R-1", resultado: "REQUIERE_REVISION" }, { regla_id: "R-2", resultado: "REQUIERE_REVISION" }, { regla_id: "R-9", resultado: "REQUIERE_REVISION", grupo: "zona_por_confirmar" }] }));
    const registro = registroEn(dir);
    const r = await revisarConDeepSeek(cliente, { dir, pdf: null, clavesPermitidas: new Set(), reevaluar: async () => true }, { ...entrada(), pedidos: [] }, registro, dir);
    expect(n).toBe(2);
    expect(r.dictamen.decisiones.map((d) => d.regla_id).sort()).toEqual(["R-1", "R-2"]);
    expect((registro as unknown as { lineas: string[] }).lineas.join("\n")).toContain("Cierre devuelto por cobertura: 1 regla(s)");
  });

  it("ejecuta las herramientas que pide, devuelve reasoning_content y termina con el dictamen; anota el gasto", async () => {
    const vistos: Mensaje[][] = [];
    let n = 0;
    const cliente: Cliente = async (mensajes) => {
      vistos.push(structuredClone(mensajes));
      n += 1;
      if (n === 1) return { message: { role: "assistant", content: "", reasoning_content: "pienso", tool_calls: [llamada("escribir_hecho", { clave: "proyecto.altura_m", valor: 14, confianza: 0.9, metodo: "lectura", detalle: "p2" })] }, finish_reason: "tool_calls", usage: uso };
      if (n === 2) return { message: { role: "assistant", content: "", reasoning_content: "ahora reevalúo", tool_calls: [llamada("reevaluar", {}, "c2")] }, finish_reason: "tool_calls", usage: uso };
      return { message: { role: "assistant", content: '{"conclusion":"CUMPLE LAS REGLAS EVALUADAS","supuestos":[],"decisiones":[{"regla_id":"R-1","decision":"CUMPLE","justificacion":"14 < 15","evidencia":[{"pagina":2}]}]}' }, finish_reason: "stop", usage: uso };
    };
    writeFileSync(join(dir, "resultado.json"), JSON.stringify({ resultados: [{ regla_id: "R-1", resultado: "CUMPLE" }] }));
    let reevaluado = 0;
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(["proyecto.altura_m"]), reevaluar: async () => (reevaluado += 1, true) };
    const r = await revisarConDeepSeek(cliente, ctx, entrada(), registroEn(dir), dir);
    expect(r.dictamen.decisiones[0]).toMatchObject({ regla_id: "R-1", decision: "CUMPLE" });
    expect(r.llamadas).toBe(3);
    expect(r.herramientas).toEqual({ escribir_hecho: 1, reevaluar: 1 });
    expect(reevaluado).toBe(1);
    // El asistente va con su reasoning_content y la respuesta de la herramienta llega como mensaje tool.
    const segunda = vistos[1];
    expect(segunda.find((m) => m.role === "assistant")?.reasoning_content).toBe("pienso");
    expect(segunda.find((m) => m.role === "tool")?.content).toContain("Escrito proyecto.altura_m");
    expect(vistos[0][0].role).toBe("system");
    expect(String(vistos[0][1].content)).toContain("proyecto.altura_m (2 reglas)");
    const gasto = await leerGasto(dir);
    expect(gasto.llamadas).toBe(3);
    expect(gasto.usd).toBeCloseTo(3 * costoDe(1000, 200), 6);
  });

  it("con varias herramientas en un turno, responde a cada tool_call_id antes de mandar las imágenes", async () => {
    let n = 0;
    const vistos: Mensaje[][] = [];
    const cliente: Cliente = async (mensajes) => {
      vistos.push(structuredClone(mensajes));
      n += 1;
      if (n === 1) return { message: { role: "assistant", content: "", tool_calls: [llamada("escribir_hecho", { clave: "proyecto.altura_m", valor: 1, confianza: 0.9, metodo: "lectura", detalle: "" }, "a"), llamada("medir_membrete", {}, "b")] }, finish_reason: "tool_calls", usage: uso };
      return { message: { role: "assistant", content: '{"conclusion":"x","supuestos":[],"decisiones":[]}' }, finish_reason: "stop", usage: uso };
    };
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(["proyecto.altura_m"]), reevaluar: async () => true };
    await revisarConDeepSeek(cliente, ctx, entrada(), registroEn(dir), dir);
    const roles = vistos[1].map((m) => m.role);
    // system, user, assistant(tool_calls), tool a, tool b — sin ningún user entre los tool.
    expect(roles).toEqual(["system", "user", "assistant", "tool", "tool"]);
    expect(vistos[1].filter((m) => m.role === "tool").map((m) => m.tool_call_id)).toEqual(["a", "b"]);
  });

  it("si cierra con menos del 70 % de los datos pedidos escritos, se le devuelve el cierre con la lista, hasta dos veces", async () => {
    const pedidos = ["a.uno_m", "a.dos_m", "a.tres_m", "a.cuatro_m"].map((clave) => ({ clave, reglas: 1 }));
    const cierre = { message: { role: "assistant" as const, content: '{"conclusion":"x","supuestos":[],"decisiones":[]}' }, finish_reason: "stop", usage: uso };
    const vistos: string[] = [];
    let n = 0;
    const cliente: Cliente = async (ms) => {
      n += 1;
      const ultimo = ms[ms.length - 1];
      if (typeof ultimo.content === "string" && ultimo.content.startsWith("Todavía no")) vistos.push(ultimo.content);
      // Escribe uno, intenta cerrar; tras la primera devolución escribe otro; tras la segunda, cierra igual.
      if (n === 1) return { message: { role: "assistant", content: "", tool_calls: [llamada("escribir_hecho", { clave: "a.uno_m", valor: 1, confianza: 0.9, metodo: "lectura", detalle: "" })] }, finish_reason: "tool_calls", usage: uso };
      if (n === 3) return { message: { role: "assistant", content: "", tool_calls: [llamada("escribir_hecho", { clave: "a.dos_m", valor: 2, confianza: 0.9, metodo: "lectura", detalle: "" }, "c2")] }, finish_reason: "tool_calls", usage: uso };
      return cierre;
    };
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(pedidos.map((p) => p.clave)), reevaluar: async () => true };
    const r = await revisarConDeepSeek(cliente, ctx, { ...entrada(), pedidos }, registroEn(dir), dir);
    expect(vistos).toHaveLength(2);
    expect(vistos[0]).toContain("escribiste 1 de 4");
    expect(vistos[0]).toContain("a.dos_m, a.tres_m, a.cuatro_m");
    expect(vistos[1]).toContain("escribiste 2 de 4");
    expect(r.herramientas.escribir_hecho).toBe(2);
    expect(r.dictamen.decisiones).toEqual([]);
  });

  it("si se corta por longitud sin contenido pide continuar; si cierra sin escribir datos, lo recuerda una vez", async () => {
    let n = 0;
    const pedidos: string[] = [];
    const cliente: Cliente = async (mensajes) => {
      n += 1;
      pedidos.push(String(mensajes[mensajes.length - 1].content).slice(0, 40));
      if (n === 1) return { message: { role: "assistant", content: "", reasoning_content: "…" }, finish_reason: "length", usage: uso };
      if (n === 2) return { message: { role: "assistant", content: '{"conclusion":"x","supuestos":[],"decisiones":[]}' }, finish_reason: "stop", usage: uso };
      if (n === 3) return { message: { role: "assistant", content: "", tool_calls: [llamada("escribir_hecho", { clave: "proyecto.altura_m", valor: 1, confianza: 0.9, metodo: "lectura", detalle: "" })] }, finish_reason: "tool_calls", usage: uso };
      return { message: { role: "assistant", content: '{"conclusion":"ok","supuestos":[],"decisiones":[]}' }, finish_reason: "stop", usage: uso };
    };
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(["proyecto.altura_m"]), reevaluar: async () => true };
    const r = await revisarConDeepSeek(cliente, ctx, entrada(), registroEn(dir), dir);
    expect(r.dictamen.conclusion).toBe("ok");
    expect(pedidos[1]).toContain("Tu respuesta se cortó");
    expect(pedidos[2]).toContain("Todavía no escribiste");
    expect(r.herramientas.escribir_hecho).toBe(1);
  });

  it("si la respuesta final no es JSON pide el cierre una vez y luego falla", async () => {
    let n = 0;
    const cliente: Cliente = async () => {
      n += 1;
      return { message: { role: "assistant", content: "no soy json" }, finish_reason: "stop", usage: uso };
    };
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(), reevaluar: async () => true };
    // Con datos pedidos vacíos no hay recordatorio de escribir_hecho: el bucle pide el cierre y luego falla.
    await expect(revisarConDeepSeek(cliente, ctx, { ...entrada(), pedidos: [] }, registroEn(dir), dir)).rejects.toThrow(/dictamen JSON/);
    expect(n).toBe(2);
  });

  it("no lanza si el gasto acumulado ya llegó al tope", async () => {
    writeFileSync(join(dir, "deepseek_gasto.json"), JSON.stringify({ usd: TOPE_USD, llamadas: 1, tokens_entrada: 0, tokens_salida: 0 }));
    const cliente: Cliente = async () => {
      throw new Error("no debe llamar");
    };
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(), reevaluar: async () => true };
    await expect(revisarConDeepSeek(cliente, ctx, entrada(), registroEn(dir), dir)).rejects.toThrow(/Tope de gasto/);
  });

  it("recorta del historial los resultados largos y las imágenes ya consumidos, no los del último turno", async () => {
    const { recortarHistorial } = await import("./deepseek");
    const largo = "x".repeat(2000);
    const ms: Mensaje[] = [
      { role: "system", content: "s" }, { role: "user", content: "u" },
      { role: "assistant", content: "", tool_calls: [llamada("texto_pagina", { pagina: 1 }, "a")] },
      { role: "tool", tool_call_id: "a", content: largo },
      { role: "user", content: [{ type: "text", text: "Recorte" }, { type: "image_url", image_url: { url: "data:x" } }] },
      { role: "assistant", content: "", tool_calls: [llamada("texto_pagina", { pagina: 2 }, "b")] },
      { role: "tool", tool_call_id: "b", content: largo },
    ];
    // Con dos turnos del asistente, el corte está en el penúltimo (índice 2): lo anterior ya está consumido, pero el
    // intercambio 2–6 (que el modelo todavía usa) se conserva entero.
    recortarHistorial(ms);
    expect(ms[3].content).toBe(largo);
    expect(ms[6].content).toBe(largo);
    ms.push({ role: "assistant", content: "", tool_calls: [llamada("texto_pagina", { pagina: 3 }, "c")] }, { role: "tool", tool_call_id: "c", content: largo });
    recortarHistorial(ms);
    expect(String(ms[3].content)).toContain("resultado ya leído");
    expect(JSON.stringify(ms[4].content)).toContain("recorte ya visto");
    expect(ms[6].content).toBe(largo);
    expect(ms[8].content).toBe(largo);
  });

  it("con la variante de razonamiento quita el reasoning_content de los turnos consumidos y conserva los tool_calls", async () => {
    const { recortarHistorial, variantesDeepSeek, sistemaDeepSeek, SISTEMA_DEEPSEEK, PARRAFO_MEDIR, PARRAFO_ESCANEADOS } = await import("./deepseek");
    const ms: Mensaje[] = [
      { role: "system", content: "s" }, { role: "user", content: "u" },
      { role: "assistant", content: "", reasoning_content: "pienso 1", tool_calls: [llamada("texto_pagina", { pagina: 1 }, "a")] },
      { role: "tool", tool_call_id: "a", content: "t" },
      { role: "assistant", content: "", reasoning_content: "pienso 2", tool_calls: [llamada("texto_pagina", { pagina: 2 }, "b")] },
      { role: "tool", tool_call_id: "b", content: "t" },
      { role: "assistant", content: "", reasoning_content: "pienso 3", tool_calls: [llamada("texto_pagina", { pagina: 3 }, "c")] },
    ];
    recortarHistorial(ms);
    expect(ms[2].reasoning_content).toBe("pienso 1");
    recortarHistorial(ms, { llamadas: 3, entrada: { pedidos: [], reglasEnRevision: [], estado: {} } as never, escritas: new Set(), razonamiento: true });
    expect(ms[2].reasoning_content).toBeUndefined();
    expect(ms[2].tool_calls).toHaveLength(1);
    expect(ms[4].reasoning_content).toBe("pienso 2");
    expect(ms[6].reasoning_content).toBe("pienso 3");
    // Sin variables de entorno no hay variante; el prompt lleva siempre los párrafos de medir_dibujo y de las láminas escaneadas (21-oct).
    expect(variantesDeepSeek()).toBe("");
    expect(sistemaDeepSeek().startsWith(`${SISTEMA_DEEPSEEK}${PARRAFO_MEDIR}${PARRAFO_ESCANEADOS}\n\nCONTRATO DE REVISIÓN`)).toBe(true);
    // Escaneados (r79): los «no» revisados van con 0.9 y los símbolos se miran en un recorte chico.
    expect(PARRAFO_ESCANEADOS).toContain("AUSENCIAS EN LÁMINAS ESCANEADAS");
    expect(PARRAFO_ESCANEADOS).toContain("FRENTE Y FONDO DEL LOTE");
    expect(PARRAFO_ESCANEADOS).toContain("MEDIDAS EN CERO");
    expect(PARRAFO_ESCANEADOS).toContain("un ver_recorte chico");
  });

  it("escribir_hecho acepta las medidas *_min/*_max que piden las reglas y rechaza booleanos en datos de medida", async () => {
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(["acera.junta_ancho_max_cm", "proyecto.retiro_posterior_m", "proyecto.retiro_min_m"]), reevaluar: async () => true };
    expect((await escribirHecho(ctx, { clave: "acera.junta_ancho_max_cm", valor: 1, confianza: 0.9, metodo: "lectura", detalle: "" })).texto).toContain("Escrito");
    expect((await escribirHecho(ctx, { clave: "proyecto.retiro_min_m", valor: 10.5, confianza: 0.9, metodo: "medicion", detalle: "" })).texto).toContain("Escrito");
    expect((await escribirHecho(ctx, { clave: "proyecto.retiro_posterior_m", valor: false, confianza: 0.9, metodo: "lectura", detalle: "" })).texto).toContain("necesita un número");
    expect((await escribirHecho(ctx, { clave: "proyecto.retiro_posterior_m", valor: Number.NaN, confianza: 0.9, metodo: "lectura", detalle: "" })).texto).toContain("valor debe ser");
    expect((await escribirHecho(ctx, { clave: "proyecto.retiro_posterior_m", valor: 2.5, confianza: 0.9, metodo: "medicion", detalle: "p1" })).texto).toContain("Escrito");
  });

  it("escribir_hecho respeta el tipo del contrato de datos: un sí/no no se escribe como texto ni un número como true", async () => {
    const tipos = new Map([
      ["profesional.disciplina", "bool"],
      ["plano.estacionamientos.directos_calle", "bool"],
      ["proyecto.densidad_pers_ha", "numero"],
    ]);
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(tipos.keys()), reevaluar: async () => true, tipos };
    expect((await escribirHecho(ctx, { clave: "profesional.disciplina", valor: "arquitectura", confianza: 0.9, metodo: "lectura", detalle: "" })).texto).toContain("es un dato sí/no");
    expect((await escribirHecho(ctx, { clave: "plano.estacionamientos.directos_calle", valor: "sí", confianza: 0.9, metodo: "lectura", detalle: "" })).texto).toContain("es un dato sí/no");
    expect((await escribirHecho(ctx, { clave: "proyecto.densidad_pers_ha", valor: true, confianza: 0.9, metodo: "lectura", detalle: "" })).texto).toContain("es un número");
    expect((await escribirHecho(ctx, { clave: "profesional.disciplina", valor: true, confianza: 0.9, metodo: "lectura", detalle: "sello JTIA" })).texto).toContain("Escrito");
    expect((await escribirHecho(ctx, { clave: "proyecto.densidad_pers_ha", valor: 716, confianza: 0.9, metodo: "calculo", detalle: "" })).texto).toContain("Escrito");
    // Sin contrato (tipos ausente) no se comprueba.
    const sin: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(["profesional.disciplina"]), reevaluar: async () => true };
    expect((await escribirHecho(sin, { clave: "profesional.disciplina", valor: "arquitectura", confianza: 0.9, metodo: "lectura", detalle: "" })).texto).toContain("Escrito");
  });

  it("con clavesPermitidas vacío no se escribe nada, y los datos del usuario (zona, norma) nunca", async () => {
    const vacio: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(), reevaluar: async () => true };
    expect((await escribirHecho(vacio, { clave: "proyecto.altura_m", valor: 1, confianza: 0.9, metodo: "lectura", detalle: "" })).texto).toContain("no se escribe");
    const conZona: ContextoHerramientas = { ...vacio, clavesPermitidas: new Set(["lote.codigo_zona", "lote.norma_aplicable.x"]) };
    expect((await escribirHecho(conZona, { clave: "lote.codigo_zona", valor: "MP-R1", confianza: 0.9, metodo: "lectura", detalle: "" })).texto).toContain("no se escribe");
    expect((await escribirHecho(conZona, { clave: "lote.norma_aplicable.x", valor: 1, confianza: 0.9, metodo: "lectura", detalle: "" })).texto).toContain("no se escribe");
  });

  it("listaFaltantes lee la lista aunque datos_pedidos.py salga con código 1; sin JSON devuelve vacío", () => {
    expect(listaFaltantes(JSON.stringify({ pedidos: [], faltan: ["proyecto.altura_m", "lote.area_m2"] }))).toEqual(["proyecto.altura_m", "lote.area_m2"]);
    expect(listaFaltantes("")).toEqual([]);
    expect(listaFaltantes("[]")).toEqual([]);
  });

  it("tras el límite de llamadas, si el modelo sigue pidiendo herramientas el bucle corta", async () => {
    const { MAX_LLAMADAS } = await import("./deepseek");
    let n = 0;
    const cliente: Cliente = async () => {
      n += 1;
      return { message: { role: "assistant", content: "", tool_calls: [llamada("medir_membrete", {}, `m${n}`)] }, finish_reason: "tool_calls", usage: uso };
    };
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(), reevaluar: async () => true };
    await expect(revisarConDeepSeek(cliente, ctx, { ...entrada(), pedidos: [] }, registroEn(dir), dir)).rejects.toThrow(/dictamen JSON|no cerró/);
    expect(n).toBeLessThanOrEqual(MAX_LLAMADAS + 3);
  }, 60_000); // medir_membrete lanza Python de verdad en cada vuelta

  it("anotar el gasto desde varias revisiones en paralelo no pierde llamadas", async () => {
    const cliente: Cliente = async () => ({ message: { role: "assistant", content: '{"conclusion":"x","supuestos":[],"decisiones":[]}' }, finish_reason: "stop", usage: uso });
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(), reevaluar: async () => true };
    await Promise.all(Array.from({ length: 5 }, () => revisarConDeepSeek(cliente, ctx, { ...entrada(), pedidos: [] }, registroEn(dir), dir)));
    const g = await leerGasto(dir);
    expect(g.llamadas).toBe(5);
    expect(g.usd).toBeCloseTo(5 * costoDe(1000, 200), 6);
  });

  it("argumentos que no son JSON se devuelven al modelo como inválidos sin ejecutar la herramienta", async () => {
    let n = 0;
    const vistos: Mensaje[][] = [];
    const cliente: Cliente = async (mensajes) => {
      vistos.push(structuredClone(mensajes));
      n += 1;
      if (n === 1) return { message: { role: "assistant", content: "", tool_calls: [{ id: "x", type: "function", function: { name: "escribir_hecho", arguments: "{clave: proyecto" } }] }, finish_reason: "tool_calls", usage: uso };
      return { message: { role: "assistant", content: '{"conclusion":"x","supuestos":[],"decisiones":[]}' }, finish_reason: "stop", usage: uso };
    };
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(), reevaluar: async () => true };
    await revisarConDeepSeek(cliente, ctx, { ...entrada(), pedidos: [] }, registroEn(dir), dir);
    expect(String(vistos[1].find((m) => m.role === "tool")?.content)).toContain("no son JSON");
  });

  it("pasado el tope de recortes, ver_recorte ya no se ejecuta y se le pide escribir", async () => {
    const { MAX_RECORTES } = await import("./deepseek");
    let n = 0;
    const vistos: Mensaje[][] = [];
    const cliente: Cliente = async (mensajes) => {
      vistos.push(structuredClone(mensajes));
      n += 1;
      if (n <= MAX_RECORTES + 1) return { message: { role: "assistant", content: "", tool_calls: [llamada("ver_recorte", { pagina: 1, x0: 0, y0: 0, x1: 0.1, y1: 0.1 }, `r${n}`)] }, finish_reason: "tool_calls", usage: uso };
      return { message: { role: "assistant", content: '{"conclusion":"x","supuestos":[],"decisiones":[]}' }, finish_reason: "stop", usage: uso };
    };
    // Sin PDF, ver_recorte responde «No hay PDF» hasta el tope; después, el aviso.
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(), reevaluar: async () => true };
    const r = await revisarConDeepSeek(cliente, ctx, { ...entrada(), pedidos: [] }, registroEn(dir), dir);
    expect(r.herramientas.ver_recorte).toBe(MAX_RECORTES + 1);
    const ultimaTool = vistos[vistos.length - 1].filter((m) => m.role === "tool").pop();
    expect(String(ultimaTool?.content)).toContain("Ya usaste los");
  });

  it("ver_zona cuenta una imagen por tesela contra el tope de recortes: un mosaico que no cabe no se ejecuta", async () => {
    const { MAX_RECORTES } = await import("./deepseek");
    let n = 0;
    const vistos: Mensaje[][] = [];
    // Recortes sueltos hasta dejar 3 libres; después un mosaico 3×3 (9) no cabe y se le ofrece uno de 2×2.
    const cliente: Cliente = async (mensajes) => {
      vistos.push(structuredClone(mensajes));
      n += 1;
      if (n <= MAX_RECORTES - 3) return { message: { role: "assistant", content: "", tool_calls: [llamada("ver_recorte", { pagina: 1, x0: 0, y0: 0, x1: 0.1, y1: 0.1 }, `r${n}`)] }, finish_reason: "tool_calls", usage: uso };
      if (n === MAX_RECORTES - 2) return { message: { role: "assistant", content: "", tool_calls: [llamada("ver_zona", { pagina: 1, filas: 3 }, "z")] }, finish_reason: "tool_calls", usage: uso };
      return { message: { role: "assistant", content: '{"conclusion":"x","supuestos":[],"decisiones":[]}' }, finish_reason: "stop", usage: uso };
    };
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(), reevaluar: async () => true };
    await revisarConDeepSeek(cliente, ctx, { ...entrada(), pedidos: [] }, registroEn(dir), dir);
    const ultimaTool = vistos[vistos.length - 1].filter((m) => m.role === "tool").pop();
    expect(String(ultimaTool?.content)).toContain("Ese mosaico son 9 imágenes y te quedan 3");
  });

  it("si cierra tras escribir datos sin reevaluar, el bucle reevalúa por su cuenta", async () => {
    let n = 0;
    const cliente: Cliente = async () => {
      n += 1;
      if (n === 1) return { message: { role: "assistant", content: "", tool_calls: [llamada("escribir_hecho", { clave: "proyecto.altura_m", valor: 9, confianza: 0.9, metodo: "lectura", detalle: "" })] }, finish_reason: "tool_calls", usage: uso };
      return { message: { role: "assistant", content: '{"conclusion":"x","supuestos":[],"decisiones":[]}' }, finish_reason: "stop", usage: uso };
    };
    let reevaluado = 0;
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(["proyecto.altura_m"]), reevaluar: async () => (reevaluado += 1, true) };
    await revisarConDeepSeek(cliente, ctx, entrada(), registroEn(dir), dir);
    expect(reevaluado).toBe(1);
  });

  it("el mensaje inicial lleva datos, criterio, reglas y texto de la lámina 1", () => {
    const m = mensajeInicial(entrada());
    expect(m).toContain("CRITERIO: hasta el remate");
    expect(m).toContain("R-1 — Altura");
    expect(m).toContain("3 láminas");
    expect(m).toContain("ALTURA");
  });

  it("con una lámina 1 enorme el mensaje inicial cabe en el límite y conserva datos, criterio y reglas", () => {
    // 2000 renglones de unos 40 caracteres (≈ 80 000): pasa con creces el tope y deja una marca después del corte.
    const renglones = Array.from({ length: 2000 }, (_, i) => `0.100 ${(i / 2000).toFixed(3)} RENGLON ${i} DEL MEMBRETE`);
    const texto = `Lámina 1 (vectorial): 2001 líneas.\n${renglones.join("\n")}\n0.900 0.990 MARCA-AL-FINAL`;
    const m = mensajeInicial({ ...entrada(), textoPagina1: texto });
    const lamina = m.slice(m.indexOf("TEXTO DE LA LÁMINA 1"));
    expect(lamina.length).toBeLessThanOrEqual(LIMITE_TEXTO_PAGINA1 + 200);
    expect(m.length).toBeLessThan(LIMITE_TEXTO_PAGINA1 + 2_000);
    expect(m).toContain("RENGLON 0 DEL MEMBRETE");
    expect(m).not.toContain("MARCA-AL-FINAL");
    expect(m).toMatch(/recortado: \d+ líneas más; localiza el resto con buscar_texto/);
    // El corte cae en un salto de línea: el último renglón mostrado está entero.
    const lineas = lamina.split("\n");
    expect(lineas[lineas.findIndex((l) => l.startsWith("…(recortado")) - 1]).toMatch(/^0\.100 0\.\d{3} RENGLON \d+ DEL MEMBRETE$/);
    expect(m).toContain("proyecto.altura_m (2 reglas): número: altura CRITERIO: hasta el remate");
    expect(m).toContain("R-1 — Altura");
    expect(m).toContain("Altura máxima 15 m.");
  });

  it("el recorte cambia el mensaje inicial por su versión corta desde la llamada 6: solo claves sin escribir, reglas por id y título", () => {
    const pedidos = [
      { clave: "a.uno_m", reglas: 1, definicion: "CRITERIO-UNO: el de la planta" },
      { clave: "a.dos_m", reglas: 3, definicion: "CRITERIO-DOS: el del corte" },
    ];
    const e = { ...entrada(), pedidos };
    const completo = mensajeInicial(e);
    const nuevos = (): Mensaje[] => [
      { role: "system", content: "s" }, { role: "user", content: completo },
      { role: "assistant", content: "", tool_calls: [llamada("escribir_hecho", { clave: "a.uno_m" }, "a")] },
      { role: "tool", tool_call_id: "a", content: "Escrito a.uno_m = 1" },
      { role: "assistant", content: "", tool_calls: [llamada("buscar_texto", { patron: "X" }, "b")] },
      { role: "tool", tool_call_id: "b", content: "{}" },
    ];
    const escritas = new Set(["a.uno_m"]);
    // Tras 4 llamadas (la siguiente es la 5) el inicial sigue entero.
    const antes = nuevos();
    recortarHistorial(antes, { llamadas: 4, entrada: e, escritas });
    expect(antes[1].content).toBe(completo);
    // Tras 5 llamadas, la 6 ya lo recibe corto.
    const ms = nuevos();
    const roles = ms.map((m) => m.role);
    recortarHistorial(ms, { llamadas: 5, entrada: e, escritas });
    const corto = String(ms[1].content);
    expect(ms.map((m) => m.role)).toEqual(roles);
    expect(ms[0]).toEqual({ role: "system", content: "s" });
    expect(corto).toBe(mensajeInicialCorto(e, escritas));
    expect(corto).toContain("a.dos_m (3 reglas): CRITERIO-DOS: el del corte");
    expect(corto).toContain("1 de 2");
    expect(corto).not.toContain("a.uno_m");
    expect(corto).not.toContain("CRITERIO-UNO");
    expect(corto).toContain("- R-1 — Altura");
    expect(corto).not.toContain("Altura máxima 15 m.");
    expect(corto).not.toContain("TEXTO DE LA LÁMINA 1");
    expect(corto).not.toContain("ALTURA");
    expect(corto).toContain("Zona MP-C2.");
    expect(corto.length).toBeLessThan(completo.length);
    // Con todo escrito ya no lista criterios.
    expect(mensajeInicialCorto(e, new Set(["a.uno_m", "a.dos_m"]))).not.toContain("CRITERIO");
  });

  it("en el bucle, la llamada 6 recibe el inicial corto, los roles alternan y los avisos no repiten criterios", async () => {
    const pedidos = [
      { clave: "a.uno_m", reglas: 1, definicion: "CRITERIO-UNO: el de la planta" },
      { clave: "a.dos_m", reglas: 1, definicion: "CRITERIO-DOS: el del corte" },
    ];
    const cierre = { message: { role: "assistant" as const, content: '{"conclusion":"x","supuestos":[],"decisiones":[]}' }, finish_reason: "stop", usage: uso };
    const vistos: Mensaje[][] = [];
    let n = 0;
    const cliente: Cliente = async (ms) => {
      vistos.push(structuredClone(ms));
      n += 1;
      if (n === 1) return { message: { role: "assistant", content: "", reasoning_content: "r", tool_calls: [llamada("escribir_hecho", { clave: "a.uno_m", valor: 1, confianza: 0.9, metodo: "lectura", detalle: "" }, "e1")] }, finish_reason: "tool_calls", usage: uso };
      // Sin PDF, buscar_texto responde al instante «No hay PDF disponible».
      if (n <= 6) return { message: { role: "assistant", content: "", reasoning_content: "r", tool_calls: [llamada("buscar_texto", { patron: "CORTE" }, `b${n}`)] }, finish_reason: "tool_calls", usage: uso };
      if (n === 8) return { message: { role: "assistant", content: "", reasoning_content: "r", tool_calls: [llamada("escribir_hecho", { clave: "a.dos_m", valor: 2, confianza: 0.9, metodo: "lectura", detalle: "" }, "e2")] }, finish_reason: "tool_calls", usage: uso };
      return cierre;
    };
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(pedidos.map((p) => p.clave)), reevaluar: async () => true };
    const e = { ...entrada(), pedidos };
    await revisarConDeepSeek(cliente, ctx, e, registroEn(dir), dir);
    expect(vistos.length).toBeGreaterThanOrEqual(9);
    // Las llamadas 1 a 5 llevan el inicial entero; desde la 6, el corto con lo que falta.
    for (const v of vistos.slice(0, 5)) expect(v[1].content).toBe(mensajeInicial(e));
    expect(vistos[5][1].content).toBe(mensajeInicialCorto(e, new Set(["a.uno_m"])));
    for (const [i, v] of vistos.entries()) {
      const roles = v.map((m) => m.role);
      expect(roles.slice(0, 2)).toEqual(["system", "user"]);
      expect(roles.filter((r) => r === "system")).toHaveLength(1);
      // Cada tool responde a una llamada del asistente justo antes (o a otro tool del mismo turno); nunca dos asistentes seguidos.
      roles.forEach((r, j) => {
        if (r === "tool") expect(["assistant", "tool"]).toContain(roles[j - 1]);
        if (r === "assistant") expect(roles[j - 1]).not.toBe("assistant");
      });
      // El recorte no quita ni reordena mensajes: cada llamada extiende la anterior.
      if (i > 0) expect(roles.slice(0, vistos[i - 1].length)).toEqual(vistos[i - 1].map((m) => m.role));
    }
    // La devolución del cierre («Todavía no…») lista claves, sin criterios.
    const devolucion = vistos.flat().find((m) => m.role === "user" && typeof m.content === "string" && m.content.startsWith("Todavía no"));
    expect(String(devolucion?.content)).toContain("a.dos_m");
    expect(String(devolucion?.content)).not.toContain("CRITERIO");
  });
});

describe("datos de alcance", () => {
  it("el mensaje inicial los lista solo si hay", async () => {
    const { mensajeInicial } = await import("./deepseek");
    const base = { estado: { datos: {} } as never, pedidos: [], textoZona: "", conRegiones: false, reglasEnRevision: [], textoPagina1: "", numeroLaminas: null };
    expect(mensajeInicial(base)).not.toContain("DATOS DE ALCANCE");
    expect(mensajeInicial({ ...base, alcance: ["rampa.sentidos", "proyecto.obra_nueva"] })).toContain("DATOS DE ALCANCE (opcionales)");
  });
});

describe("medir_dibujo y documentos complementarios", () => {
  it("medir_dibujo solo se presta con la variante; valida lámina, zona y puntos antes de lanzar Python", async () => {
    const { HERRAMIENTA_MEDIR, medirDibujo } = await import("./herramientas-deepseek");
    expect(definicionesParaApi(false).map((d) => d.function.name)).not.toContain("medir_dibujo");
    expect(definicionesParaApi(true).map((d) => d.function.name)).toContain(HERRAMIENTA_MEDIR.nombre);
    const ctx: ContextoHerramientas = { dir, pdf: join(dir, "no-existe.pdf"), clavesPermitidas: new Set(), reevaluar: async () => true };
    expect((await medirDibujo({ ...ctx, pdf: null }, { pagina: 1, x0: 0, y0: 0, x1: 1, y1: 1 })).texto).toContain("No hay PDF");
    expect((await medirDibujo(ctx, { pagina: 0, x0: 0, y0: 0, x1: 1, y1: 1 })).texto).toContain("Página inválida");
    expect((await medirDibujo(ctx, { pagina: 1, x0: 0.5, y0: 0, x1: 0.2, y1: 1 })).texto).toContain("Zona inválida");
    expect((await medirDibujo(ctx, { pagina: 1, x0: 0, y0: 0, x1: 1, y1: 1, de: [0.1, 0.2] })).texto).toContain("de y a deben ser");
  });

  it("buscar_texto y texto_pagina rechazan un documento que no existe y dicen cuáles hay", async () => {
    const { buscarTexto, textoPagina } = await import("./herramientas-deepseek");
    const ctx: ContextoHerramientas = { dir, pdf: null, clavesPermitidas: new Set(), reevaluar: async () => true, documentos: [{ archivo: "complementario-1.pdf", nombre: "Memoria.pdf", ruta: join(dir, "complementario-1.pdf") }] };
    expect((await buscarTexto(ctx, { patron: "RETIRO", documento: "complementario-9" })).texto).toContain("plano, complementario-1");
    expect((await textoPagina(ctx, 1, "otro.pdf")).texto).toContain("No hay documento «otro»");
    expect((await textoPagina({ ...ctx, documentos: undefined }, 1, "complementario-1")).texto).toContain("no hay complementarios");
  });

  it("el mensaje inicial lista los documentos complementarios y dice que prevalece el plano", () => {
    const base = { estado: { datos: {} } as never, pedidos: [], textoZona: "", conRegiones: false, reglasEnRevision: [], textoPagina1: "", numeroLaminas: null };
    expect(mensajeInicial(base)).not.toContain("DOCUMENTOS COMPLEMENTARIOS");
    const m = mensajeInicial({ ...base, documentos: [{ archivo: "complementario-1.pdf", nombre: "Memoria descriptiva.pdf" }] });
    expect(m).toContain("complementario-1 («Memoria descriptiva.pdf»)");
    expect(m).toContain("prevalece el plano");
  });
});
