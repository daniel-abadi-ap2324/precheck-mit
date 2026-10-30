import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ExpedienteInfo, MarcaPlano } from "@/types";
import { VisorPaginasExpediente } from "./paginas-expediente";

const info = { documento: "plano.pdf", paginas: 3, miniaturas: [1, 2, 3], hojas: [{ numero: 2, tipo: "escaneada", lamina: "A-02" }] } as unknown as ExpedienteInfo;
const marca = (pagina: number, x = 0.1): MarcaPlano => ({ pagina, x, y: 0.2, w: 0.1, h: 0.1, origen: "ia", etiqueta: "Retiro frontal" });

describe("VisorPaginasExpediente con marcas", () => {
  it("dibuja los recuadros de la página elegida y los lista", () => {
    const { container } = render(<VisorPaginasExpediente projectId="pck-x" info={info} inicial={2} marcas={[marca(2), marca(2, 0.5), marca(3)]} />);
    expect(container.querySelectorAll("svg rect")).toHaveLength(2);
    expect(screen.getByRole("list", { name: "Marcas de la regla" })).toHaveTextContent("(ubicado por la IA): Retiro frontal");
    expect(screen.getByText(/2 marcas de la regla en esta página/)).toBeInTheDocument();
  });

  it("sin marcas en la página lo dice; sin marcas en la regla, también", () => {
    const { container, rerender } = render(<VisorPaginasExpediente projectId="pck-x" info={info} inicial={1} marcas={[marca(3)]} />);
    expect(container.querySelectorAll("svg rect")).toHaveLength(0);
    expect(screen.getByText(/marcas en otras páginas/)).toBeInTheDocument();
    rerender(<VisorPaginasExpediente projectId="pck-x" info={info} inicial={1} />);
    expect(screen.getByText(/no tiene recuadro/)).toBeInTheDocument();
  });
});
