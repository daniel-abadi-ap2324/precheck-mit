import { describe, expect, it } from "vitest";
import { formatDistance, riverWarning } from "./parcel-context";

describe("riverWarning", () => {
  it("marca para revisión hasta 50 m inclusive", () => {
    expect(riverWarning(32.4)).toBe("Río a 32 m: verificar servidumbre fluvial con el MOP (Acuerdo 110, Art. 21.10)");
    expect(riverWarning(50)).toMatch(/^Río a 50 m/);
    expect(riverWarning(0)).toMatch(/^Río a 0 m/);
  });

  it("no marca más allá de 50 m ni sin dato", () => {
    expect(riverWarning(50.6)).toBeNull();
    expect(riverWarning(null)).toBeNull();
    expect(riverWarning(undefined)).toBeNull();
  });
});

describe("formatDistance", () => {
  it("metros o kilómetros", () => {
    expect(formatDistance(812.4)).toBe("812 m");
    expect(formatDistance(1260)).toBe("1.3 km");
  });
});
