import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import type { Ejecucion } from "../lib/comparacion";
import { DetalleDato } from "./detalle-dato";

const ejecucion = (projectId: string, modelo: string, dato?: Ejecucion["datos"]): Ejecucion => ({
  projectId,
  precheckId: `pck-${projectId}`,
  nombre: `Bella Vista - prueba 43 con ${modelo}`,
  modelo,
  iaTerminada: true,
  resultados: [],
  titulos: {},
  datos: dato,
});

describe("DetalleDato", () => {
  it("muestra por modelo el valor, la confianza, lo que anotó y la lámina; y dice cuándo no escribió el dato", () => {
    const onCerrar = vi.fn();
    renderWithProviders(
      <DetalleDato
        clave="proyecto.estacionamientos"
        etiqueta="Estacionamientos"
        onCerrar={onCerrar}
        ejecuciones={[
          ejecucion("a", "claude-opus-5-5", { "proyecto.estacionamientos": { valor: "36", confianza: 0.9, pagina: 3, metodo: "vision", detalle: "plazas 1–18 en mezzanine y 19–36 en semisótano" } }),
          ejecucion("b", "deepseek-flash", {}),
        ]}
      />,
    );
    const panel = screen.getByRole("region", { name: "Cómo leyó cada corrida: Estacionamientos" });
    const tarjetas = within(panel).getAllByRole("listitem");
    expect(within(tarjetas[0]).getByText("Opus 5.5")).toBeInTheDocument();
    expect(within(tarjetas[0]).getByText("36")).toBeInTheDocument();
    expect(within(tarjetas[0]).getByText("Confianza 0.9 · visto en la lámina · lámina 3")).toBeInTheDocument();
    expect(within(tarjetas[0]).getByText(/plazas 1–18 en mezzanine/)).toBeInTheDocument();
    expect(within(tarjetas[0]).getByRole("img", { name: /Lámina 3/ })).toHaveAttribute("src", "/api/prechecks/pck-a/paginas/3");
    expect(within(tarjetas[1]).getByText("DeepSeek Flash")).toBeInTheDocument();
    expect(within(tarjetas[1]).getByText("Esta corrida no escribió el dato.")).toBeInTheDocument();
  });
});
