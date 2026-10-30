import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SortableHeader, TablePagination } from ".";

function Cabecera(props: Partial<React.ComponentProps<typeof SortableHeader>>) {
  return (
    <table>
      <thead>
        <tr>
          <SortableHeader direction={false} onToggle={() => {}} {...props}>
            Diferencia
          </SortableHeader>
        </tr>
      </thead>
    </table>
  );
}

describe("SortableHeader", () => {
  it("anuncia el orden con aria-sort en el <th> y ordena con un botón", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<Cabecera onToggle={onToggle} />);
    const th = screen.getByRole("columnheader", { name: "Diferencia" });
    expect(th).toHaveAttribute("aria-sort", "none");
    await userEvent.click(screen.getByRole("button", { name: "Diferencia" }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<Cabecera onToggle={onToggle} direction="asc" />);
    expect(th).toHaveAttribute("aria-sort", "ascending");
    rerender(<Cabecera onToggle={onToggle} direction="desc" />);
    expect(th).toHaveAttribute("aria-sort", "descending");
  });

  it("el icono de orden es decorativo", () => {
    render(<Cabecera direction="asc" />);
    const icono = screen.getByRole("button").querySelector("svg");
    expect(icono).toHaveAttribute("aria-hidden", "true");
  });

  it("sin orden posible es un <th> sin botón ni aria-sort", () => {
    render(<Cabecera sortable={false} />);
    const th = screen.getByRole("columnheader", { name: "Diferencia" });
    expect(th).not.toHaveAttribute("aria-sort");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

const base = {
  label: "Paginación de pruebas",
  pageIndex: 1,
  pageSize: 10,
  pageCount: 6,
  total: 52,
  canPrev: true,
  canNext: true,
};

describe("TablePagination", () => {
  it("muestra el rango, la página y mueve con Anterior/Siguiente", async () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<TablePagination {...base} onPrev={onPrev} onNext={onNext} />);
    expect(screen.getByRole("navigation", { name: "Paginación de pruebas" })).toBeInTheDocument();
    expect(screen.getByText("11–20 de 52")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Página 2 de 6")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Anterior/ }));
    await userEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("deshabilita los botones en los extremos y sin filas muestra 0–0 y página 1 de 1", () => {
    render(<TablePagination {...base} pageIndex={0} pageCount={0} total={0} canPrev={false} canNext={false} onPrev={() => {}} onNext={() => {}} />);
    expect(screen.getByText("0–0 de 0")).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Anterior/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Siguiente/ })).toBeDisabled();
  });

  it("sin pageSizes no ofrece «Filas por página»", () => {
    render(<TablePagination {...base} onPrev={() => {}} onNext={() => {}} />);
    expect(screen.queryByLabelText("Filas por página")).not.toBeInTheDocument();
  });

  it("con pageSizes ofrece un select nativo «Filas por página»", async () => {
    const onPageSizeChange = vi.fn();
    render(<TablePagination {...base} pageSizes={[10, 25, 50]} onPageSizeChange={onPageSizeChange} onPrev={() => {}} onNext={() => {}} />);
    const select = screen.getByLabelText("Filas por página");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveValue("10");
    await userEvent.selectOptions(select, "50");
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("un resumen propio reemplaza el rango y puede ocultar el indicador de página", () => {
    render(
      <TablePagination
        {...base}
        summary={({ total, pageIndex, pageCount }) => `${total} reglas · página ${pageIndex + 1} de ${pageCount}`}
        showPageIndicator={false}
        onPrev={() => {}}
        onNext={() => {}}
      />,
    );
    expect(screen.getByText("52 reglas · página 2 de 6")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByText("Página 2 de 6")).not.toBeInTheDocument();
    expect(screen.queryByText("11–20 de 52")).not.toBeInTheDocument();
  });
});
