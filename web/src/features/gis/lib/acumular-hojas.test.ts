import { describe, expect, it } from "vitest";
import { acumularHojas } from "./acumular-hojas";

describe("acumularHojas", () => {
  it("conserva las hojas ya cargadas al mover el mapa (no las saca de la capa)", () => {
    expect(acumularHojas(["5-5D", "5-6D"], ["5-6D", "5-7D"])).toEqual(["5-5D", "5-6D", "5-7D"]);
  });
  it("devuelve la MISMA lista si no llega ninguna hoja nueva (la capa no se redibuja)", () => {
    const prev = ["5-5D", "5-6D"];
    expect(acumularHojas(prev, ["5-6D"])).toBe(prev);
    expect(acumularHojas(prev, [])).toBe(prev);
  });
  it("respeta el tope descartando primero las hojas más antiguas", () => {
    expect(acumularHojas(["A", "B", "C"], ["D", "E"], 4)).toEqual(["B", "C", "D", "E"]);
  });
});
