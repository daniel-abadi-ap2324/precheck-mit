import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuleResult } from "@/hooks/use-rule-results";
import type { ComplianceResult, ComplianceRule, PreCheck, Project } from "@/types";
import { composeObservations } from "./observations";
import { buildReportModel, type ReportVersion } from "./report-model";
import { renderReportHtml } from "./report-html";
import { downloadReportHtml } from "./download-report";

vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

const rule = (id: string, over: Partial<ComplianceRule> = {}): ComplianceRule => ({
  id,
  version: 1,
  title: `Regla ${id}`,
  category: "parking",
  description: "",
  operator: ">=",
  value: 6,
  unit: "m",
  regulation: { id, norma: "Acuerdo N°110 de 22-04-2025", article: "Anexo IV, 4", quote: "ancho mínimo 6.00m libres", sourcePage: 49 },
  state: "borrador",
  severity: "bloqueante",
  ...over,
});
const res = (ruleId: string, status: ComplianceResult["status"], over: Partial<ComplianceResult> = {}): ComplianceResult => ({ ruleId, status, official: false, ...over });

const items: RuleResult[] = [
  { rule: rule("W1", { severity: "observacion" }), result: res("W1", "WARNING", { requiredValue: 3 }) },
  { rule: rule("F1"), result: res("F1", "FAIL", { detectedValue: 5.5, requiredValue: 6, unit: "m", recommendedAction: "Amplíe la rampa <b>", geometry: [{ sheetId: "A-101", kind: "measurement", points: [], label: "5.50 m" }] }) },
  { rule: rule("P1"), result: res("P1", "PASS") },
  { rule: rule("M1", { operator: "criterio" }), result: res("M1", "MANUAL_REVIEW") },
];

const project = { id: "prj-1", name: "Proyecto <x>", status: "REVIEW_REQUIRED", applicant: "Arq. Test" } as Project;
const precheck = { id: "pc-1", engineVersion: "0.1.0", startedAt: "2026-09-26T14:02:10Z", finishedAt: "2026-09-26T14:02:41Z" } as PreCheck;
const model = (version: ReportVersion) => buildReportModel({ version, project, property: null, plans: [], precheck, items, generatedAt: precheck.finishedAt as string });

describe("observaciones redactadas", () => {
  it("ordena bloqueantes primero y redacta qué, dónde, por qué y qué hacer", () => {
    const [first, second] = composeObservations(items, null);
    expect(first.ruleId).toBe("F1");
    expect(first.que).toBe("Regla F1: el valor declarado es 5.5 m; la norma exige como mínimo 6 m.");
    expect(first.donde).toBe("Hoja A-101: 5.50 m.");
    expect(first.porque.quote).toBe("ancho mínimo 6.00m libres");
    expect(second.que).toMatch(/falta el dato declarado/);
    expect(second.donde).toBe("Ubicación no consta en los datos declarados.");
    expect(second.indicationPending).toBe(true);
  });
});

describe("modelo e informe HTML", () => {
  it("calcula conteos e índice preliminar y bloquea la emisión con el expediente pendiente", () => {
    const m = model("revisor");
    expect(m.counts).toEqual({ total: 4, pass: 1, fail: 1, conSupuesto: 0, warning: 1, manual: 1, index: 25 });
    expect(m.canIssue).toBe(false);
    expect(m.scope.map((s) => s.id)).toEqual(["borrador", "miviot", "dictamen"]);
  });

  it("escapa el texto y la versión del profesional no incluye «no oficial»", () => {
    const revisor = renderReportHtml(model("revisor"));
    expect(revisor).toContain("Proyecto &lt;x&gt;");
    expect(revisor).toContain("Amplíe la rampa &lt;b&gt;");
    expect(revisor).toContain("no oficial");
    expect(revisor).toContain("preliminares y están sujetos a revisión");
    const profesional = renderReportHtml(model("profesional"));
    expect(profesional).not.toContain("no oficial");
    expect(profesional).toContain("Vista previa — no emitida");
  });

  it("ADR-0016: «Qué se supuso» arriba, los avisos siempre en lenguaje llano, «No cumple · con supuesto» y la decisión del motor", () => {
    const expediente = {
      documento: null,
      paginas: 3,
      normaAplicable: "MIVIOT-AC-R160-2002",
      fechaPresentacion: null,
      umbral: 0.85,
      noAplican: 0,
      avisos: ["ZONA_TRABAJO: El código R2-A no existe en la norma; se descartó."],
      lote: [],
      proyecto: [],
      zonaTrabajo: { codigo: "R1d1", norma: "MIVIOT-AC-R160-2002", procedencia: "familia", firme: false, explicacion: "Se evaluó con R1d1.", falta: null, descartadas: [] },
      supuestos: [{ id: "S1", tipo: "zona", texto: "Se evaluó con R1d1.", accion: "Traiga la CEUS.", reglas: 1 }],
      conteo: { noCumple: 0, conSupuesto: 1, observaciones: 0, revisar: 0, agrupadas: 0, cumple: 1 },
    };
    const conSupuesto: RuleResult = {
      rule: rule("S1R"),
      result: res("S1R", "FAIL", { conSupuesto: true, motorStatus: "MANUAL_REVIEW", dictamen: { decision: "NO_CUMPLE", justificacion: "Con la zona supuesta.", evidencia: [], origen: "motor", supuestos: ["S1"] } }),
    };
    const m = buildReportModel({ version: "revisor", project: { ...project, expediente }, property: null, plans: [{ id: "pl-1", fileName: "a.pdf" } as never], precheck, items: [...items, conSupuesto], generatedAt: precheck.finishedAt as string });
    expect(m.counts.conSupuesto).toBe(1);
    expect(m.pendingReview[0]).toContain("de ellos 1 con supuesto por confirmar");
    const html = renderReportHtml(m);
    expect(html.indexOf('id="que-se-supuso"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="que-se-supuso"')).toBeLessThan(html.indexOf('id="proyecto"'));
    // Con planos cargados, el aviso igual se ve (antes solo salía sin planos), sin el prefijo técnico.
    expect(html).toContain("El código R2-A no existe en la norma; se descartó.");
    expect(html).not.toContain("ZONA_TRABAJO");
    expect(html).toContain("No cumple · con supuesto");
    expect(html).toContain("<b>Decisión de respaldo del motor.</b> La IA no decidió esta regla; descansa en S1");
    expect(html).toContain("Conteo final: 1 cumple, 0 no cumplen, 1 no cumple con supuesto (por confirmar), 0 observaciones y 0 en revisión.");
  });

  it("marca «no oficial» un resultado oficial de una regla en borrador", () => {
    const item = { rule: rule("B1", { state: "borrador" }), result: res("B1", "FAIL", { official: true }) };
    expect(composeObservations([item], null)[0].official).toBe(false);
    const aprobada = { rule: rule("A1", { state: "aprobada" }), result: res("A1", "FAIL", { official: true }) };
    expect(composeObservations([aprobada], null)[0].official).toBe(true);
  });

  describe("downloadReportHtml", () => {
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => "blob:informe");
      URL.revokeObjectURL = vi.fn();
    });
    it("descarga el HTML y dice cómo guardarlo como PDF, sin mostrar rutas internas", async () => {
      const { toast } = await import("sonner");
      expect(downloadReportHtml(model("revisor"))).toBe("informe-precheck-prj-1-revisor.html");
      expect(toast.info).toHaveBeenCalledWith("Informe descargado en HTML", {
        description: "Para obtener un PDF, ábralo en el navegador y elija Imprimir › Guardar como PDF.",
      });
    });
  });
});
