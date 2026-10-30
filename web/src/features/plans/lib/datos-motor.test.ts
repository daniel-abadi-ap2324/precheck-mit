import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NORMAS } from "@/server/prechecks/normas";
import { leerNumero, valorEscrito } from "./datos-motor";
import { NORMAS_MOTOR } from "./normas";

describe("leerNumero", () => {
  it("acepta coma o punto decimal y separadores de miles", () => {
    expect(leerNumero("1250,5")).toBe(1250.5);
    expect(leerNumero("1.250,5")).toBe(1250.5);
    expect(leerNumero("1,250.5")).toBe(1250.5);
    expect(leerNumero(" 12 ")).toBe(12);
  });
  it("rechaza lo que no es un número", () => {
    expect(leerNumero("")).toBeNull();
    expect(leerNumero("doce")).toBeNull();
    expect(leerNumero("12m")).toBeNull();
  });
});

describe("valorEscrito", () => {
  it("los datos de texto se guardan como texto y los demás como número", () => {
    expect(valorEscrito("lote.finca", "0001")).toEqual({ valor: "0001" });
    expect(valorEscrito("lote.area_m2", "850,5")).toEqual({ valor: 850.5 });
    expect(valorEscrito("lote.area_m2", "mucho")).toHaveProperty("error");
    expect(valorEscrito("lote.area_m2", " ")).toHaveProperty("error");
  });
});

describe("normas del motor", () => {
  it("la lista de la web es la de precheck/reglas/normas.json (servidor y cliente)", () => {
    const motor = JSON.parse(readFileSync(join(process.cwd(), "..", "precheck", "reglas", "normas.json"), "utf8")) as Record<string, unknown>;
    expect(NORMAS.map((n) => n.codigo).sort()).toEqual(Object.keys(motor).sort());
    expect(NORMAS_MOTOR).toEqual(NORMAS);
  });
});
