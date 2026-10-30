import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/services/api";
import { ErrorState } from "./states";

describe("ErrorState", () => {
  it("muestra el mensaje de un error de la API, pensado para el usuario", () => {
    render(<ErrorState error={new ApiError("gis.capa", "No se pudo cargar una capa del mapa.")} />);
    expect(screen.getByText("No se pudo cargar una capa del mapa.")).toBeInTheDocument();
  });
  it("no expone detalles internos de otros errores", () => {
    render(<ErrorState error={new TypeError("Failed to fetch http://127.0.0.1:8000/interno")} />);
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
    expect(screen.getByText("No se pudo cargar la información. Revise la conexión e inténtelo de nuevo.")).toBeInTheDocument();
  });
});

describe("ErrorState en línea", () => {
  it("es compacto: icono + el texto dado, sin el rótulo ni el recuadro de la variante de bloque", () => {
    render(<ErrorState variant="inline" message="No se pudo cargar la actividad." />);
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(/^No se pudo cargar la actividad\.$/);
    expect(alerta.querySelector("svg[aria-hidden]")).not.toBeNull();
    expect(alerta.className).not.toMatch(/\bborder\b/);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("se puede usar dentro de una frase (elemento en línea, válido dentro de <p>)", () => {
    render(
      <p>
        Corregimiento: <ErrorState variant="inline" message="no se pudo cargar la capa" />
      </p>,
    );
    expect(screen.getByRole("alert").tagName).toBe("SPAN");
  });

  it("con onRetry ofrece «Reintentar»", async () => {
    const onRetry = vi.fn();
    render(<ErrorState variant="inline" message="no se pudo cargar la capa" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("sin mensaje propio usa el del error de la API, sin exponer detalles internos", () => {
    const { rerender } = render(<ErrorState variant="inline" error={new ApiError("gis.capa", "No se pudo cargar una capa del mapa.")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar una capa del mapa.");
    rerender(<ErrorState variant="inline" error={new TypeError("Failed to fetch http://127.0.0.1")} />);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/Failed to fetch/);
  });
});
