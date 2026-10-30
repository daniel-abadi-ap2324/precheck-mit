import { describe, expect, it } from "vitest";
import { fakeItem } from "@/test/rule-result-fixtures";
import { compareOptionalNumbers, countByStatus, filterRows, normalizeText, parseStatusFilter, preliminaryIndex, toResultRow, type ResultRow } from "./results-model";

const row = (id: string, status: ResultRow["status"], title: string): ResultRow => ({
  id,
  status,
  official: false,
  category: "setbacks",
  categoryLabel: "Retiros",
  title,
  operator: ">=",
  norma: "Acuerdo",
  article: "Art. 1",
  demo: false,
  haystack: normalizeText(`${title} ${id}`),
});

describe("results-model", () => {
  it("calcula el índice preliminar como cumple / evaluadas", () => {
    const counts = countByStatus([...Array(38).fill("PASS"), ...Array(7).fill("FAIL"), ...Array(4).fill("WARNING"), ...Array(3).fill("MANUAL_REVIEW")]);
    expect(counts).toEqual({ total: 52, PASS: 38, FAIL: 7, WARNING: 4, MANUAL_REVIEW: 3 });
    expect(preliminaryIndex(counts)).toBe(73);
  });

  it("filtra por estado y busca sin distinguir tildes", () => {
    const rows = [row("A", "FAIL", "Retiro lateral"), row("B", "PASS", "Área verde"), row("C", "FAIL", "Rampa")];
    expect(filterRows(rows, "FAIL", "")).toHaveLength(2);
    expect(filterRows(rows, "ALL", "area").map((r) => r.id)).toEqual(["B"]);
    expect(filterRows(rows, "FAIL", "retiro").map((r) => r.id)).toEqual(["A"]);
  });

  it("ignora valores de estado desconocidos en la URL", () => {
    expect(parseStatusFilter("FAIL")).toBe("FAIL");
    expect(parseStatusFilter("APROBADO")).toBe("ALL");
    expect(parseStatusFilter(null)).toBe("ALL");
  });

  it("deja los valores vacíos al final", () => {
    expect([3, undefined, -1].sort(compareOptionalNumbers)).toEqual([-1, 3, undefined]);
  });

  it("marca «no oficial» un resultado oficial de una regla en borrador", () => {
    expect(toResultRow(fakeItem("R1", "PASS", { rule: { state: "borrador" }, result: { official: true } })).official).toBe(false);
    expect(toResultRow(fakeItem("R2", "PASS", { rule: { state: "aprobada" }, result: { official: true } })).official).toBe(true);
  });
});

describe("formatRequired", () => {
  it("una regla de criterio con valor calculado muestra el valor (el mismo que el detalle), no solo «Criterio»", async () => {
    const { formatRequired } = await import("./columns");
    expect(formatRequired({ operator: "criterio", required: 5, unit: "m" })).toBe("5 m (criterio)");
    expect(formatRequired({ operator: "criterio", required: undefined, unit: undefined })).toBe("Criterio");
    expect(formatRequired({ operator: "<=", required: 12, unit: "m" })).toBe("≤ 12 m");
  });
});
