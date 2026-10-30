// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DICTAMEN_SINTETICO, RESULTADO_CON_ZONA, RESULTADO_SINTETICO } from "@/test/expediente-sintetico";
import { separarPorZona } from "@/lib/agrupar-zona";
import { categoriaDeRegla } from "@/lib/categoria-regla";
import { aplanarHechos, estadoDeResultado, nombreDeCarpeta, segunRegla, slugDeCarpeta, traducirExpediente, traducirResultado } from "./traductor";

const HECHOS = {
  tramite: { valor: "RLA", confianza: 1, fuente: { metodo: "solicitante" } },
  lote: {
    corregimiento: { valor: "Pueblo Ficticio", confianza: 0.9, fuente: { metodo: "vision" } },
    area_m2: { valor: 500, confianza: 0.9, fuente: { documento: "plano.pdf", pagina: 1, metodo: "vision" } },
  },
  proyecto: { uso_propuesto: { valor: "vivienda unifamiliar", confianza: 0.9 } },
};

const entrada = { slug: "pueblo-ficticio-rla-0000-1", carpeta: "Pueblo Ficticio  -  RLA-0000-1", resultado: RESULTADO_SINTETICO, hechos: HECHOS, fecha: "2026-01-16T10:00:00.000Z" };

describe("traductor de expedientes", () => {
  it("slug estable y nombre legible a partir de la carpeta", () => {
    expect(slugDeCarpeta("Ancón  -  RLA-0000-11")).toBe("ancon-rla-0000-11");
    expect(slugDeCarpeta("../../etc/passwd")).toBe("etc-passwd");
    expect(nombreDeCarpeta("Ancón  -  RLA-0000-11")).toBe("Ancón · RLA-0000-11");
  });

  it("mapea los resultados del motor a los estados de la web; lo desconocido va a revisión", () => {
    expect(estadoDeResultado("CUMPLE")).toBe("PASS");
    expect(estadoDeResultado("NO_CUMPLE", "bloqueante")).toBe("FAIL");
    expect(estadoDeResultado("NO_CUMPLE", "observacion")).toBe("WARNING");
    expect(estadoDeResultado("REQUIERE_REVISION")).toBe("MANUAL_REVIEW");
    expect(estadoDeResultado("NO_APLICA")).toBe("NOT_APPLICABLE");
    expect(estadoDeResultado("OTRO")).toBe("MANUAL_REVIEW");
    expect(categoriaDeRegla("AC-R1D2-RETIRO-POSTERIOR")).toBe("setbacks");
  });

  it("traduce el proyecto: nombre, corregimiento, zona, trámite, marca de expediente y estado pendiente de revisión", () => {
    const { project } = traducirExpediente(entrada);
    expect(project).toMatchObject({
      id: "exp-pueblo-ficticio-rla-0000-1",
      name: "Pueblo Ficticio · RLA-0000-1",
      corregimiento: "Pueblo Ficticio",
      zoningCode: "R3",
      tramite: "RLA",
      projectType: "RLA · vivienda unifamiliar",
      status: "REVIEW_REQUIRED",
      origen: "expediente",
      precheckId: "pc-exp-pueblo-ficticio-rla-0000-1",
      updatedAt: "2026-01-16T10:00:00.000Z",
      applicant: "",
    });
    expect(project.expediente).toMatchObject({ documento: "Pueblo Ficticio - RLA-0000-1.pdf", normaAplicable: "MIVIOT-AC-R160-2002", noAplican: 12, avisos: ["aviso de prueba"] });
    expect(project.expediente?.lote.map((d) => d.clave)).toEqual(["lote.corregimiento", "lote.area_m2"]);
    expect(project.expediente?.lote[1]).toMatchObject({ etiqueta: "Área del lote", valor: "500 m²", confianza: 0.9, fuente: "plano.pdf, p. 1 (vision)" });
  });

  it("deja en «otros» los hechos que no son de lote, plano ni proyecto (profesional.*, rampa.*), sin el trámite", () => {
    const hechos = { ...HECHOS, profesional: { disciplina: { valor: "arquitectura", confianza: 0.9 } }, rampa: { ancho_m: { valor: 3, confianza: 0.8 } } };
    const { project } = traducirExpediente({ ...entrada, hechos });
    expect(project.expediente?.otros?.map((d) => d.clave)).toEqual(["profesional.disciplina", "rampa.ancho_m"]);
    expect(project.expediente?.lote.map((d) => d.clave)).toEqual(["lote.corregimiento", "lote.area_m2"]);
  });

  it("traduce cada resultado con estado, referencia, cita y motivo, valor detectado, confianza y fuente; nunca oficial", () => {
    const { precheck } = traducirExpediente(entrada);
    const [retiro, verde, curvas, altura, alturaNa, raro] = precheck.results;
    expect(retiro).toMatchObject({
      ruleId: "AC-R3-RETIRO-FRONTAL",
      status: "FAIL",
      official: false,
      regulationReference: "Resolución de prueba, Artículo 9",
      detectedValue: 2.5,
      unit: "m",
      confidence: 0.9,
      source: "proyecto.retiro_frontal_m: plano.pdf, p. 2 (vision: planta baja)",
    });
    expect(retiro.explanation).toContain("El retiro frontal es menor que el mínimo.");
    expect(retiro.explanation).toContain("«Retiro frontal: 5 mts»");
    expect(retiro.requiredValue).toBeUndefined();
    expect(verde).toMatchObject({ status: "WARNING", detectedValue: 20, unit: "%" });
    expect(curvas).toMatchObject({ status: "MANUAL_REVIEW" });
    expect(curvas.detectedValue).toBeUndefined();
    expect(altura.status).toBe("PASS");
    // Un id repetido no pisa al anterior.
    expect(alturaNa).toMatchObject({ ruleId: "AC-R3-ALTURA#2", status: "NOT_APPLICABLE" });
    expect(raro.status).toBe("MANUAL_REVIEW");
    expect(precheck.results.every((r) => r.official === false)).toBe(true);
    expect(precheck.summary).toEqual({ checked: 5, passed: 1, failed: 1, warnings: 1, manualReview: 2, notApplicable: 1, noAplican: 12 });
  });

  it("la unidad territorial (un número de contexto) no se muestra como valor detectado de la regla", () => {
    const base = RESULTADO_SINTETICO.resultados[0];
    const resultado = {
      ...RESULTADO_SINTETICO,
      resultados: [{ ...base, regla_id: "SF-X-UT3-ZM7-OCUPACION", valores_usados: {
        "lote.norma_aplicable": { valor: "PLOT-A61-2021+A270-2025", confianza: 1 },
        "lote.sf_sector": { valor: "San Francisco Centro", confianza: 0.8 },
        "lote.sf_unidad_territorial": { valor: 3, confianza: 0.6 },
      } }],
    };
    const { precheck } = traducirExpediente({ ...entrada, resultado });
    expect(precheck.results[0].detectedValue).toBeUndefined();
  });

  it("cada resultado lleva su regla (título y fuente del propio resultado), aunque no esté en el catálogo de la web", () => {
    const { precheck } = traducirExpediente(entrada);
    expect(precheck.rules).toHaveLength(precheck.results.length);
    const regla = precheck.rules?.find((r) => r.id === "AC-R3-RETIRO-FRONTAL");
    expect(regla).toMatchObject({
      title: "R3: retiro frontal",
      version: 2,
      category: "setbacks",
      state: "borrador",
      severity: "bloqueante",
      regulation: { norma: "Resolución de prueba", article: "Artículo 9", quote: "Retiro frontal: 5 mts", sourcePage: 40 },
    });
    // Sin título ni fuente: el id y «Norma no indicada», nunca vacío.
    expect(precheck.rules?.find((r) => r.id === "AC-R3-USOS")).toMatchObject({ title: "AC-R3-USOS", regulation: { norma: "Norma no indicada", article: "—" } });
  });

  it("marca las reglas de otras zonas (grupo zona_por_confirmar) sin cambiar su estado y explica el provisional", () => {
    const resultado = {
      ...RESULTADO_SINTETICO,
      agrupadas: { zona_por_confirmar: { total: 1, motivo: "depende de confirmar el código de zona: prueba" } },
      resultados: [
        {
          regla_id: "AC-R3-OCUPACION",
          resultado: "REQUIERE_REVISION",
          motivo: "la confianza de lote.codigo_zona (0.60) está bajo el mínimo 0.85",
          si_se_confirma_zona: { declarado: { "lote.codigo_zona": "R3" }, resultado: "CUMPLE", motivo: "condición evaluada" },
        },
        { regla_id: "AC-R1-OCUPACION", resultado: "REQUIERE_REVISION", motivo: "no se puede determinar si aplica", grupo: "zona_por_confirmar", motivo_tipo: "zona_por_confirmar" },
      ],
    };
    const { project, precheck } = traducirExpediente({ ...entrada, resultado });
    const [propia, otra] = precheck.results;
    expect(propia.status).toBe("MANUAL_REVIEW");
    expect(propia.group).toBeUndefined();
    expect(propia.explanation).toContain("Provisional: si se confirma codigo_zona R3, CUMPLE.");
    expect(otra).toMatchObject({ status: "MANUAL_REVIEW", group: "zona_por_confirmar" });
    // El resumen sigue contando todas las reglas en revisión.
    expect(precheck.summary.manualReview).toBe(2);
    expect(project.expediente?.zonaPorConfirmar).toEqual({ total: 1, motivo: "depende de confirmar el código de zona: prueba" });
    // La lista de informes cuenta aparte las agrupadas: «a revisar» son solo las de detalle.
    expect(project.expediente?.conteo).toEqual({ noCumple: 0, revisar: 1, agrupadas: 1, cumple: 0 });
  });

  it("un resultado anterior, sin los campos nuevos, se sigue traduciendo", () => {
    const { project, precheck } = traducirExpediente(entrada);
    expect(project.expediente?.zonaPorConfirmar).toBeNull();
    expect(precheck.results.every((r) => r.group === undefined)).toBe(true);
  });

  it("incluye el informe del revisor si existe", () => {
    expect(traducirExpediente(entrada).precheck.informeRevisor).toBeNull();
    expect(traducirExpediente({ ...entrada, informe: "# Informe" }).precheck.informeRevisor).toBe("# Informe");
  });

  it("rechaza un resultado.json sin la forma esperada", () => {
    expect(() => traducirExpediente({ ...entrada, resultado: { resultados: "no" } })).toThrow();
  });

  it("aplana los hechos con su clave con puntos", () => {
    expect(aplanarHechos(HECHOS).map((d) => d.clave)).toEqual(["tramite", "lote.corregimiento", "lote.area_m2", "proyecto.uso_propuesto"]);
    expect(aplanarHechos(null)).toEqual([]);
  });
});

