import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { RulesView } from "./rules-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const bodyRows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

describe("RulesView", { timeout: 15_000 }, () => {
  it("muestra estado de regla y catálogo, busca y filtra", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RulesView />);
    expect(await screen.findByText("PLOT-RM-2-DENSIDAD")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(15);
    expect(screen.getByText(/52 reglas · página 1 de 4/)).toBeInTheDocument();
    expect(screen.getAllByText("Borrador").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("searchbox", { name: "Buscar" }));
    await user.paste("retiros");
    await waitFor(() => expect(bodyRows().length).toBeLessThan(15));
    expect(screen.getByText("PLOT-RM-2-RETIROS")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Catálogo" }), "demo");
    await waitFor(() => expect(screen.queryByText("PLOT-RM-2-RETIROS")).not.toBeInTheDocument());
    for (const row of bodyRows()) expect(within(row).getByText("Demostración", { selector: "span.border-dashed" })).toBeInTheDocument();
  });

  it("filtra por zonificación inicial y ordena por ID de regla", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RulesView initialZoning="general" />);
    await screen.findByText(/reglas · página 1/);
    expect(screen.queryByText("PLOT-RM-2-DENSIDAD")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /ID de regla/ }));
    expect(screen.getByRole("columnheader", { name: /ID de regla/ })).toHaveAttribute("aria-sort", "ascending");
    expect(within(bodyRows()[0]).getByText(/^A110-/)).toBeInTheDocument();
  });

  it("abre el drawer con la cita literal y la nota de vigencia", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RulesView />);
    await user.click(await screen.findByRole("searchbox", { name: "Buscar" }));
    await user.paste("PLOT-RM-2-RETIROS");
    await user.click(await screen.findByRole("button", { name: "Ver regla PLOT-RM-2-RETIROS" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("«Lo establecido ó 5m»")).toBeInTheDocument();
    expect(within(dialog).getByText(/no se editan en sitio/)).toBeInTheDocument();
    expect(within(dialog).getByText("no oficial")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Proponer nueva versión" }));
    expect(await within(dialog).findByRole("form", { name: /Proponer nueva versión de PLOT-RM-2-RETIROS/ })).toBeInTheDocument();
  });

  it("el estado de la regla (borrador o aprobada) va junto al ID, no al final de la tabla", async () => {
    renderWithProviders(<RulesView />);
    const tabla = await screen.findByRole("table");
    const cabeceras = within(tabla).getAllByRole("columnheader").map((h) => h.textContent?.trim() ?? "");
    const i = (t: string) => cabeceras.findIndex((c) => c.startsWith(t));
    expect(i("Estado")).toBe(i("ID de regla") + 1);
  });
});
