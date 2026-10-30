import { describe, expect, it } from "vitest";
import type { PreCheck, Project } from "@/types";
import { computeDashboardMetrics } from "./compute-dashboard-metrics";

const base: Omit<Project, "id" | "status"> = {
  name: "P",
  propertyId: "PAR-1",
  finca: "1",
  address: "Calle 1",
  corregimiento: "Bella Vista",
  projectType: "Residencial",
  applicant: "Test",
  zoningCode: "RM-2",
  updatedAt: "2026-09-01T00:00:00Z",
};
const project = (id: string, status: Project["status"], complianceIndex?: number): Project => ({ ...base, id, status, complianceIndex });
const precheck = (projectId: string, failed: number, status: PreCheck["status"] = "completed"): PreCheck => ({
  id: `pc-${projectId}`,
  projectId,
  status,
  startedAt: "2026-09-01T00:00:00Z",
  engineVersion: "0.1.0",
  results: [],
  summary: { checked: 10, passed: 10 - failed, failed, warnings: 0, manualReview: 0, notApplicable: 0 },
});

describe("computeDashboardMetrics", () => {
  it("cuenta proyectos por estado", () => {
    const m = computeDashboardMetrics(
      [project("a", "COMPLETED", 90), project("b", "REVIEW_REQUIRED", 70), project("c", "DRAFT"), project("d", "FAILED"), project("e", "COMPLETED", 81)],
      [],
    );
    expect(m.total).toBe(5);
    expect(m.completed).toBe(2);
    expect(m.inReview).toBe(1);
    expect(m.byStatus).toEqual({ DRAFT: 1, PROCESSING: 0, REVIEW_REQUIRED: 1, COMPLETED: 2, FAILED: 1 });
  });

  it("promedia el índice preliminar solo de proyectos completados o en revisión", () => {
    const m = computeDashboardMetrics([project("a", "COMPLETED", 90), project("b", "REVIEW_REQUIRED", 71), project("c", "FAILED", 10), project("d", "COMPLETED")], []);
    expect(m.averageIndex).toBe(81);
    expect(m.indexSample).toBe(2);
  });

  it("devuelve null como promedio si ningún proyecto tiene índice", () => {
    const m = computeDashboardMetrics([project("a", "DRAFT")], []);
    expect(m.averageIndex).toBeNull();
    expect(m.indexSample).toBe(0);
  });

  it("suma incumplimientos solo de PreChecks terminados de los proyectos listados", () => {
    const m = computeDashboardMetrics([project("a", "REVIEW_REQUIRED", 73), project("b", "COMPLETED", 90)], [precheck("a", 7), precheck("b", 2), precheck("b", 5, "running"), precheck("zz", 9)]);
    expect(m.failedRules).toBe(9);
    expect(m.precheckCount).toBe(2);
  });

  it("maneja la lista vacía", () => {
    const m = computeDashboardMetrics([], []);
    expect(m).toMatchObject({ total: 0, completed: 0, inReview: 0, failedRules: 0, precheckCount: 0, averageIndex: null });
  });
});
