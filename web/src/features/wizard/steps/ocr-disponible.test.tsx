import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { useWizardStore } from "@/stores/wizard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/projects/new",
}));
vi.mock("@/services/planos/cliente", async (original) => ({
  ...(await original<typeof import("@/services/planos/cliente")>()),
  disponibilidadOcr: async () => ({
    rapido: { disponible: true },
    glm: { disponible: false, motivo: "Necesita Ollama en marcha con el modelo glm-ocr." },
    claude: { disponible: false, motivo: "Necesita Claude Code instalado y con la sesión iniciada." },
  }),
}));
const { StepUploadPlans } = await import("./step-upload-plans");

describe("selector de OCR", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useWizardStore.getState().reset();
  });

  it("deshabilita los lectores que este equipo no puede usar y dice qué falta", async () => {
    renderWithProviders(<StepUploadPlans onNext={() => {}} />);
    expect(await screen.findByText(/Necesita Ollama en marcha/)).toBeInTheDocument();
    expect(screen.getByText(/Necesita Claude Code instalado/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /GLM-OCR/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Claude/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Rápido/ })).toBeEnabled();
  });

  it("si el lector elegido no funciona, pasa al primero que sí", async () => {
    useWizardStore.getState().setOcr("glm");
    renderWithProviders(<StepUploadPlans onNext={() => {}} />);
    await waitFor(() => expect(useWizardStore.getState().ocr).toBe("rapido"));
  });
});
