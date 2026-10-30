import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/types";

const base = { propertyId: "", finca: "1", address: "", corregimiento: "", projectType: "", applicant: "", zoningCode: "RM1", status: "DONE" as const, updatedAt: "2026-10-19T10:00:00Z" };
const web = (id: string, name: string, extra: Partial<Project> = {}) => ({ project: { id, name, ...base, ...extra }, planes: [] });

const servidor = { listarProyectosWeb: vi.fn() };
vi.mock("@/services/proyectos/cliente", async (original) => ({ ...(await original<object>()), ...servidor }));
vi.mock("@/services/expedientes/cliente", async (original) => ({ ...(await original<object>()), listarExpedientes: async () => [] }));

describe("listProjects: corridas de prueba", () => {
  beforeEach(() => {
    vi.resetModules();
    servidor.listarProyectosWeb.mockResolvedValue([
      web("prj-web-000000000001", "Ancón - RLA-0000-11"),
      web("prj-web-000000000002", "Tocumen (comercial) - prueba 77 con Opus 5.5"),
      web("prj-web-000000000003", "Bella Vista - IA Opus 5.5"),
      web("prj-web-000000000004", "Plano marcado", { esPrueba: true }),
    ]);
  });

  const nombres = (items: Project[]) => items.filter((p) => p.id.startsWith("prj-web-")).map((p) => p.name);

  it("por defecto deja fuera las corridas de prueba y dice cuántas ocultó", async () => {
    const { mockClient } = await import("./adapter");
    const r = await mockClient.listProjects();
    expect(nombres(r.items)).toEqual(["Ancón - RLA-0000-11"]);
    expect(r.ocultas).toBe(3);
  });

  it("«incluir» las trae todas y «solo» solo las de prueba", async () => {
    const { mockClient } = await import("./adapter");
    expect(nombres((await mockClient.listProjects({ pruebas: "incluir" })).items)).toHaveLength(4);
    const solo = await mockClient.listProjects({ pruebas: "solo" });
    expect(solo.items.map((p) => p.name).sort()).toEqual(["Bella Vista - IA Opus 5.5", "Plano marcado", "Tocumen (comercial) - prueba 77 con Opus 5.5"]);
  });
});
