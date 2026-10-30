import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { fakeItem } from "@/test/rule-result-fixtures";
import { RuleTable } from "./rule-table";

describe("RuleTable", () => {
  it("marca «no oficial» un resultado oficial de una regla en borrador", () => {
    render(<RuleTable items={[fakeItem("R1", "FAIL", { rule: { state: "borrador" }, result: { official: true } })]} empty="Ninguna." />);
    expect(screen.getByText("no oficial")).toBeInTheDocument();
  });

  it("agrupa en una línea las reglas de otras zonas y lista en detalle las demás", () => {
    const otra = (id: string) => fakeItem(id, "MANUAL_REVIEW", { result: { group: "zona_por_confirmar", official: false } });
    render(<RuleTable items={[fakeItem("PROPIA", "MANUAL_REVIEW"), otra("OTRA-1"), otra("OTRA-2")]} empty="Ninguna." />);
    expect(screen.getByText("PROPIA")).toBeInTheDocument();
    expect(screen.queryByText("OTRA-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("fila-zona-por-confirmar")).toHaveTextContent("2 reglas de otras zonas de la norma: dependen de confirmar el código de zona");
  });

  it("no marca «no oficial» un resultado oficial de una regla aprobada", () => {
    render(<RuleTable items={[fakeItem("R1", "FAIL")]} empty="Ninguna." />);
    expect(screen.queryByText(/no oficial/)).not.toBeInTheDocument();
  });
});
