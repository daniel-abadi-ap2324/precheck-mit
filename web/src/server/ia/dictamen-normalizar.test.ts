// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizarDecisiones, reglasDeDocumentoExterno, reglasSoloDelPlano } from "./dictamen-normalizar";

describe("reglas de documento externo", () => {
  it("son las que solo leen expediente.* o registro_publico.* (el contexto del trámite no cuenta)", () => {
    const entradas = new Map<string, string[]>([
      ["A110-ART21-CERT-REGISTRO-PROPIEDAD", ["tramite", "expediente.certificado_registro_propiedad.adjunto"]],
      ["PLOT-ART17-CEUS", ["expediente.ceus.presente", "lote.codigo_zona"]],
      // Mezcla plano + Registro Público: la IA puede decidir con el plano, no se fuerza.
      ["A110-AIV-AREA-LOTE", ["plano.area_lote_m2", "registro_publico.area_lote_m2"]],
      ["A110-AIV-CURVAS-NIVEL", ["plano.intervalo_curvas_nivel_m"]],
      ["SOLO-CONTEXTO", ["tramite"]],
    ]);
    expect([...reglasDeDocumentoExterno(entradas)].sort()).toEqual(["A110-ART21-CERT-REGISTRO-PROPIEDAD", "PLOT-ART17-CEUS"]);
  });
});

describe("normalizar las decisiones del dictamen", () => {
  const motor = new Map([
    ["A110-AIII-5-TENDEDERO", "NO_CUMPLE"],
    ["A110-ART18-ARQUITECTO-IDONEO", "CUMPLE"],
    ["A110-AIV-CURVAS-NIVEL", "REQUIERE_REVISION"],
    ["PLOT-ART17-CEUS", "REQUIERE_REVISION"],
    ["A110-ART21-CERT-REGISTRO-PROPIEDAD", "REQUIERE_REVISION"],
  ]);
  const externas = new Set(["PLOT-ART17-CEUS", "A110-ART21-CERT-REGISTRO-PROPIEDAD"]);

  it("anota las decisiones que contradicen al motor sin tocarlas; las que coinciden o son de reglas en revisión pasan", () => {
    const decisiones = [
      { regla_id: "A110-AIII-5-TENDEDERO", decision: "OBSERVACION", justificacion: "…" },
      { regla_id: "A110-ART18-ARQUITECTO-IDONEO", decision: "CUMPLE", justificacion: "…" },
      { regla_id: "A110-AIV-CURVAS-NIVEL", decision: "NO_CUMPLE", justificacion: "…" },
      { regla_id: "HALLAZGO-1", decision: "OBSERVACION", justificacion: "…" },
    ];
    const { decisiones: salida, cambios } = normalizarDecisiones(decisiones, motor, new Set());
    expect(salida).toBe(decisiones);
    expect(cambios).toEqual({ prevaleceMotor: ["A110-AIII-5-TENDEDERO (IA OBSERVACION, motor NO_CUMPLE)"], informacionRequerida: [], sinInformacionRequerida: [] });
  });

  it("una regla de documento externo en OBSERVACION o NO_CUMPLE pasa a INFORMACION_REQUERIDA con qué aportar", () => {
    const decisiones = [
      { regla_id: "PLOT-ART17-CEUS", decision: "NO_CUMPLE", justificacion: "No consta la CEUS.", subsanar: "" },
      { regla_id: "A110-ART21-CERT-REGISTRO-PROPIEDAD", decision: "OBSERVACION", justificacion: "…", subsanar: "Presente el certificado del Registro Público." },
      // Ya venía bien: no se toca.
      { regla_id: "PLOT-ART17-CEUS", decision: "OBSERVACION", estado: "INFORMACION_REQUERIDA", justificacion: "…", subsanar: "CEUS" },
      // CUMPLE (el usuario confirmó el documento) se respeta.
      { regla_id: "A110-ART21-CERT-REGISTRO-PROPIEDAD", decision: "CUMPLE", justificacion: "…" },
    ];
    const { decisiones: salida, cambios } = normalizarDecisiones(decisiones, motor, externas);
    expect(salida).not.toBe(decisiones);
    expect(salida[0]).toMatchObject({ decision: "OBSERVACION", estado: "INFORMACION_REQUERIDA", subsanar: "Aporte al expediente el documento que exige la regla." });
    expect(salida[1]).toMatchObject({ decision: "OBSERVACION", estado: "INFORMACION_REQUERIDA", subsanar: "Presente el certificado del Registro Público." });
    expect(salida[2]).toBe(decisiones[2]);
    expect(salida[3]).toBe(decisiones[3]);
    expect(cambios).toEqual({ prevaleceMotor: [], informacionRequerida: ["PLOT-ART17-CEUS", "A110-ART21-CERT-REGISTRO-PROPIEDAD"], sinInformacionRequerida: [] });
  });

  it("una regla cuyos datos salen del plano no puede quedar en INFORMACION_REQUERIDA: se le quita y queda la decisión", () => {
    const soloPlano = new Set(["A110-AIII-5-TENDEDERO", "PLOT-ART75-ESTAC-BICICLETAS"]);
    const decisiones = [
      { regla_id: "A110-AIII-5-TENDEDERO", decision: "OBSERVACION", estado: "INFORMACION_REQUERIDA", justificacion: "No hay tendedero.", subsanar: "Indique el tendedero." },
      { regla_id: "PLOT-ART75-ESTAC-BICICLETAS", decision: "OBSERVACION", justificacion: "…" },
      // Documento externo: se conserva.
      { regla_id: "PLOT-ART17-CEUS", decision: "OBSERVACION", estado: "INFORMACION_REQUERIDA", justificacion: "…", subsanar: "CEUS" },
      // Mezcla plano + Registro Público (no está en ninguno de los dos conjuntos): se respeta lo que dijo la IA.
      { regla_id: "A110-AIV-AREA-LOTE", decision: "OBSERVACION", estado: "INFORMACION_REQUERIDA", justificacion: "…", subsanar: "Certificado del Registro." },
    ];
    const { decisiones: salida, cambios } = normalizarDecisiones(decisiones, new Map(), externas, soloPlano);
    expect(salida[0]).toEqual({ regla_id: "A110-AIII-5-TENDEDERO", decision: "OBSERVACION", justificacion: "No hay tendedero.", subsanar: "Indique el tendedero." });
    expect(salida[1]).toBe(decisiones[1]);
    expect(salida[2]).toBe(decisiones[2]);
    expect(salida[3]).toBe(decisiones[3]);
    expect(cambios.sinInformacionRequerida).toEqual(["A110-AIII-5-TENDEDERO"]);
  });

  it("reglasSoloDelPlano: las que no leen ningún documento externo", () => {
    const entradas = new Map<string, string[]>([
      ["A110-AIV-CURVAS-NIVEL", ["plano.intervalo_curvas_nivel_m", "tramite"]],
      ["A110-AIV-AREA-LOTE", ["plano.area_lote_m2", "registro_publico.area_lote_m2"]],
      ["PLOT-ART17-CEUS", ["expediente.ceus.presente"]],
      ["SOLO-CONTEXTO", ["tramite"]],
    ]);
    expect([...reglasSoloDelPlano(entradas)]).toEqual(["A110-AIV-CURVAS-NIVEL"]);
  });

  it("decisiones sin regla_id o sin decision se dejan como están", () => {
    const decisiones = [{ decision: "CUMPLE" }, { regla_id: "X" }];
    expect(normalizarDecisiones(decisiones, motor, externas).decisiones).toBe(decisiones);
  });
});
