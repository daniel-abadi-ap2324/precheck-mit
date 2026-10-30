import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderWithProviders } from "@/test/render";
import type { ComplianceRule } from "@/types";
import { RuleVersionForm } from "./rule-version-form";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const rule: ComplianceRule = {
  id: "PLOT-RM-2-ALTURA",
  version: 1,
  title: "RM-2: altura máxima en pisos",
  category: "height",
  zoning: "RM-2",
  description: "El número de pisos excede la altura máxima (40 pisos) de la zona RM-2.",
  operator: "<=",
  value: 40,
  unit: "pisos",
  regulation: { id: "PLOT-RM-2-ALTURA", norma: "Anexo 4 PLOT", article: "Ficha RM-2", quote: "40 pisos", sourcePage: 11 },
  state: "borrador",
  severity: "bloqueante",
};

describe("RuleVersionForm", () => {
  it("exige el motivo y no envía sin él", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderWithProviders(<RuleVersionForm rule={rule} onDone={onDone} />);
    expect(screen.getByText(/nunca se editan en sitio/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preparar propuesta" }));
    const reason = screen.getByLabelText(/Motivo del cambio/);
    expect(await screen.findByText("El motivo es obligatorio.")).toBeInTheDocument();
    expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(reason.getAttribute("aria-describedby")).toContain("pv-reason-error");
    expect(toast.success).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("exige norma, artículo y cita literal y muestra los errores", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const sinFuente: ComplianceRule = { ...rule, regulation: { id: rule.id, norma: "", article: "", quote: "" } };
    renderWithProviders(<RuleVersionForm rule={sinFuente} onDone={onDone} />);
    await user.type(screen.getByLabelText(/Motivo del cambio/), "Corrección tras revisión de la ficha RM-2, pág. 11.");
    await user.click(screen.getByRole("button", { name: "Preparar propuesta" }));
    expect(await screen.findByText("Indique la norma de la que sale la regla.")).toBeInTheDocument();
    expect(screen.getByText("Indique el artículo o la sección de la norma.")).toBeInTheDocument();
    expect(screen.getByText("Copie la cita literal de la norma.")).toBeInTheDocument();
    const quote = screen.getByLabelText(/Cita literal/);
    expect(quote).toHaveAttribute("aria-invalid", "true");
    expect(quote.getAttribute("aria-describedby")).toContain("pv-quote-error");
    expect(onDone).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("valida el valor numérico y prepara la propuesta con aviso de aprobación por otra persona", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderWithProviders(<RuleVersionForm rule={rule} onDone={onDone} />);
    const value = screen.getByLabelText("Valor");
    await user.clear(value);
    await user.type(value, "cuarenta");
    await user.type(screen.getByLabelText(/Motivo del cambio/), "Corrección tras revisión de la ficha RM-2, pág. 11.");
    await user.click(screen.getByRole("button", { name: "Preparar propuesta" }));
    expect(await screen.findByText(/Escriba un número/)).toBeInTheDocument();
    await user.clear(value);
    await user.type(value, "42");
    await user.click(screen.getByRole("button", { name: "Preparar propuesta" }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(
      "Propuesta de versión preparada: debe aprobarla un revisor distinto de quien la propone",
      expect.objectContaining({ description: expect.stringContaining("PLOT-RM-2-ALTURA v2") }),
    );
  });
});