describe("traductor de expedientes con el dictamen del arquitecto revisor", () => {
  const base = { ...entrada, resultado: RESULTADO_CON_ZONA };
  const conDictamen = (dictamen: unknown = DICTAMEN_SINTETICO) => traducirExpediente({ ...base, dictamen });
  const porId = (r: ReturnType<typeof traducirExpediente>, id: string) => r.precheck.results.find((x) => x.ruleId === id);

  it("sin dictamen todo sigue con el resultado del motor", () => {
    const { project, precheck, avisos } = traducirExpediente(base);
    expect(avisos).toBeUndefined();
    expect(project.expediente?.dictamen).toBeNull();
    expect(precheck.fuenteResultado).toBeUndefined();
    expect(precheck.results.some((r) => r.dictamen || r.motorStatus)).toBe(false);
    expect(porId({ project, precheck }, "A110-AIV-CURVAS-NIVEL")?.status).toBe("MANUAL_REVIEW");
    // «No aplica» cuenta solo lo evaluado; las 12 reglas que no aplican al plano van aparte (antes sumaban 13 y, en planos reales, miles).
    expect(precheck.summary).toEqual({ checked: 7, passed: 1, failed: 1, warnings: 1, manualReview: 4, notApplicable: 1, noAplican: 12 });
    expect(project.expediente?.conteo).toEqual({ noCumple: 1, revisar: 3, agrupadas: 2, cumple: 1 });
    expect(project.expediente?.zonaPorConfirmar).toEqual({ total: 2, motivo: "depende de confirmar el código de zona" });
  });

  it("zona.otras_zonas_no_aplican: las reglas de otras zonas pasan a «no aplica» sin listarlas una por una", () => {
    // Un dictamen que no lista las reglas de otras zonas (el sintético las decide una por una; aquí se quitan).
    const sinListar = { ...DICTAMEN_SINTETICO, decisiones: DICTAMEN_SINTETICO.decisiones.filter((d) => !/^AC-R[12]-ALTURA$/.test(d.regla_id)) };
    const sin = conDictamen(sinListar);
    expect(sin.project.expediente?.zonaPorConfirmar).not.toBeNull();
    const con = conDictamen({ ...sinListar, zona: { codigo: "RM1", otras_zonas_no_aplican: true } });
    expect(con.precheck.results.filter((r) => r.group === "zona_por_confirmar").every((r) => r.status === "NOT_APPLICABLE")).toBe(true);
    expect(con.project.expediente?.zonaPorConfirmar).toBeNull();
    expect(con.project.expediente?.conteo?.agrupadas).toBe(0);
    // Sin la marca, o con un valor que no es true, no se toca nada.
    expect(conDictamen({ ...sinListar, zona: { otras_zonas_no_aplican: "si" } }).project.expediente?.zonaPorConfirmar).not.toBeNull();
  });

  it("el estado que se muestra sale del dictamen y conserva el del motor, con justificación, valores, evidencia y qué subsanar", () => {
    const r = conDictamen();
    const curvas = porId(r, "A110-AIV-CURVAS-NIVEL");
    expect(curvas).toMatchObject({
      status: "FAIL",
      motorStatus: "MANUAL_REVIEW",
      official: false,
      explanation: "La localización no muestra curvas de nivel.",
      recommendedAction: "Agregar la topografía con curvas de nivel a 1.00 m o menos.",
      dictamen: {
        decision: "NO_CUMPLE",
        valorLeido: "sin curvas de nivel",
        limite: "curvas a intervalos de 1.00 m o menos",
        evidencia: [{ pagina: 1, detalle: "localización general" }],
        subsanar: "Agregar la topografía con curvas de nivel a 1.00 m o menos.",
      },
    });
    expect(curvas?.motorReason).toContain("La confianza está bajo el mínimo.");
    expect(porId(r, "AC-R3-USOS")).toMatchObject({ status: "WARNING", motorStatus: "MANUAL_REVIEW" });
    // Las que el motor ya resolvió y el dictamen no repite quedan igual.
    expect(porId(r, "AC-R3-RETIRO-FRONTAL")).toMatchObject({ status: "FAIL" });
    expect(porId(r, "AC-R3-RETIRO-FRONTAL")?.motorStatus).toBeUndefined();
    expect(r.precheck.results.every((x) => x.official === false)).toBe(true);
    expect(r.precheck.fuenteResultado).toBe("Dictamen del arquitecto revisor (agente revisor-planos)");
    expect(r.avisos).toBeUndefined();
  });

  it("los conteos, el índice preliminar y la conclusión usan el dictamen; el expediente sigue pendiente de revisión DOYC", () => {
    const { project, precheck } = conDictamen();
    expect(precheck.summary).toEqual({ checked: 5, passed: 1, failed: 2, warnings: 2, manualReview: 0, notApplicable: 3, noAplican: 12 });
    expect(project.expediente?.conteo).toEqual({ noCumple: 2, observaciones: 2, revisar: 0, agrupadas: 0, cumple: 1 });
    expect(project.complianceIndex).toBe(20);
    expect(project.status).toBe("REVIEW_REQUIRED");
    expect(project.expediente?.dictamen).toEqual({
      fecha: "2026-01-17",
      revisor: "agente revisor-planos (arquitecto revisor)",
      conclusion: "El anteproyecto no puede seguir tal como está: debe agregar la topografía con curvas de nivel.",
      supuestos: [{ hecho: "lote.codigo_zona", etiqueta: "Código de zona", valor: "R3", fundamento: "declarada en el plano; sin CEUS" }],
      decididas: 4,
      sinDecision: 0,
      noAplica: 2,
    });
  });

  it("las reglas de otras zonas que el dictamen da por NO_APLICA salen del detalle y de la línea agrupada", () => {
    const { project, precheck } = conDictamen();
    const otras = precheck.results.filter((x) => x.group === "zona_por_confirmar");
    expect(otras.map((x) => x.status)).toEqual(["NOT_APPLICABLE", "NOT_APPLICABLE"]);
    const { detalle, porZona } = separarPorZona(precheck.results.map((result) => ({ result })));
    expect(porZona).toHaveLength(0);
    expect(detalle.some((x) => x.result.group)).toBe(false);
    expect(project.expediente?.zonaPorConfirmar).toBeNull();
  });

  it("una regla sin decisión queda con el estado del motor (y una agrupada sin decidir sigue en la línea)", () => {
    const parcial = { ...DICTAMEN_SINTETICO, decisiones: DICTAMEN_SINTETICO.decisiones.filter((d) => d.regla_id !== "AC-R3-USOS" && d.regla_id !== "AC-R2-ALTURA") };
    const r = conDictamen(parcial);
    const usos = porId(r, "AC-R3-USOS");
    expect(usos?.status).toBe("MANUAL_REVIEW");
    expect(usos?.motorStatus).toBeUndefined();
    expect(usos?.dictamen).toBeUndefined();
    expect(r.project.expediente?.dictamen).toMatchObject({ decididas: 2, sinDecision: 2, noAplica: 1 });
    expect(r.project.expediente?.conteo).toEqual({ noCumple: 2, observaciones: 1, revisar: 1, agrupadas: 1, cumple: 1 });
    expect(r.project.expediente?.zonaPorConfirmar).toEqual({ total: 1, motivo: "depende de confirmar el código de zona" });
    expect(separarPorZona(r.precheck.results.map((result) => ({ result }))).porZona).toHaveLength(1);
  });

  it("jerarquía motor → IA: una decisión distinta sobre una regla que el motor ya decidió no cambia el estado y queda con reserva", () => {
    const contradice = {
      ...DICTAMEN_SINTETICO,
      decisiones: [
        ...DICTAMEN_SINTETICO.decisiones,
        // El motor dijo NO_CUMPLE (retiro frontal 2.5 < 5) y la IA quiere CUMPLE: prevalece el motor.
        { regla_id: "AC-R3-RETIRO-FRONTAL", decision: "CUMPLE", justificacion: "A mi juicio el retiro es suficiente.", evidencia: [] },
        // El motor dijo NO_CUMPLE (observación) y la IA coincide: se aplica con su justificación.
        { regla_id: "AC-R3-AREA-VERDE", decision: "NO_CUMPLE", justificacion: "Área libre 20 % < 30 %.", evidencia: [{ pagina: 1, detalle: "cuadro de áreas" }] },
      ],
    };
    const r = conDictamen(contradice);
    const frontal = porId(r, "AC-R3-RETIRO-FRONTAL");
    expect(frontal?.status).toBe("FAIL");
    expect(frontal?.motorStatus).toBeUndefined();
    expect(frontal?.explanation).toContain("El retiro frontal es menor que el mínimo");
    expect(frontal?.dictamen).toMatchObject({ decision: "CUMPLE", reserva: { motivo: "motor" } });
    expect(frontal?.dictamen?.reserva?.detalle).toContain("prevalece el motor");
    const verde = porId(r, "AC-R3-AREA-VERDE");
    expect(verde).toMatchObject({ status: "WARNING", motorStatus: "WARNING", explanation: "Área libre 20 % < 30 %." });
    expect(verde?.dictamen?.reserva).toBeUndefined();
    expect(r.avisos).toEqual(["dictamen.json: AC-R3-RETIRO-FRONTAL (IA CUMPLE, motor NO_CUMPLE) prevalece el motor"]);
    // No cuenta como decidida; los conteos siguen los del motor para esa regla.
    expect(r.project.expediente?.dictamen).toMatchObject({ decididas: 5, prevaleceMotor: 1, sinDecision: 0 });
    expect(r.precheck.summary.failed).toBe(2);
  });

  it("un NO_CUMPLE con confianza declarada bajo el umbral se muestra como observación, con reserva", () => {
    const propia = { ...DICTAMEN_SINTETICO, decisiones: DICTAMEN_SINTETICO.decisiones.map((d) => (d.regla_id === "A110-AIV-CURVAS-NIVEL" ? { ...d, confianza: 0.6 } : d)) };
    const r = conDictamen(propia);
    const curvas = porId(r, "A110-AIV-CURVAS-NIVEL");
    expect(curvas?.status).toBe("WARNING");
    expect(curvas?.motorStatus).toBe("MANUAL_REVIEW");
    expect(curvas?.dictamen).toMatchObject({ decision: "NO_CUMPLE", confianza: 0.6, reserva: { motivo: "confianza" } });
    expect(curvas?.dictamen?.reserva?.detalle).toContain("confianza 0.6");
    expect(r.precheck.summary).toMatchObject({ failed: 1, warnings: 3 });
    expect(r.avisos).toEqual(["dictamen.json: A110-AIV-CURVAS-NIVEL NO_CUMPLE con confianza bajo el umbral; se muestra como observación"]);
    // Si el motor ya dio NO_CUMPLE y la IA coincide con confianza baja, el NO_CUMPLE es del motor: no se rebaja.
    const coincideBajo = { ...DICTAMEN_SINTETICO, decisiones: [...DICTAMEN_SINTETICO.decisiones, { regla_id: "AC-R3-RETIRO-FRONTAL", decision: "NO_CUMPLE", confianza: 0.5, justificacion: "Coincido.", evidencia: [] }] };
    const frontalBajo = porId(conDictamen(coincideBajo), "AC-R3-RETIRO-FRONTAL");
    expect(frontalBajo?.status).toBe("FAIL");
    expect(frontalBajo?.dictamen?.reserva).toBeUndefined();
    // Con confianza en el umbral o sin declararla, la decisión se aplica tal cual (la IA decide justamente lo que el lector dejó con confianza baja).
    const enUmbral = { ...DICTAMEN_SINTETICO, decisiones: DICTAMEN_SINTETICO.decisiones.map((d) => (d.regla_id === "A110-AIV-CURVAS-NIVEL" ? { ...d, confianza: 0.85 } : d)) };
    expect(porId(conDictamen(enUmbral), "A110-AIV-CURVAS-NIVEL")).toMatchObject({ status: "FAIL", dictamen: { confianza: 0.85 } });
    expect(porId(conDictamen(), "A110-AIV-CURVAS-NIVEL")?.dictamen?.reserva).toBeUndefined();
  });

  it("INFORMACION_REQUERIDA se conserva en la decisión y se cuenta aparte de las observaciones", () => {
    const ir = { ...DICTAMEN_SINTETICO, decisiones: DICTAMEN_SINTETICO.decisiones.map((d) => (d.regla_id === "AC-R3-USOS" ? { ...d, estado: "INFORMACION_REQUERIDA" } : d)) };
    const r = conDictamen(ir);
    expect(porId(r, "AC-R3-USOS")).toMatchObject({ status: "WARNING", dictamen: { decision: "OBSERVACION", estado: "INFORMACION_REQUERIDA" } });
    expect(r.project.expediente?.conteo).toEqual({ noCumple: 2, observaciones: 1, informacionRequerida: 1, revisar: 0, agrupadas: 0, cumple: 1 });
    expect(r.project.expediente?.dictamen).toMatchObject({ informacionRequerida: 1 });
    // Otro valor de estado se ignora.
    const raro = { ...DICTAMEN_SINTETICO, decisiones: DICTAMEN_SINTETICO.decisiones.map((d) => (d.regla_id === "AC-R3-USOS" ? { ...d, estado: "PENDIENTE" } : d)) };
    expect(porId(conDictamen(raro), "AC-R3-USOS")?.dictamen?.estado).toBeUndefined();
  });

  it("un dictamen inválido se ignora con un aviso y no rompe el expediente", () => {
    const sinDictamen = traducirExpediente(base);
    for (const malo of [
      { decisiones: [{ regla_id: "A110-AIV-CURVAS-NIVEL", decision: "APROBADO", justificacion: "x" }] },
      { decisiones: [{ regla_id: "A110-AIV-CURVAS-NIVEL", decision: "CUMPLE" }] },
      { conclusion: "sin decisiones" },
      "texto",
    ]) {
      const r = conDictamen(malo);
      expect(r.avisos).toHaveLength(1);
      expect(r.avisos?.[0]).toMatch(/^dictamen\.json inválido/);
      expect(r.precheck.results).toEqual(sinDictamen.precheck.results);
      expect(r.precheck.summary).toEqual(sinDictamen.precheck.summary);
      expect(r.project.expediente?.dictamen).toBeNull();
    }
  });

  it("avisa de las decisiones repetidas y vale la primera", () => {
    const extra = { ...DICTAMEN_SINTETICO, decisiones: [...DICTAMEN_SINTETICO.decisiones, { ...DICTAMEN_SINTETICO.decisiones[0], decision: "CUMPLE" }] };
    const r = conDictamen(extra);
    expect(r.avisos).toHaveLength(1);
    expect(porId(r, "A110-AIV-CURVAS-NIVEL")?.status).toBe("FAIL");
  });

  it("un hallazgo del arquitecto sin regla en el catálogo se muestra como resultado propio y cuenta", () => {
    const base = conDictamen(DICTAMEN_SINTETICO);
    const hallazgo = {
      regla_id: "PRESENTACION-CORTES",
      decision: "NO_CUMPLE",
      limite: "Juego completo con secciones",
      justificacion: "Faltan las láminas de cortes.",
      subsanar: "Agregar los cortes A-A y B-B.",
      cita: "Acuerdo N°110 de 22-04-2025, Anexo IV, 7: «Sección transversal y longitudinal»",
    };
    const r = conDictamen({ ...DICTAMEN_SINTETICO, decisiones: [...DICTAMEN_SINTETICO.decisiones, hallazgo] });
    expect(r.avisos ?? []).toHaveLength(0);
    const res = porId(r, "PRESENTACION-CORTES");
    expect(res).toMatchObject({ status: "FAIL", official: false, recommendedAction: "Agregar los cortes A-A y B-B." });
    expect(res?.regulationReference).toContain("Acuerdo N°110 de 22-04-2025, Anexo IV, 7");
    expect(r.precheck.rules?.find((x) => x.id === "PRESENTACION-CORTES")?.title).toBe("Hallazgo del arquitecto revisor: Juego completo con secciones");
    expect(r.precheck.summary.failed).toBe(base.precheck.summary.failed + 1);
  });
});

