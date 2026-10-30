import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { PlanActions } from "./plan-actions";

describe("PlanActions", () => {
  it("sin atributos ARIA prohibidos y la descarga no disponible se anuncia como deshabilitada", async () => {
    const { container } = render(<PlanActions projectId="prj-1" fileName="A-101.pdf" />);
    const r = await axe.run(container, { runOnly: { type: "rule", values: ["aria-prohibited-attr", "button-name", "aria-allowed-attr"] } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
    const descargar = screen.getByRole("button", { name: /Descargar A-101\.pdf/ });
    expect(descargar).toHaveAttribute("aria-disabled", "true");
    expect(descargar).toHaveAccessibleDescription("Descarga no disponible en esta demostración");
  });
});
