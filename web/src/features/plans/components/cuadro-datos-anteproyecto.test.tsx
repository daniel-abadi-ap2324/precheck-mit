import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CuadroDatosAnteproyecto } from "./cuadro-datos-anteproyecto";

function ConEstado({ onChange }: { onChange: (clave: string, texto: string) => void }) {
  const [textos, setTextos] = useState<Record<string, string>>({});
  return (
    <CuadroDatosAnteproyecto
      textos={textos}
      onChange={(clave, texto) => {
        onChange(clave, texto);
        setTextos((t) => ({ ...t, [clave]: texto }));
      }}
    />
  );
}

describe("CuadroDatosAnteproyecto (paso 0)", () => {
  it("agrupa los datos con su unidad y explica que lo declarado se contrasta con el dibujo", () => {
    render(<CuadroDatosAnteproyecto textos={{}} onChange={vi.fn()} />);
    const cuadro = screen.getByRole("group", { name: "Cuadro de datos del anteproyecto" });
    for (const g of ["Lote", "Retiros", "Alturas", "Intensidad de uso", "Estacionamientos y accesos", "Acera"]) {
      expect(within(cuadro).getByRole("region", { name: g })).toBeInTheDocument();
    }
    const retiros = within(cuadro).getByRole("region", { name: "Retiros" });
    expect(within(retiros).getByLabelText("Retiro posterior (m)")).toBeInTheDocument();
    expect(within(cuadro).getByLabelText("Ocupación (%)")).toBeInTheDocument();
    expect(within(cuadro).getByLabelText("Rotura de cordón (m)")).toBeInTheDocument();
    expect(cuadro).toHaveAccessibleDescription(/contrasta con el dibujo/);
  });

  it("avisa cada cambio y marca lo que no es razonable junto al campo", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ConEstado onChange={onChange} />);
    await user.type(screen.getByLabelText("Retiro posterior (m)"), "2,5");
    expect(onChange).toHaveBeenLastCalledWith("proyecto.retiro_posterior_m", "2,5");
    expect(screen.getByLabelText("Retiro posterior (m)")).not.toHaveAttribute("aria-invalid", "true");

    await user.type(screen.getByLabelText("Ocupación (%)"), "120");
    const ocupacion = screen.getByLabelText("Ocupación (%)");
    expect(ocupacion).toHaveAttribute("aria-invalid", "true");
    expect(ocupacion).toHaveAccessibleDescription("Ocupación: no puede pasar de 100 %.");
  });
});
