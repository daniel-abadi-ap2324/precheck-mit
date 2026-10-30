import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgregarDato, DatoEditable } from "./dato-editable";

describe("DatoEditable", () => {
  it("corrige un dato con el número escrito", async () => {
    const user = userEvent.setup();
    const onCorregir = vi.fn().mockResolvedValue(undefined);
    render(<DatoEditable clave="lote.area_m2" etiqueta="Área del lote" actual="" corregido={false} onCorregir={onCorregir} />);
    await user.click(screen.getByRole("button", { name: "Corregir Área del lote" }));
    await user.type(screen.getByLabelText("Valor de Área del lote"), "850,5");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onCorregir).toHaveBeenCalledWith({ "lote.area_m2": 850.5 });
  });

  it("no envía un valor que no es un número", async () => {
    const user = userEvent.setup();
    const onCorregir = vi.fn();
    render(<DatoEditable clave="lote.area_m2" etiqueta="Área del lote" actual="" corregido={false} onCorregir={onCorregir} />);
    await user.click(screen.getByRole("button", { name: "Corregir Área del lote" }));
    await user.type(screen.getByLabelText("Valor de Área del lote"), "mucho");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onCorregir).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Escriba un número");
  });

  it("deshace una corrección", async () => {
    const user = userEvent.setup();
    const onCorregir = vi.fn().mockResolvedValue(undefined);
    render(<DatoEditable clave="lote.area_m2" etiqueta="Área del lote" actual="850.5" corregido onCorregir={onCorregir} />);
    await user.click(screen.getByRole("button", { name: "Deshacer la corrección de Área del lote" }));
    expect(onCorregir).toHaveBeenCalledWith({ "lote.area_m2": null });
  });
});

describe("DatoEditable: confirmación (paso 1)", () => {
  it("confirma un dato leído sin cambiarlo", async () => {
    const user = userEvent.setup();
    const onCorregir = vi.fn().mockResolvedValue(undefined);
    render(<DatoEditable clave="lote.finca" etiqueta="Finca" actual="071091" corregido={false} confirmable onCorregir={onCorregir} />);
    await user.click(screen.getByRole("button", { name: "Confirmar Finca" }));
    expect(onCorregir).toHaveBeenCalledWith({ "lote.finca": { confirmar: true } });
  });

  it("sin «confirmable» no ofrece confirmar; uno confirmado se puede deshacer", async () => {
    const user = userEvent.setup();
    const onCorregir = vi.fn().mockResolvedValue(undefined);
    render(<DatoEditable clave="lote.finca" etiqueta="Finca" actual="071091" corregido={false} confirmado onCorregir={onCorregir} />);
    expect(screen.queryByRole("button", { name: "Confirmar Finca" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Deshacer la confirmación de Finca" }));
    expect(onCorregir).toHaveBeenCalledWith({ "lote.finca": null });
  });
});

describe("AgregarDato", () => {
  it("agrega un dato que el lector no trae", async () => {
    const user = userEvent.setup();
    const onCorregir = vi.fn().mockResolvedValue(undefined);
    render(<AgregarDato presentes={new Set(["lote.area_m2"])} onCorregir={onCorregir} />);
    expect(screen.queryByRole("option", { name: /Área del lote/ })).toBeNull();
    await user.selectOptions(screen.getByLabelText("Dato que se agrega"), "proyecto.altura_m");
    await user.type(screen.getByLabelText("Valor del dato que se agrega"), "12");
    await user.click(screen.getByRole("button", { name: "Agregar" }));
    expect(onCorregir).toHaveBeenCalledWith({ "proyecto.altura_m": 12 });
  });
});
