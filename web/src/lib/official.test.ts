import { describe, expect, it } from "vitest";
import { fakeItem } from "@/test/rule-result-fixtures";
import { isOfficialResult } from "./official";

describe("isOfficialResult", () => {
  it("un resultado marcado oficial de una regla en borrador es «no oficial»", () => {
    expect(isOfficialResult(fakeItem("R1", "PASS", { rule: { state: "borrador" }, result: { official: true } }))).toBe(false);
  });

  it("solo es oficial si el resultado lo es y la regla está aprobada", () => {
    expect(isOfficialResult(fakeItem("R1", "PASS", { rule: { state: "aprobada" }, result: { official: true } }))).toBe(true);
    expect(isOfficialResult(fakeItem("R1", "PASS", { rule: { state: "aprobada" }, result: { official: false } }))).toBe(false);
    for (const state of ["rechazada", "retirada", "suspendida"] as const) {
      expect(isOfficialResult(fakeItem("R1", "FAIL", { rule: { state }, result: { official: true } }))).toBe(false);
    }
  });
});
