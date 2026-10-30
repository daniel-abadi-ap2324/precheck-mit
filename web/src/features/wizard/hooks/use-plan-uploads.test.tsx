import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useWizardStore } from "@/stores/wizard";
import { api } from "@/services/api";
import { usePlanUploads } from "./use-plan-uploads";

describe("usePlanUploads", () => {
  it("envía el archivo real al servidor y guarda el id del plano para mostrar su lectura", async () => {
    useWizardStore.getState().reset();
    const archivo = new File(["%PDF-1.7"], "Bella Vista.pdf", { type: "application/pdf" });
    const subir = vi.spyOn(api, "uploadPlan").mockResolvedValue({ id: "plan-srv-9", projectId: "prj-x", fileName: "Bella Vista.pdf", format: "PDF", sizeBytes: 8, status: "processing", progress: 100, sheets: [], extraction: null });
    const { result } = renderHook(() => usePlanUploads("prj-x"));
    act(() => result.current.add([{ name: "Bella Vista.pdf", size: 8, format: "PDF", file: archivo }]));
    await waitFor(() => expect(useWizardStore.getState().files[0]?.status).toBe("uploaded"));
    expect(subir).toHaveBeenCalledWith("prj-x", { name: "Bella Vista.pdf", size: 8, format: "PDF", file: archivo, ocr: "rapido" }, expect.any(Function));
    expect(useWizardStore.getState().files[0].planId).toBe("plan-srv-9");
    subir.mockRestore();
  });
});