describe("marcas sobre las láminas", () => {
  const resultado = {
    resultados: [
      {
        regla_id: "R-1",
        resultado: "REQUIERE_REVISION",
        titulo: "Área",
        valores_usados: { "lote.area_m2": { valor: 727, confianza: 0.99, fuente: { pagina: 2, metodo: "pdf_texto", bbox: [100, 200, 160, 215] } } },
      },
    ],
  };
  const extraccion = { paginas: [{ numero: 2, ancho_mm: 914, alto_mm: 610 }] };
  const base = { slug: "x", carpeta: "Prueba - RLA-1", resultado, extraccion, fecha: "2026-10-05T00:00:00Z" };

  it("el recuadro del dato que leyó el lector pasa a marca de la regla", () => {
    const { precheck } = traducirExpediente(base);
    expect(precheck.results[0].marcas).toEqual([expect.objectContaining({ pagina: 2, origen: "lector", etiqueta: "lote.area_m2" })]);
  });

  it("las marcas del dictamen van primero; una marca inválida no rompe el dictamen", () => {
    const dictamen = {
      decisiones: [
        {
          regla_id: "R-1",
          decision: "NO_CUMPLE",
          justificacion: "No cumple",
          evidencia: [{ pagina: 3, detalle: "Retiro", marcas: [{ x: 0.2, y: 0.2, w: 0.1, h: 0.1 }, { x: 5, y: 5, w: 1, h: 1 }] }],
        },
      ],
    };
    const { precheck } = traducirExpediente({ ...base, dictamen });
    expect(precheck.results[0].status).toBe("FAIL");
    expect(precheck.results[0].marcas?.map((m) => [m.origen, m.pagina])).toEqual([["ia", 3], ["lector", 2]]);
  });

  it("sin posición no hay marcas", () => {
    const sinBbox = { resultados: [{ regla_id: "R-1", resultado: "REQUIERE_REVISION", valores_usados: { "lote.area_m2": { valor: 1, confianza: 1, fuente: { pagina: 2 } } } }] };
    expect(traducirExpediente({ ...base, resultado: sinBbox }).precheck.results[0].marcas).toBeUndefined();
  });
});

