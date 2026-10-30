import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const ruta = vi.hoisted(() => ({ actual: "/projects/prj-betania-01" }));
vi.mock("next/navigation", () => ({ usePathname: () => ruta.actual }));

import { DemoBanner } from "./demo-banner";

describe("DemoBanner", () => {
  it("en la demostración avisa que los datos son de demostración", () => {
    ruta.actual = "/projects/prj-betania-01/results";
    render(<DemoBanner />);
    expect(screen.getByRole("note")).toHaveTextContent("Datos de demostración");
  });

  it("en un expediente real no dice «demostración», pero sí que el resultado no es oficial", () => {
    ruta.actual = "/projects/exp-casco-antiguo-rla-0000-12/plans";
    render(<DemoBanner />);
    const nota = screen.getByRole("note");
    expect(nota).not.toHaveTextContent(/demostración/);
    expect(nota).toHaveTextContent("preliminar y no es oficial");
  });
});
