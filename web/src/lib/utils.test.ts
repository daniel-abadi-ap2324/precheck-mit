import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn con los tokens del proyecto", () => {
  it("text-2xs y text-compact son tamaños de letra: no borran el color del texto", () => {
    expect(cn("text-primary-foreground", "text-compact")).toBe("text-primary-foreground text-compact");
    expect(cn("text-pass", "text-2xs")).toBe("text-pass text-2xs");
  });

  it("todo tamaño de letra propio de globals.css (@theme --text-*) está registrado en cn", () => {
    const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    const tamaños = [...css.matchAll(/^\s*--text-([\w-]+):/gm)].map((m) => m[1]).filter((t) => !t.includes("--"));
    expect(tamaños.length).toBeGreaterThan(0);
    for (const t of tamaños) expect(cn("text-primary-foreground", `text-${t}`)).toBe(`text-primary-foreground text-${t}`);
  });

  it("entre tamaños sí gana el último", () => {
    expect(cn("text-sm", "text-compact")).toBe("text-compact");
    expect(cn("text-2xs", "text-xs")).toBe("text-xs");
  });
});