describe("hallazgos fuera del catálogo", () => {
  const resultado = { resultados: [{ regla_id: "R-1", resultado: "REQUIERE_REVISION", titulo: "Área" }] };
  const dictamen = {
    decisiones: [
      { regla_id: "R-1", decision: "CUMPLE", justificacion: "ok" },
      { regla_id: "HALLAZGO-3", decision: "NO_CUMPLE", justificacion: "No hay cuadro de acabados", titulo: "Acabados generales", cita: "Acuerdo 110, Anexo IV, num. 8: «Acabados»" },
    ],
  };

  it("el hallazgo que no está en el catálogo queda marcado; la regla del catálogo no", () => {
    const { precheck } = traducirExpediente({ slug: "x", carpeta: "P - RLA-1", resultado, fecha: "2026-10-05T00:00:00Z", dictamen });
    const porId = Object.fromEntries(precheck.results.map((r) => [r.ruleId, r]));
    expect(porId["HALLAZGO-3"]).toMatchObject({ status: "FAIL", fueraDeCatalogo: true });
    expect(porId["R-1"].fueraDeCatalogo).toBeUndefined();
  });
});

describe("dictamen: regiones_discrepantes (opcional y tolerante)", () => {
  it("lo acepta bien formado y descarta uno malformado sin invalidar el dictamen", async () => {
    const { leerDictamen } = await import("./traductor");
    const base = { decisiones: [{ regla_id: "R-1", decision: "OBSERVACION", justificacion: "x" }] };
    const avisos: string[] = [];
    const bien = leerDictamen({ ...base, regiones_discrepantes: [{ dato: "proyecto.estacionamientos", detalle: "15 declarados, 12 dibujados" }, { region_id: "r-1", detalle: "y" }] }, avisos);
    expect(bien?.regiones_discrepantes).toHaveLength(2);
    const mal = leerDictamen({ ...base, regiones_discrepantes: [{ detalle: "sin region_id ni dato" }] }, avisos);
    expect(mal?.decisiones).toHaveLength(1);
    expect(mal?.regiones_discrepantes).toBeNull();
    expect(leerDictamen(base, avisos)?.regiones_discrepantes).toBeUndefined();
    expect(avisos).toEqual([]);
  });
});

