import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidePanel } from "./side-panel";

function renderPanel(props: Partial<Parameters<typeof SidePanel>[0]> = {}) {
  const onClose = vi.fn();
  render(
    <SidePanel titleId="panel-prueba" title="Información del lote" subtitle="LOT-001" onClose={onClose} closeLabel="Cerrar información del lote" {...props}>
      <p>Contenido</p>
    </SidePanel>,
  );
  return onClose;
}

describe("SidePanel", () => {
  it("es una región nombrada por su título h2, con subtítulo y contenido", () => {
    renderPanel();
    const region = screen.getByRole("region", { name: "Información del lote" });
    expect(screen.getByRole("heading", { level: 2, name: "Información del lote" })).toHaveAttribute("id", "panel-prueba");
    expect(region).toHaveTextContent("LOT-001");
    expect(region).toHaveTextContent("Contenido");
  });

  it("el botón de cierre lleva su nombre accesible y cierra", async () => {
    const onClose = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar información del lote" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape cierra el panel, salvo que otro componente ya lo haya atendido", () => {
    const onClose = renderPanel();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    const evento = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    evento.preventDefault();
    document.dispatchEvent(evento);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("con closeOnEscape={false} (hoja móvil) no escucha Escape", () => {
    const onClose = renderPanel({ closeOnEscape: false });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
