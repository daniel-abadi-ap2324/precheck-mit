import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Callout, ReviewCallout } from "./callout";

describe("Callout", () => {
  it("siempre lleva icono, color del tono y texto (nunca solo color)", () => {
    render(<Callout tone="fail" title="No se pudo cargar">Inténtelo de nuevo.</Callout>);
    const nota = screen.getByRole("note");
    expect(nota.className).toMatch(/\bbg-fail-soft\b/);
    expect(nota.querySelector("svg[aria-hidden]")).not.toBeNull();
    expect(nota).toHaveTextContent("No se pudo cargar. Inténtelo de nuevo.");
  });

  it("«Requiere revisión» tiene una sola forma: tono de revisión, su icono y el rótulo", () => {
    render(<ReviewCallout>El lote toca dos zonas.</ReviewCallout>);
    const nota = screen.getByRole("note");
    expect(nota.className).toMatch(/\bbg-manual-soft\b/);
    expect(nota.className).not.toMatch(/warning/);
    expect(nota).toHaveTextContent("Requiere revisión. El lote toca dos zonas.");
  });
});