describe("reglas vigentes y objeciones (paso 1 y paso 2)", () => {
  it("lee el resumen de reglas vigentes y los permisos de resultado.json, y las objeciones del dictamen", () => {
    const resultado = {
      ...RESULTADO_SINTETICO,
      norma_aplicable: "MIVIOT-ML2",
      codigo_zona: "MP-C2",
      reglas_vigentes: { total: 84, sin_determinar: 3, exceptuadas: 1, otras_zonas: 0, propuestas: 1, alcance_ia: { presente: true, aplicado: ["lote.norma_aplicable"], errores: [] } },
      permisos: [{ id: "PERM-1", tipo: "excepcion", titulo: "Adosamiento", fuente: { documento: "complementario-1", pagina: 2, cita: "se autoriza" }, efecto: [{ regla_id: "R-1", accion: "exceptua", motivo: "" }] }],
    };
    const dictamen = { ...DICTAMEN_SINTETICO, objeciones: [{ regla_id: "R-1", motivo: "x", cita: "y" }, { regla_id: "", motivo: "" }] };
    const d = traducirExpediente({ ...entrada, resultado, dictamen }).project.expediente?.dictamen;
    expect(d?.vigentes).toMatchObject({ norma: "MIVIOT-ML2", zona: "MP-C2", total: 84, sinDeterminar: 3, exceptuadas: 1, propuestas: 1, alcanceIa: { presente: true, aplicado: ["lote.norma_aplicable"] } });
    expect(d?.vigentes?.permisos[0]).toEqual({ id: "PERM-1", tipo: "excepcion", titulo: "Adosamiento", cita: "se autoriza", documento: "complementario-1", pagina: 2, efecto: [{ reglaId: "R-1", accion: "exceptua" }] });
    // Una objeción malformada descarta la lista, no el dictamen.
    expect(d?.objeciones).toBeUndefined();
    expect(d?.decididas).toBeGreaterThan(0);
    const bien = traducirExpediente({ ...entrada, resultado, dictamen: { ...DICTAMEN_SINTETICO, objeciones: [{ regla_id: "R-1", motivo: "x", cita: "y" }] } }).project.expediente?.dictamen;
    expect(bien?.objeciones).toEqual([{ reglaId: "R-1", motivo: "x", cita: "y" }]);
    // Una evaluación anterior al paso 1 no trae resumen.
    expect(traducirExpediente({ ...entrada, dictamen: DICTAMEN_SINTETICO }).project.expediente?.dictamen?.vigentes).toBeUndefined();
  });
});

