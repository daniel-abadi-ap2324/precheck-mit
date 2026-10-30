import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const renombrar = vi.fn();
vi.mock("@/services/api", () => ({ api: { renameProject: (...a: unknown[]) => renombrar(...a) } }));
const { RenameProject } = await import("./rename-project");

const montar = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RenameProject projectId="prj-web-1" name="Edificio A" />
    </QueryClientProvider>,
  );

describe("RenameProject", () => {
  it("abre el campo con el nombre actual y guarda el nombre nuevo", async () => {
    const user = userEvent.setup();
    renombrar.mockResolvedValue({ id: "prj-web-1", name: "Edificio B" });
    montar();
    await user.click(screen.getByRole("button", { name: "Renombrar el proyecto" }));
    const campo = screen.getByLabelText("Nombre del proyecto");
    expect(campo).toHaveValue("Edificio A");
    await user.clear(campo);
    await user.type(campo, "Edificio B");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(renombrar).toHaveBeenCalledWith("prj-web-1", "Edificio B");
  });

  it("no deja guardar un nombre demasiado corto", async () => {
    const user = userEvent.setup();
    renombrar.mockClear();
    montar();
    await user.click(screen.getByRole("button", { name: "Renombrar el proyecto" }));
    const campo = screen.getByLabelText("Nombre del proyecto");
    await user.clear(campo);
    await user.type(campo, "ab");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(renombrar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Renombrar el proyecto" })).toBeInTheDocument();
  });

  it("muestra el error que devuelve el servidor", async () => {
    const user = userEvent.setup();
    renombrar.mockRejectedValue(new Error("No se pudo guardar el nombre."));
    montar();
    await user.click(screen.getByRole("button", { name: "Renombrar el proyecto" }));
    const campo = screen.getByLabelText("Nombre del proyecto");
    await user.clear(campo);
    await user.type(campo, "Otro nombre");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar el nombre.");
  });
});
