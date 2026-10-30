import { beforeEach, describe, expect, it, vi } from "vitest";

const servidor = {
  subirPlano: vi.fn(),
  estadoDelPlano: vi.fn(),
  ejemplosDePlanos: vi.fn(),
  usarEjemplo: vi.fn(),
};
vi.mock("@/services/planos/cliente", () => servidor);

const EXTRACCION = { formato: "1.0.0", documento: "A.pdf", sha256: "x", paginas: [{ numero: 1 }], hechos: [], escalas: [], requisitos_anexo_iv: [] };

describe("adaptador: planos leídos en el servidor", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(servidor).forEach((f) => f.mockReset());
  });

  it("un PDF se sube con el archivo real y queda «leyéndose»; al terminar trae su lectura", async () => {
    const { mockClient } = await import("./adapter");
    servidor.subirPlano.mockImplementation(async (_f: File, onProgress?: (n: number) => void) => {
      onProgress?.(100);
      return { id: "plan-srv-1", status: "queued", fileName: "A.pdf" };
    });
    const archivo = new File(["%PDF-1.7"], "A.pdf");
    const avance: number[] = [];
    const plan = await mockClient.uploadPlan("prj-betania-01", { name: "A.pdf", size: 8, format: "PDF", file: archivo }, (n) => avance.push(n));
    expect(servidor.subirPlano).toHaveBeenCalledWith(archivo, expect.any(Function), undefined, undefined);
    expect([plan.id, plan.status, plan.extraction]).toEqual(["plan-srv-1", "processing", null]);
    expect(avance).toEqual([100]);

    servidor.estadoDelPlano.mockResolvedValue({ id: "plan-srv-1", status: "ready", fileName: "A.pdf", extraccion: EXTRACCION });
    const listo = await mockClient.getPlan("plan-srv-1");
    expect([listo.status, listo.extraction?.documento]).toEqual(["ready", "A.pdf"]);
    expect((await mockClient.listPlans("prj-betania-01")).find((p) => p.id === "plan-srv-1")?.status).toBe("ready");
  });

  it("si la lectura falla, el plano queda «falló» con el mensaje del servidor", async () => {
    const { mockClient } = await import("./adapter");
    servidor.subirPlano.mockResolvedValue({ id: "plan-srv-2", status: "queued", fileName: "B.pdf" });
    await mockClient.uploadPlan("prj-betania-01", { name: "B.pdf", size: 8, format: "PDF", file: new File(["%PDF"], "B.pdf") });
    servidor.estadoDelPlano.mockResolvedValue({ id: "plan-srv-2", status: "failed", fileName: "B.pdf", error: "No se pudo leer el plano." });
    const p = await mockClient.getPlan("plan-srv-2");
    expect([p.status, p.error]).toEqual(["failed", "No se pudo leer el plano."]);
  });

  it("DWG, DXF e IFC se cargan sin lectura (el lector de CAD/BIM no está conectado)", async () => {
    const { mockClient } = await import("./adapter");
    const plan = await mockClient.uploadPlan("prj-betania-01", { name: "A.dwg", size: 8, format: "DWG" });
    expect([plan.status, plan.extraction]).toEqual(["uploaded", undefined]);
    expect(servidor.subirPlano).not.toHaveBeenCalled();
  });

  it("los planos de ejemplo se listan y se agregan al proyecto como cualquier plano", async () => {
    const { mockClient } = await import("./adapter");
    servidor.ejemplosDePlanos.mockResolvedValue([{ nombre: "Bella Vista - RLA-0000-6.pdf", sizeBytes: 7_708_555 }]);
    expect(await mockClient.listPlanExamples()).toEqual([{ nombre: "Bella Vista - RLA-0000-6.pdf", sizeBytes: 7_708_555 }]);
    servidor.usarEjemplo.mockResolvedValue({ id: "plan-srv-3", status: "queued", fileName: "Bella Vista - RLA-0000-6.pdf", sizeBytes: 7_708_555 });
    const plan = await mockClient.addPlanExample("prj-betania-01", "Bella Vista - RLA-0000-6.pdf");
    expect([plan.id, plan.format, plan.status, plan.sizeBytes]).toEqual(["plan-srv-3", "PDF", "processing", 7_708_555]);
  });
});
