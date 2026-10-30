import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

describe("Button con estado de carga", () => {
  it("sin loading no lleva spinner ni aria-busy", () => {
    render(<Button>Guardar</Button>);
    const boton = screen.getByRole("button", { name: "Guardar" });
    expect(boton).not.toHaveAttribute("aria-busy");
    expect(boton).toBeEnabled();
    expect(boton.querySelector("[data-slot=button-spinner]")).toBeNull();
  });

  it("loading muestra el spinner (oculto al lector, animado solo si se permite movimiento), marca aria-busy y deshabilita", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Guardando…
      </Button>,
    );
    const boton = screen.getByRole("button", { name: "Guardando…" });
    expect(boton).toHaveAttribute("aria-busy", "true");
    expect(boton).toBeDisabled();
    const spinner = boton.querySelector("[data-slot=button-spinner]");
    expect(spinner).not.toBeNull();
    expect(spinner).toHaveAttribute("aria-hidden", "true");
    expect(spinner?.getAttribute("class")).toMatch(/motion-safe:animate-spin/);
    await userEvent.click(boton);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("un disabled explícito se respeta aunque no esté cargando", () => {
    render(
      <Button loading={false} disabled>
        Enviar
      </Button>,
    );
    const boton = screen.getByRole("button", { name: "Enviar" });
    expect(boton).toBeDisabled();
    expect(boton).not.toHaveAttribute("aria-busy");
  });
});
