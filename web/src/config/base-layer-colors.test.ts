import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapColorTokens, mapColors } from "./base-layer-colors";

const tokensCss = readFileSync(join(__dirname, "../styles/tokens.css"), "utf8");
const tokenValue = (name: string) => tokensCss.match(new RegExp(`${name}:\\s*(#[0-9a-f]{3,8})\\b`, "i"))?.[1]?.toLowerCase();

describe("colores del mapa", () => {
  it("los que repiten un token --mp-* coinciden con él (MapLibre no lee variables CSS)", () => {
    for (const [key, token] of Object.entries(mapColorTokens)) {
      expect(tokenValue(token), `${key} → ${token}`).toBe(String(mapColors[key as keyof typeof mapColors]).toLowerCase());
    }
  });
});
