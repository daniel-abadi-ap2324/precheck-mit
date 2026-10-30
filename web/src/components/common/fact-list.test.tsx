import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FactList } from "./fact-list";

describe("FactList", () => {
  it("renderiza cada fila como término y definición de una lista con nombre", () => {
    render(
      <FactList
        label="Datos del lote"
        rows={[
          { label: "Finca", value: "070819" },
          { label: "Área", value: <span>450 m²</span> },
        ]}
      />,
    );
    const lista = screen.getByLabelText("Datos del lote");
    expect(lista.tagName).toBe("DL");
    const terminos = within(lista).getAllByRole("term");
    const definiciones = within(lista).getAllByRole("definition");
    expect(terminos.map((t) => t.textContent)).toEqual(["Finca", "Área"]);
    expect(definiciones.map((d) => d.textContent)).toEqual(["070819", "450 m²"]);
  });

  it("sin valor muestra una raya, nunca una celda vacía", () => {
    render(
      <FactList
        rows={[
          { label: "Dirección", value: undefined },
          { label: "Uso", value: null },
        ]}
      />,
    );
    expect(screen.getAllByRole("definition").map((d) => d.textContent)).toEqual(["—", "—"]);
  });

  it("el tono atenuado se distingue también con cursiva, no solo con color", () => {
    render(<FactList rows={[{ label: "Retiros", value: "no consta en el expediente", tone: "muted" }]} />);
    const dd = screen.getByRole("definition");
    expect(dd.className).toMatch(/\btext-muted-foreground\b/);
    expect(dd.className).toMatch(/\bitalic\b/);
  });

  it("el ancho de la etiqueta es un token: sm = 10rem, md = 14rem; fluid reparte en proporción", () => {
    const rows = [{ label: "A", value: "1" }];
    const { rerender } = render(<FactList label="l" rows={rows} />);
    expect(screen.getByLabelText("l").className).toContain("sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]");
    rerender(<FactList label="l" labelWidth="md" rows={rows} />);
    expect(screen.getByLabelText("l").className).toContain("sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]");
    rerender(<FactList label="l" labelWidth="fluid" rows={rows} />);
    expect(screen.getByLabelText("l").className).toContain("grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]");
  });

  it("los valores numéricos alineados al final usan cifras tabulares", () => {
    render(<FactList valueAlign="end" rows={[{ label: "Sin código", value: "3" }]} />);
    const dd = screen.getByRole("definition");
    expect(dd.className).toMatch(/\btext-right\b/);
    expect(dd.className).toMatch(/\btabular\b/);
  });
});
