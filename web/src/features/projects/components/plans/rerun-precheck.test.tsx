import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { api } from "@/services/api";
import type { PlanExtraction, PlanFact, Project } from "@/types";
import { RerunPreCheck } from "./rerun-precheck";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/projects/prj-web-1/plans", useSearchParams: () => new URLSearchParams() }));

const PROYECTO = { id: "prj-web-1", name: "Edificio", zoningCode: "RM1", tramite: "RLA" } as Project;
const leido = (hecho: string, valor: string | number, extra: Partial<PlanFact> = {}): PlanFact => ({ hecho, valor, confianza: 0.9, estado: "ok", fuente: { metodo: "pdf_texto", pagina: 1, bbox: [0, 0, 1, 1] }, ...extra });
const lectura = (hechos: PlanFact[]): PlanExtraction => ({ formato: "1.0.0", documento: "a.pdf", sha256: "0", paginas: [], escalas: [], requisitos_anexo_iv: [], hechos });

describe("RerunPreCheck: volver a ejecutar desde la página de planos", () => {
  it("no deja volver a ejecutar sin el área confirmada y dice qué falta", () => {
    renderWithProviders(<RerunPreCheck project={PROYECTO} lectura={lectura([leido("lote.finca", "071091", { confirmado: true }), leido("lote.area_m2", 900, { confianza: 0.6 })])} />);
    expect(screen.getByText(/No se pudo comprobar en el plano el área del lote\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Volver a ejecutar/ })).toBeDisabled();
  });

  it("con lo básico confirmado envía también el cuadro de datos", async () => {
    const user = userEvent.setup();
    const iniciar = vi.spyOn(api, "startPreCheck").mockResolvedValue({ precheckId: "pck-x" });
    renderWithProviders(<RerunPreCheck project={PROYECTO} lectura={lectura([leido("lote.finca", "071091", { confirmado: true }), leido("lote.area_m2", 900, { corregido: true })])} />);
    await user.selectOptions(screen.getByLabelText("Norma aplicable al lote"), "PLOT-A61-2021");
    await user.type(screen.getByLabelText("Retiro posterior (m)"), "2,2");
    await user.type(screen.getByLabelText("Estacionamientos"), "15");
    const boton = screen.getByRole("button", { name: /Volver a ejecutar/ });
    expect(boton).toBeEnabled();
    await user.click(boton);
    expect(iniciar).toHaveBeenCalledWith(
      "prj-web-1",
      expect.objectContaining({ codigoZona: "RM1", datosDeclarados: { "proyecto.retiro_posterior_m": 2.2, "proyecto.estacionamientos": 15 } }),
    );
  });
});
