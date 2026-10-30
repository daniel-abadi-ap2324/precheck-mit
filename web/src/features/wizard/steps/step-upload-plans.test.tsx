import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { useWizardStore } from "@/stores/wizard";
import { StepUploadPlans } from "./step-upload-plans";

describe("StepUploadPlans", () => {
  it("guarda el lector OCR elegido para las cargas", async () => {
    useWizardStore.getState().reset();
    renderWithProviders(<StepUploadPlans onNext={() => undefined} />);
    await userEvent.setup().click(screen.getByRole("radio", { name: /Rápido/ }));
    expect(useWizardStore.getState().ocr).toBe("rapido");
  });

  it("tiene una zona aparte para documentos complementarios; uno solo no basta para continuar", () => {
    useWizardStore.getState().reset();
    useWizardStore.getState().upsertFile({ id: "d1", name: "Memoria.pdf", size: 8, format: "PDF", progress: 100, status: "uploaded", planId: "plan-2", complementario: true });
    renderWithProviders(<StepUploadPlans onNext={() => undefined} />);
    expect(screen.getByRole("button", { name: "Elegir documentos complementarios" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Documentos complementarios cargados" })).toHaveTextContent("Memoria.pdf");
    expect(screen.queryByRole("list", { name: "Planos cargados" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("pide acotar las distancias en el plano, con ejemplos, y ofrece el documento adjunto", () => {
    useWizardStore.getState().reset();
    renderWithProviders(<StepUploadPlans onNext={() => undefined} />);
    const aviso = screen.getByText("Acote en el plano todas las distancias").closest("[role=note]");
    expect(aviso).not.toBeNull();
    const lista = screen.getByRole("list", { name: "Cotas a declarar" });
    for (const t of [/retiro posterior/, /Frente del lote/, /Altura total/, /Rotura de cordón/]) expect(lista).toHaveTextContent(t);
    expect(aviso).toHaveTextContent(/documento adjunto/);
  });

  it("con planos cargados el lector ya no se cambia (cada plano se leyó con el suyo)", () => {
    useWizardStore.getState().reset();
    useWizardStore.getState().upsertFile({ id: "f1", name: "a.pdf", size: 8, format: "PDF", progress: 100, status: "uploaded", planId: "plan-1" });
    renderWithProviders(<StepUploadPlans onNext={() => undefined} />);
    expect(screen.getByRole("radio", { name: /GLM-OCR/ })).toBeDisabled();
    expect(screen.getByText(/quite los planos cargados/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
  });
});
