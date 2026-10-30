import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { describedBy, FormField } from "./form-field";

describe("describedBy", () => {
  it("une la ayuda y el error por id, en ese orden, y sin ninguno devuelve undefined", () => {
    expect(describedBy("f", { hint: "Ayuda", error: "Falta" })).toBe("f-hint f-error");
    expect(describedBy("f", { hint: true })).toBe("f-hint");
    expect(describedBy("f", { error: "Falta" })).toBe("f-error");
    expect(describedBy("f", {})).toBeUndefined();
    expect(describedBy("f", { hint: undefined, error: undefined })).toBeUndefined();
  });
});

describe("FormField", () => {
  it("asocia etiqueta, ayuda y error al control", () => {
    render(
      <FormField id="motivo" label="Motivo" hint="Cite la norma." error="El motivo es obligatorio.">
        <input id="motivo" aria-describedby={describedBy("motivo", { hint: "Cite la norma.", error: "El motivo es obligatorio." })} />
      </FormField>,
    );
    const control = screen.getByLabelText("Motivo");
    expect(control).toHaveAccessibleDescription("Cite la norma. El motivo es obligatorio.");
    expect(screen.getByText("Cite la norma.")).toHaveAttribute("id", "motivo-hint");
    expect(screen.getByText("El motivo es obligatorio.")).toHaveAttribute("id", "motivo-error");
  });

  it("el error lleva icono decorativo además del texto (nunca solo color)", () => {
    render(
      <FormField id="valor" label="Valor" error="Indique un número.">
        <input id="valor" />
      </FormField>,
    );
    const error = screen.getByText("Indique un número.");
    expect(error.className).toMatch(/\btext-fail\b/);
    const icono = error.querySelector("svg");
    expect(icono).not.toBeNull();
    expect(icono).toHaveAttribute("aria-hidden", "true");
  });

  it("sin ayuda ni error solo pinta etiqueta y control", () => {
    const { container } = render(
      <FormField id="q" label="Buscar">
        <input id="q" />
      </FormField>,
    );
    expect(screen.getByLabelText("Buscar")).toBeInTheDocument();
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});
