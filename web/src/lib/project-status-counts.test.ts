import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countProjectsByStatus, emptyStatusCounts } from "./project-status-counts";

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : /\.tsx?$/.test(name) ? [path] : [];
  });

describe("conteo de proyectos por estado", () => {
  it("parte de cero en todos los estados", () => {
    expect(emptyStatusCounts()).toEqual({ DRAFT: 0, PROCESSING: 0, REVIEW_REQUIRED: 0, COMPLETED: 0, FAILED: 0 });
  });

  it("cuenta los proyectos por estado", () => {
    expect(countProjectsByStatus([{ status: "DRAFT" }, { status: "COMPLETED" }, { status: "COMPLETED" }])).toEqual({
      DRAFT: 1,
      PROCESSING: 0,
      REVIEW_REQUIRED: 0,
      COMPLETED: 2,
      FAILED: 0,
    });
  });

  it("projects no importa de dashboard (sin dependencia circular)", () => {
    const root = join(__dirname, "../features/projects");
    const offenders = filesUnder(root).filter((f) => /from ["']@\/features\/dashboard/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
