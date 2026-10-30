import { describe, expect, it } from "vitest";
import type { Project } from "@/types";
import { buildProjectTimeline } from "./project-timeline";

const project = (status: Project["status"]): Project => ({
  id: "p",
  name: "P",
  propertyId: "x",
  finca: "1",
  address: "a",
  corregimiento: "c",
  projectType: "t",
  applicant: "Arq. Test",
  zoningCode: "RM-2",
  status,
  updatedAt: "2026-09-01T00:00:00Z",
});

describe("buildProjectTimeline", () => {
  it("marca la revisión como actual cuando el proyecto requiere revisión", () => {
    const t = buildProjectTimeline(project("REVIEW_REQUIRED"), undefined);
    expect(t.map((e) => e.state)).toEqual(["done", "done", "done", "current"]);
  });

  it("marca la ejecución como fallida y lo demás pendiente", () => {
    const t = buildProjectTimeline(project("FAILED"), undefined);
    expect(t.map((e) => e.state)).toEqual(["done", "failed", "pending", "pending"]);
  });

  it("no inventa fechas que el modelo no tiene", () => {
    const [created] = buildProjectTimeline(project("DRAFT"), undefined);
    expect(created.at).toBeUndefined();
  });
});
