import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RuleResult } from "@/hooks/use-rule-results";
import { RuleCard } from "./rule-card";

const item = (fueraDeCatalogo?: boolean): RuleResult =>
  ({
    rule: { id: "HALLAZGO-3", title: "Acabados generales", version: 1, state: "borrador" },
    result: { ruleId: "HALLAZGO-3", status: "FAIL", official: false, ...(fueraDeCatalogo ? { fueraDeCatalogo } : {}) },
  }) as unknown as RuleResult;

describe("RuleCard", () => {
  it("marca el hallazgo que propone la IA fuera del catálogo", () => {
    render(<RuleCard item={item(true)} selected={false} tabbable onActivate={() => undefined} />);
    expect(screen.getByText("Propuesto por la IA · fuera del catálogo")).toBeInTheDocument();
  });

  it("una regla del catálogo no lleva esa marca", () => {
    render(<RuleCard item={item()} selected={false} tabbable onActivate={() => undefined} />);
    expect(screen.queryByText(/fuera del catálogo/)).toBeNull();
  });

  it("marca con texto (no solo color) la respuesta del revisor DOYC; «pendiente» no lleva marca", () => {
    const { rerender } = render(<RuleCard item={item()} selected={false} tabbable onActivate={() => undefined} revision="confirmar" />);
    expect(screen.getByTestId("marca-revision")).toHaveTextContent("Confirmada por el revisor");
    rerender(<RuleCard item={item()} selected={false} tabbable onActivate={() => undefined} revision="contradecir" />);
    expect(screen.getByTestId("marca-revision")).toHaveTextContent("Contradicha por el revisor");
    rerender(<RuleCard item={item()} selected={false} tabbable onActivate={() => undefined} revision="pendiente" />);
    expect(screen.queryByTestId("marca-revision")).toBeNull();
  });
});
