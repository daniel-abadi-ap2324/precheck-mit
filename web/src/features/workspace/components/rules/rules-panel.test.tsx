import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { brand } from "@/config/brand";
import { useWorkspaceStore } from "@/stores/workspace";
import { fakeItem } from "@/test/rule-result-fixtures";
import { RulesPanel } from "./rules-panel";

describe("RulesPanel", () => {
  beforeEach(() => useWorkspaceStore.getState().reset());

  it("lleva la nota preliminar aunque todas las reglas estén aprobadas", () => {
    render(<RulesPanel items={[fakeItem("R1", "PASS"), fakeItem("R2", "FAIL")]} />);
    const notes = screen.getAllByRole("note");
    expect(notes.some((n) => n.textContent?.includes(brand.preliminaryNotice))).toBe(true);
  });

  it("avisa de resultados indicativos si una regla está en borrador aunque el resultado diga oficial", () => {
    render(<RulesPanel items={[fakeItem("R1", "PASS", { rule: { state: "borrador" }, result: { official: true } })]} />);
    expect(screen.getByText(/Resultados indicativos/)).toBeInTheDocument();
  });
});