describe("severidad y tipo de la regla (19-oct)", () => {
  const regla = (severidad: string, tipo: string | null, resultado = "NO_CUMPLE") => ({ regla_id: "R-1", resultado, severidad, tipo });

  it("un NO_CUMPLE documental bloqueante es «falta en el plano»; el cuantitativo, no; el de severidad observación es observación", () => {
    expect(traducirResultado(regla("bloqueante", "documental")).result).toMatchObject({ status: "FAIL", faltaEnPlano: true });
    expect(traducirResultado(regla("bloqueante", "cuantitativa")).result.faltaEnPlano).toBeUndefined();
    expect(traducirResultado(regla("observacion", "cuantitativa")).result.status).toBe("WARNING");
    // Un resultado anterior al 19-oct no trae el tipo: se muestra como «No cumple» a secas.
    expect(traducirResultado(regla("bloqueante", null)).result).toMatchObject({ status: "FAIL" });
    expect(traducirResultado(regla("bloqueante", null)).result.faltaEnPlano).toBeUndefined();
  });

  it("la decisión de la IA sigue la misma severidad que el motor", () => {
    const fail = { ruleId: "R-1", status: "FAIL" as const, official: false };
    expect(segunRegla(fail, { severidad: "observacion", tipo: "cuantitativa" }).status).toBe("WARNING");
    expect(segunRegla(fail, { severidad: "bloqueante", tipo: "documental" })).toMatchObject({ status: "FAIL", faltaEnPlano: true });
    // Si la IA no da NO_CUMPLE, la marca de «falta en el plano» no queda colgando.
    expect(segunRegla({ ...fail, status: "PASS", faltaEnPlano: true }, { severidad: "bloqueante", tipo: "documental" }).faltaEnPlano).toBeUndefined();
  });
});

