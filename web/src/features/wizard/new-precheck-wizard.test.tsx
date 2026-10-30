import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { useWizardStore } from "@/stores/wizard";
import { NewPreCheckWizard } from "./new-precheck-wizard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/projects/new",
}));

describe("NewPreCheckWizard", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useWizardStore.getState().reset();
  });

  it("empieza en «Cargar el plano», sin formulario de datos ni mapa del lote", () => {
    renderWithProviders(<NewPreCheckWizard />);
    const nav = screen.getByRole("navigation", { name: "Pasos del nuevo PreCheck" });
    expect(nav.querySelector('[aria-current="step"]')).toHaveTextContent("Cargar el plano");
    expect(nav).toHaveTextContent("Confirmar y ejecutar");
    expect(screen.queryByLabelText("Nombre del proyecto")).not.toBeInTheDocument();
    expect(screen.queryByText(/Ubicar el lote/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("deja elegir el lector OCR; Rápido viene marcado (solo pide Tesseract)", () => {
    renderWithProviders(<NewPreCheckWizard />);
    expect(screen.getByRole("radio", { name: /Rápido/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /GLM-OCR/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Claude/ })).toBeInTheDocument();
  });
});
