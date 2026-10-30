import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DatosMotorCampos, declaracionesDe, respuestasDe } from "./datos-motor-campos";

const BASE = { norma: "PLOT-A61-2021", zona: "RM1", tramite: "RLA", fecha: "2026-10-07" };

describe("preguntas sí/no del expediente", () => {
  it("declaracionesDe solo incluye lo respondido y respuestasDe lo devuelve al formulario", () => {
    expect(declaracionesDe({ ...BASE })).toBeUndefined();
    expect(declaracionesDe({ ...BASE, urbanizacion: "no", bcbrp: "si", servidumbreOtra: "" })).toEqual({ esUrbanizacionOParcelacion: false, requiereBcbrp: true });
    expect(respuestasDe({ esUrbanizacionOParcelacion: false, requiereBcbrp: true })).toEqual({ urbanizacion: "no", servidumbreHidrica: "", servidumbreOtra: "", bcbrp: "si" });
    expect(respuestasDe(undefined)).toEqual({ urbanizacion: "", servidumbreHidrica: "", servidumbreOtra: "", bcbrp: "" });
  });

  it("muestra las cuatro preguntas sin responder y avisa del cambio", async () => {
    const onChange = vi.fn();
    render(<DatosMotorCampos valores={BASE} onChange={onChange} />);
    expect(screen.getByLabelText("¿Es una urbanización o parcelación?")).toHaveValue("");
    expect(screen.getByLabelText("¿Requiere la aprobación del Cuerpo de Bomberos (BCBRP)?")).toBeInTheDocument();
    expect(screen.getByLabelText("¿El lote tiene servidumbre fluvial o pluvial?")).toBeInTheDocument();
    expect(screen.getByLabelText(/servidumbre de otra entidad/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("¿Es una urbanización o parcelación?"), "si");
    expect(onChange).toHaveBeenCalledWith({ urbanizacion: "si" });
  });
});
