import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reportColors, reportColorTokens } from "./report-colors";

const tokensCss = readFileSync(join(__dirname, "../styles/tokens.css"), "utf8");
const tokenValue = (name: string) => tokensCss.match(new RegExp(`${name}:\\s*(#[0-9a-f]{3,8})\\b`, "i"))?.[1]?.toLowerCase();

describe("paleta del informe HTML", () => {
  it("cada color coincide con su token --mp-* (un solo origen de la identidad)", () => {
    for (const [key, token] of Object.entries(reportColorTokens)) {
      expect(tokenValue(token), `${key} → ${token}`).toBe(reportColors[key as keyof typeof reportColors].toLowerCase());
    }
  });
});
