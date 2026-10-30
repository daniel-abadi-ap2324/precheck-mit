import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Corregimiento, SheetCell, ZoningSheetEntry } from "@/types";
import { SheetInfoPanel } from "./sheet-info-panel";

const cell: SheetCell = { hoja: "10-3A", escala: "1:10.000", serie: 10, pdf: "https://dpu.mupa.gob.pa/wp-content/uploads/2025/03/10-3A-121223.pdf" };
const entry: ZoningSheetEntry = {
  hoja: "10-3A",
  escala: "1:10.000",
  pdf: cell.pdf,
  fecha_hoja: "Octubre 2023",
  bbox: [-79.59, 8.92, -79.51, 8.97],
  poligonos: 169,
  por_estado: { ok: 104, sin_etiqueta: 60, conflicto: 5 },
};
const betania: Corregimiento = { id: "080806", nombre: "Betania", distrito: "Panamá", provincia: "Panamá", area_ha: 823.5, cabecera: "No", etiqueta: [-79.53, 9.01] };

describe("SheetInfoPanel", () => {
  it("hoja vectorizada: escala, fecha, conteos por estado, PDF oficial y nota referencial", () => {
    render(<SheetInfoPanel hoja="10-3A" cell={cell} entry={entry} onClose={() => {}} />);
    const panel = screen.getByRole("region", { name: "Hoja del Documento Gráfico" });
    const p = within(panel);
    expect(p.getByText("1:10.000")).toBeInTheDocument();
    expect(p.getByText("Octubre 2023")).toBeInTheDocument();
    expect(p.getByText("Sí")).toBeInTheDocument();
    const estados = Object.fromEntries(
      [...(p.getByLabelText("Polígonos por estado").querySelectorAll("dt") as NodeListOf<HTMLElement>)].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]),
    );
    expect(estados).toEqual({ "Código único": "104", "Sin código": "60", "Más de un código": "5" });
    const link = p.getByRole("link", { name: /Ver hoja original \(PDF, DPU\)/ });
    expect(link).toHaveAttribute("href", cell.pdf);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toMatch(/noopener/);
    expect(p.getByText(/referencial.*CEUS.*prevalece/)).toBeInTheDocument();
  });

  it("hoja pendiente: sin conteos, con PDF y corregimiento", () => {
    render(<SheetInfoPanel hoja="10-3A" cell={cell} entry={null} corregimiento={betania} onClose={() => {}} />);
    expect(screen.getByText("No, pendiente")).toBeInTheDocument();
    expect(screen.queryByLabelText("Polígonos por estado")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver hoja original/ })).toBeInTheDocument();
    expect(screen.getByText("Betania")).toBeInTheDocument();
    expect(screen.getByText("823.5 ha")).toBeInTheDocument();
  });

  it("fuera del índice de hojas muestra solo el corregimiento; Escape cierra", async () => {
    const onClose = vi.fn();
    render(<SheetInfoPanel hoja={null} cell={null} entry={null} corregimiento={betania} onClose={onClose} />);
    expect(screen.getByRole("region", { name: "Ubicación seleccionada" })).toBeInTheDocument();
    expect(screen.getByText(/fuera del índice de hojas/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await userEvent.setup().keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
