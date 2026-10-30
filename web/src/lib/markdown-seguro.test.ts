import { describe, expect, it } from "vitest";
import { markdownAHtml, parseInline, parseMarkdown } from "./markdown-seguro";

describe("markdown seguro", () => {
  it("reconoce títulos, párrafos, listas, citas, tablas, código y separadores", () => {
    const md = "# Título\n\nUn párrafo\nen dos líneas.\n\n- uno\n- dos\n\n1. a\n2. b\n\n> cita\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```\ncódigo <b>\n```\n\n---";
    expect(parseMarkdown(md).map((b) => b.t)).toEqual(["heading", "paragraph", "list", "list", "quote", "table", "code", "hr"]);
    expect(parseMarkdown("Un párrafo\nen dos líneas.")[0]).toEqual({ t: "paragraph", inline: [{ t: "text", v: "Un párrafo en dos líneas." }] });
  });

  it("negrita, cursiva y código; los enlaces quedan como texto", () => {
    expect(parseInline("a **b** *c* `d` [e](javascript:alert(1))")).toEqual([
      { t: "text", v: "a " },
      { t: "strong", v: "b" },
      { t: "text", v: " " },
      { t: "em", v: "c" },
      { t: "text", v: " " },
      { t: "code", v: "d" },
      { t: "text", v: " e" },
    ]);
  });

  it("el HTML resultante escapa todo lo que venga en el texto", () => {
    const html = markdownAHtml("# <script>x</script>\n\n<img src=x onerror=alert(1)>\n\n| <b> |\n|---|\n| \" |");
    expect(html).not.toMatch(/<script|<img|<b>/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");
  });

  it("no se cuelga con entradas raras", () => {
    for (const md of ["", "\n\n", "#######", "|", "```", "> ", "- ", "  - x"]) expect(() => parseMarkdown(md)).not.toThrow();
  });
});
