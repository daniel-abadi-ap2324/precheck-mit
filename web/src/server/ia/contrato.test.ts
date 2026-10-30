import { describe, expect, it } from "vitest";
import { conocimientoVigente, contrato, IDS_CONTRATO } from "./contrato";
import { sistemaDeepSeek } from "./deepseek";
import { promptClaudeCode, sistemaApi } from "./revisar";

const estado = { datos: { tramite: "RLA", fechaPresentacion: "2026-10-01", normaAplicable: "PLOT-A61-2021" } } as Parameters<typeof promptClaudeCode>[2];
const CONOCIMIENTO = "# Conocimiento vigente\n\n## Lecciones\n- L-0001 [motor] una lección\n\n## Criterios computables vigentes\n- CC-0003 v1 un criterio\n\n## Criterios candidatos o suspendidos (no se aplican)\n- CC-0001 candidato\n\n## Mejoras propuestas del motor\n- PH-0001 mejora";

describe("contrato común de revisión", () => {
  const prompts = {
    "claude-code": promptClaudeCode("C:/caso", "C:/plano.pdf", estado, [], undefined, false, null, [], "## Lecciones\n- L-0001"),
    deepseek: sistemaDeepSeek("## Lecciones\n- L-0001"),
    "anthropic-api": sistemaApi("## Lecciones\n- L-0001"),
  };

  it.each(Object.entries(prompts))("todas las secciones llegan al prompt de %s, con el conocimiento", (_, p) => {
    for (const id of IDS_CONTRATO) expect(p).toContain(`[${id}]`);
    expect(p).toContain("[C-CONOCIMIENTO]");
    expect(p).toContain("L-0001");
  });

  it("cada proveedor recibe sus verbos: Claude escribe alcance_ia.json, DeepSeek usa sus herramientas y la API no ve el plano", () => {
    expect(prompts["claude-code"]).toContain("alcance_ia.json");
    expect(prompts["claude-code"]).toContain("medir_dibujo.py");
    expect(prompts.deepseek).toContain("ver_recorte de esa zona");
    expect(prompts.deepseek).not.toContain("alcance_ia.json");
    expect(prompts["anthropic-api"]).toContain("no ves el plano");
    expect(prompts["anthropic-api"]).not.toContain("escribir_hecho");
  });

  it("las correcciones del análisis del 19-oct están para todos", () => {
    for (const p of Object.values(prompts)) {
      expect(p).toContain("EL CRITERIO ES OBLIGATORIO");
      expect(p).toContain("Benemérito Cuerpo de Bomberos");
      expect(p).toContain("JTIA");
      expect(p).toContain("proyecto.personas_total");
      expect(p).toContain("MP-C2 está en la Línea 1 y en la Línea 2");
      expect(p).toContain("HALLAZGO-CUADRO-AREAS-INCONSISTENTE");
      expect(p).toContain('"objeciones"');
    }
  });

  it("ADR-0016: zona de trabajo, decisión de respaldo del motor y NO_CUMPLE con supuesto, para todos", () => {
    for (const p of Object.values(prompts)) {
      expect(p).toContain("decision_motor");
      expect(p).toContain("SOLO si lo leíste con las coordenadas del lote");
      expect(p).toContain("esas sí las decides tú");
      expect(p).toContain("OBSERVACION «falta en el plano»");
      expect(p).toContain("por confirmar");
    }
  });

  it("sin conocimiento no hay sección de conocimiento", () => {
    expect(contrato({ buscarTexto: "", ampliar: null, medir: null, escribirDato: null, reevaluar: null, fijarAlcance: "", leerDocumento: "" })).not.toContain("[C-CONOCIMIENTO]");
  });

  it("del conocimiento solo pasan las lecciones y los criterios vigentes", () => {
    const v = conocimientoVigente(CONOCIMIENTO);
    expect(v).toContain("L-0001");
    expect(v).toContain("CC-0003");
    expect(v).not.toContain("CC-0001");
    expect(v).not.toContain("PH-0001");
  });
});
