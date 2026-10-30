import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { ZoningView } from "./zoning-view";

describe("ZoningView", { timeout: 15_000 }, () => {
  it("busca con el prefijo 1 y muestra la ficha literal con su página", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ZoningView />);
    await user.type(await screen.findByRole("searchbox", { name: /Buscar ficha/ }), "1RM-2");
    const list = screen.getByRole("list", { name: "Fichas de zona" });
    expect(within(list).getAllByRole("button")).toHaveLength(1);
    const sheet = screen.getByRole("article", { name: /RM-2/ });
    expect(within(sheet).getByText("Lo establecido ó 5m")).toBeInTheDocument();
    expect(within(sheet).getByText("1,500 pers/ha")).toBeInTheDocument();
    expect(within(sheet).getByText("pág. 11")).toBeInTheDocument();
    expect(within(sheet).getByText(/CEUS/)).toBeInTheDocument();
  });

  it("cambia de ficha al elegir otra zona", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ZoningView />);
    await user.click(await screen.findByRole("button", { name: /^CU/ }));
    expect(screen.getByRole("article", { name: /CU — Comercial urbano/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^CU/ })).toHaveAttribute("aria-pressed", "true");
  });
});
