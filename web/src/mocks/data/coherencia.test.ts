import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { traducirArchivo } from "@/server/reglas/traductor";
import type { ComplianceResult, ComplianceRule, PreCheck } from "@/types";
import rulesJson from "./rules.json";
import precheckJson from "./precheck-betania.json";

const reglas = new Map((rulesJson as ComplianceRule[]).map((r) => [r.id, r]));
const resultados = (precheckJson as PreCheck).results;

/** ¿El valor detectado cumple la regla numérica? (null si la regla no es numérica). */
function cumple(r: ComplianceResult, regla: ComplianceRule): boolean | null {
  if (r.detectedValue == null || r.requiredValue == null) return null;
  if (regla.operator === "<=") return r.detectedValue <= r.requiredValue;
  if (regla.operator === ">=") return r.detectedValue >= r.requiredValue;
  if (regla.operator === "=") return r.detectedValue === r.requiredValue;
  return null;
}

describe("coherencia de los datos de demostración", () => {
  it("la unidad y el valor requerido del resultado coinciden con los de su regla numérica", () => {
    const malos = resultados.flatMap((r) => {
      const regla = reglas.get(r.ruleId);
      if (!regla || regla.operator === "criterio" || regla.value == null || r.requiredValue == null) return [];
      return (r.unit ?? null) === (regla.unit ?? null) && r.requiredValue === regla.value ? [] : [`${r.ruleId}: ${r.requiredValue} ${r.unit} vs regla ${regla.value} ${regla.unit}`];
    });
    expect(malos).toEqual([]);
  });

  it("«Cumple» y «No cumple» son consistentes con el operador y los valores", () => {
    const malos = resultados.flatMap((r) => {
      const regla = reglas.get(r.ruleId);
      const ok = regla ? cumple(r, regla) : null;
      if (ok === null) return [];
      if (r.status === "PASS" && !ok) return [`${r.ruleId}: Cumple con ${r.detectedValue} ${regla?.operator} ${r.requiredValue}`];
      if (r.status === "FAIL" && ok) return [`${r.ruleId}: No cumple con ${r.detectedValue} ${regla?.operator} ${r.requiredValue}`];
      return [];
    });
    expect(malos).toEqual([]);
  });

  it("la diferencia es detectado − requerido", () => {
    const malos = resultados.filter((r) => r.difference != null && r.detectedValue != null && r.requiredValue != null && Math.abs(r.detectedValue - r.requiredValue - r.difference) > 1e-6).map((r) => r.ruleId);
    expect(malos).toEqual([]);
  });
});

/**
 * La web muestra el catálogo real (reglas/*.json); las reglas de data/rules.json solo son respaldo. Los resultados de
 * Betania que citan una regla real deben ser coherentes con ella: mismo valor requerido y misma unidad cuando la
 * condición de la regla es simple, y «Cumple» / «No cumple» según su operador.
 */
const carpetaReal = resolve(process.cwd(), "..", "reglas");
describe.runIf(existsSync(carpetaReal))("coherencia de la demostración con el catálogo real", () => {
  const reales = new Map(
    readdirSync(carpetaReal)
      .filter((a) => a.endsWith(".json"))
      .flatMap((a) => traducirArchivo(JSON.parse(readFileSync(join(carpetaReal, a), "utf8")), [], a))
      .map((r) => [r.id, r]),
  );
  const conReglaSimple = resultados.flatMap((r) => {
    const regla = reales.get(r.ruleId);
    return regla && regla.operator !== "criterio" && regla.value != null && r.requiredValue != null ? [{ r, regla }] : [];
  });

  it("hay resultados de Betania que citan reglas reales", () => expect(conReglaSimple.length).toBeGreaterThan(0));

  it("el valor requerido y la unidad coinciden con los de la regla real", () => {
    const norm = (u: string | null | undefined) => (u === "m²" ? "m2" : (u ?? null));
    const malos = conReglaSimple.flatMap(({ r, regla }) =>
      r.requiredValue === regla.value && norm(r.unit) === norm(regla.unit) ? [] : [`${r.ruleId}: ${r.requiredValue} ${r.unit} vs real ${regla.value} ${regla.unit}`],
    );
    expect(malos).toEqual([]);
  });

  it("«Cumple» y «No cumple» son consistentes con el operador de la regla real", () => {
    const malos = conReglaSimple.flatMap(({ r, regla }) => {
      const ok = cumple(r, regla);
      if (ok === null) return [];
      if ((r.status === "PASS" && !ok) || (r.status === "FAIL" && ok)) return [`${r.ruleId}: ${r.status} con ${r.detectedValue} ${regla.operator} ${r.requiredValue}`];
      return [];
    });
    expect(malos).toEqual([]);
  });
});