/**
 * ADR-0016 con datos inventados: zona de trabajo supuesta (R1d1 en lugar de R3), decisión de respaldo del motor en cada
 * regla en revisión, una regla de otra zona agrupada con información requerida y un dato dudoso.
 */
const RESULTADO_ADR16 = {
  norma_aplicable: "MIVIOT-AC-R160-2002",
  codigo_zona: "R1d1",
  umbral: 0.85,
  avisos: ["ZONA_TRABAJO: El plano declara R3, que no existe en MIVIOT-AC-R160-2002. Se evaluó con R1d1: encaja con el lote."],
  resultados: [
    { regla_id: "AC-R1D1-ALTURA", resultado: "REQUIERE_REVISION", titulo: "R1d1: altura", norma: "MIVIOT-AC-R160-2002", severidad: "bloqueante", decision_motor: { resultado: "NO_CUMPLE", motivo: "con la zona de trabajo supuesta", con_supuesto: ["S1"], mensaje: "Reduzca la altura." } },
    { regla_id: "AC-R1D1-AREA-VERDE", resultado: "REQUIERE_REVISION", titulo: "R1d1: área verde", norma: "MIVIOT-AC-R160-2002", decision_motor: { resultado: "CUMPLE", motivo: "con la zona de trabajo supuesta", con_supuesto: ["S1"] } },
    { regla_id: "A110-ESTAC", resultado: "REQUIERE_REVISION", titulo: "Estacionamientos", norma: "A110-2025", decision_motor: { resultado: "NO_CUMPLE", motivo: "se decide con lo que dice el plano", con_supuesto: ["S2"] } },
    { regla_id: "A110-AREA-LOTE", resultado: "REQUIERE_REVISION", titulo: "Área del lote", norma: "A110-2025", decision_motor: { resultado: "INFORMACION_REQUERIDA", motivo: "falta un documento o dato externo al plano: registro_publico.area_lote_m2" } },
    { regla_id: "A110-SENADIS", resultado: "REQUIERE_REVISION", titulo: "Accesibilidad", norma: "A110-2025", decision_motor: { resultado: "OBSERVACION", motivo: "regla de criterio: la decide el revisor" } },
    { regla_id: "A110-RETIRO", resultado: "CUMPLE", titulo: "Retiro", norma: "A110-2025" },
    { regla_id: "AC-R2-ALTURA", resultado: "REQUIERE_REVISION", titulo: "R2: altura", grupo: "zona_por_confirmar", decision_motor: { resultado: "INFORMACION_REQUERIDA", motivo: "depende de la zona del lote: falta la CEUS" } },
  ],
  agrupadas: { zona_por_confirmar: { total: 1, motivo: "depende de confirmar el código de zona" } },
  zona_trabajo: {
    codigo: "R1d1",
    norma: "MIVIOT-AC-R160-2002",
    procedencia: "familia",
    firme: false,
    explicacion: "El plano declara R3, que no existe en MIVIOT-AC-R160-2002. Se evaluó con R1d1: encaja con el lote.",
    descartadas: [{ codigo: "R1c", norma: "MIVIOT-AC-R160-2002", motivo: "no encaja con el lote", total_distintas: 2 }],
    supuesto: "S1",
  },
  supuestos: [
    { id: "S1", tipo: "zona", codigo: "R1d1", explicacion: "El plano declara R3…", accion: "Traiga la CEUS.", reglas: ["AC-R1D1-ALTURA", "AC-R1D1-AREA-VERDE"] },
    { id: "S2", tipo: "dato_dudoso", campo: "proyecto.estacionamientos", valor: 2, confianza: 0.6, fuente: { pagina: 2 }, reglas: ["A110-ESTAC"] },
  ],
  reglas_vigentes: { total: 7, generales: 4, zonificacion: 2 },
};

describe("ADR-0016: zona de trabajo y decisión de respaldo del motor", () => {
  const base = { slug: "inventado", carpeta: "Pueblo Ficticio - RLA-0000-1", resultado: RESULTADO_ADR16, hechos: HECHOS, fecha: "2026-10-19T00:00:00Z" };
  const estado = (results: { ruleId: string }[], id: string) => results.find((r) => r.ruleId === id) as Record<string, unknown> & { dictamen?: { origen?: string } };

  it("sin IA, cada regla en revisión queda con la decisión de respaldo (origen «motor») y el conteo cierra con 0 en revisión", () => {
    const { project, precheck } = traducirExpediente(base);
    expect(precheck.results.filter((r) => r.status === "MANUAL_REVIEW")).toEqual([]);
    expect(estado(precheck.results, "AC-R1D1-ALTURA")).toMatchObject({ status: "FAIL", conSupuesto: true, motorStatus: "MANUAL_REVIEW", recommendedAction: "Reduzca la altura.", dictamen: { origen: "motor", supuestos: ["S1"] } });
    expect(estado(precheck.results, "A110-ESTAC")).toMatchObject({ status: "FAIL", conSupuesto: true });
    expect(estado(precheck.results, "A110-AREA-LOTE")).toMatchObject({ status: "WARNING", dictamen: { estado: "INFORMACION_REQUERIDA", origen: "motor" } });
    expect(estado(precheck.results, "A110-RETIRO")).toMatchObject({ status: "PASS" });
    expect(estado(precheck.results, "A110-RETIRO").dictamen).toBeUndefined();
    // La de otra zona sigue agrupada en una línea, ahora como información requerida.
    expect(separarPorZona(precheck.results.map((result) => ({ result }))).porZona).toHaveLength(1);
    expect(project.expediente?.conteo).toEqual({ noCumple: 0, conSupuesto: 2, observaciones: 1, informacionRequerida: 1, revisar: 0, agrupadas: 1, cumple: 2 });
    expect(precheck.fuenteResultado).toMatch(/decisión de respaldo/);
  });

  it("expone la zona de trabajo, los supuestos en lenguaje llano y la línea nueva de vigentes", () => {
    const e = traducirExpediente(base).project.expediente;
    expect(e?.zonaTrabajo).toMatchObject({ codigo: "R1d1", firme: false, procedencia: "familia", descartadas: [{ codigo: "R1c", reglasDistintas: 2 }] });
    expect(e?.supuestos?.[1]).toEqual({ id: "S2", tipo: "dato_dudoso", texto: "proyecto.estacionamientos: se usó «2» tal como lo dice el plano, p. 2, leído con confianza 0.6.", accion: "Confírmelo en el plano o corríjalo con su fuente.", reglas: 1 });
    expect(e?.vigentes).toMatchObject({ zona: "R1d1", generales: 4, zonificacion: 2, procedenciaZona: "supuesta, supuesta por la familia de zona" });
  });

  it("la IA decide sobre la zona supuesta (no la bloquea la jerarquía) y su NO_CUMPLE sigue con supuesto; lo que no decide queda del motor", () => {
    const dictamen = {
      decisiones: [
        { regla_id: "AC-R1D1-AREA-VERDE", decision: "NO_CUMPLE", justificacion: "El área verde es menor.", evidencia: [] },
        { regla_id: "A110-ESTAC", decision: "CUMPLE", justificacion: "Hay 2 plazas dibujadas.", evidencia: [] },
      ],
    };
    const { project, precheck } = traducirExpediente({ ...base, dictamen });
    expect(estado(precheck.results, "AC-R1D1-AREA-VERDE")).toMatchObject({ status: "FAIL", conSupuesto: true, dictamen: { origen: "ia" } });
    expect(estado(precheck.results, "AC-R1D1-AREA-VERDE").dictamen).not.toHaveProperty("reserva");
    // La IA confirmó el dato dudoso: su CUMPLE no lleva supuesto.
    expect(estado(precheck.results, "A110-ESTAC")).toMatchObject({ status: "PASS", dictamen: { origen: "ia" } });
    expect(estado(precheck.results, "AC-R1D1-ALTURA")).toMatchObject({ dictamen: { origen: "motor" } });
    expect(project.expediente?.dictamen).toMatchObject({ decididas: 2, respaldoMotor: 4, sinDecision: 0 });
    expect(precheck.fuenteResultado).toMatch(/Dictamen del arquitecto revisor/);
  });

  it("un resultado anterior a ADR-0016 no trae decisiones del motor ni secciones nuevas", () => {
    const { project, precheck } = traducirExpediente(entrada);
    expect(precheck.results.some((r) => r.dictamen?.origen === "motor" || r.conSupuesto)).toBe(false);
    expect(project.expediente).not.toHaveProperty("zonaTrabajo");
    expect(project.expediente).not.toHaveProperty("supuestos");
  });

  it("un bloque ADR-0016 malformado se ignora sin tumbar la traducción", () => {
    const roto = { ...RESULTADO_ADR16, zona_trabajo: "no es un objeto", supuestos: [{ sin: "id" }], resultados: [{ ...RESULTADO_ADR16.resultados[0], decision_motor: { resultado: 3 } }] };
    const { project, precheck } = traducirExpediente({ ...base, resultado: roto });
    expect(project.expediente).not.toHaveProperty("zonaTrabajo");
    expect(precheck.results[0]).toMatchObject({ status: "MANUAL_REVIEW" });
  });
});

describe("ADR-0016: sin zona de trabajo", () => {
  it("la línea de vigentes no presenta el código declarado como la zona evaluada", () => {
    const resultado = {
      norma_aplicable: "PLOT-A61-2021+A270-2025",
      codigo_zona: "RM3-C2",
      resultados: [{ regla_id: "SF-X", resultado: "REQUIERE_REVISION", grupo: "zona_por_confirmar", decision_motor: { resultado: "INFORMACION_REQUERIDA", motivo: "depende de la zona del lote: falta la CEUS o la unidad territorial" } }],
      zona_trabajo: { codigo: null, norma: "PLOT-A61-2021+A270-2025", firme: false, explicacion: "No hay una zona razonable para evaluar.", falta: "la CEUS o la unidad territorial" },
      reglas_vigentes: { total: 70, generales: 54, zonificacion: 16 },
    };
    const v = traducirExpediente({ slug: "sf", carpeta: "San Francisco - RLA-0000-1", resultado, fecha: "2026-10-19T00:00:00Z" }).project.expediente?.vigentes;
    expect(v).toMatchObject({ zona: null, procedenciaZona: "sin zona de trabajo: falta la CEUS o la unidad territorial" });
  });
});
