/**
 * Markdown seguro: un subconjunto de Markdown (títulos, párrafos, listas, citas, tablas, código y separadores) se
 * convierte en bloques de texto. Nunca se interpreta HTML: una etiqueta en el texto se muestra tal cual, y los
 * enlaces se muestran como texto (sin href), así que no hay forma de inyectar scripts ni URLs.
 */

export type Inline = { t: "text" | "code" | "strong" | "em"; v: string };

export type Bloque =
  | { t: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; inline: Inline[] }
  | { t: "paragraph"; inline: Inline[] }
  | { t: "list"; ordered: boolean; items: Inline[][] }
  | { t: "quote"; inline: Inline[] }
  | { t: "code"; v: string }
  | { t: "table"; header: Inline[][]; rows: Inline[][][] }
  | { t: "hr" };

/** Negrita, cursiva y código en línea; los enlaces [texto](url) quedan como «texto». */
export function parseInline(texto: string): Inline[] {
  const src = texto.replace(/!?\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1");
  const out: Inline[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|\b_[^_\s][^_]*_\b)/g;
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push({ t: "text", v: src.slice(last, m.index) });
    const s = m[0];
    if (m[1]) out.push({ t: "code", v: s.slice(1, -1) });
    else if (m[2]) out.push({ t: "strong", v: s.slice(2, -2) });
    else out.push({ t: "em", v: s.slice(1, -1) });
    last = m.index + s.length;
  }
  if (last < src.length) out.push({ t: "text", v: src.slice(last) });
  return out;
}

const celdas = (linea: string) =>
  linea
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => parseInline(c.trim()));
const esSeparadorTabla = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const LISTA = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;

export function parseMarkdown(md: string): Bloque[] {
  const lineas = md.replace(/\r\n?/g, "\n").split("\n");
  const bloques: Bloque[] = [];
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    if (!l.trim()) {
      i += 1;
      continue;
    }
    if (/^\s*```/.test(l)) {
      const cuerpo: string[] = [];
      i += 1;
      while (i < lineas.length && !/^\s*```/.test(lineas[i])) cuerpo.push(lineas[i++]);
      i += 1;
      bloques.push({ t: "code", v: cuerpo.join("\n") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (h) {
      bloques.push({ t: "heading", level: h[1].length as 1 | 2 | 3 | 4 | 5 | 6, inline: parseInline(h[2]) });
      i += 1;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      bloques.push({ t: "hr" });
      i += 1;
      continue;
    }
    if (l.trim().startsWith("|") && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1])) {
      const header = celdas(l);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lineas.length && lineas[i].trim().startsWith("|")) rows.push(celdas(lineas[i++]));
      bloques.push({ t: "table", header, rows });
      continue;
    }
    if (/^\s*>/.test(l)) {
      const cuerpo: string[] = [];
      while (i < lineas.length && /^\s*>/.test(lineas[i])) cuerpo.push(lineas[i++].replace(/^\s*>\s?/, ""));
      bloques.push({ t: "quote", inline: parseInline(cuerpo.join(" ")) });
      continue;
    }
    const li = LISTA.exec(l);
    if (li) {
      const ordered = Boolean(li[2]);
      const items: string[] = [];
      while (i < lineas.length) {
        const m = LISTA.exec(lineas[i]);
        if (m && Boolean(m[2]) === ordered) items.push(m[3]);
        else if (lineas[i].trim() && /^\s{2,}/.test(lineas[i]) && items.length) items[items.length - 1] += ` ${lineas[i].trim()}`;
        else break;
        i += 1;
      }
      bloques.push({ t: "list", ordered, items: items.map(parseInline) });
      continue;
    }
    const parrafo: string[] = [];
    while (i < lineas.length && lineas[i].trim() && !/^(#{1,6}\s|\s*```|\s*>)/.test(lineas[i]) && !LISTA.test(lineas[i])) parrafo.push(lineas[i++].trim());
    if (parrafo.length === 0) {
      // Línea que ningún bloque reconoce: se muestra como texto.
      parrafo.push(lineas[i++].trim());
    }
    bloques.push({ t: "paragraph", inline: parseInline(parrafo.join(" ")) });
  }
  return bloques;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function inlineHtml(xs: Inline[]): string {
  return xs.map((x) => (x.t === "code" ? `<code>${esc(x.v)}</code>` : x.t === "strong" ? `<b>${esc(x.v)}</b>` : x.t === "em" ? `<i>${esc(x.v)}</i>` : esc(x.v))).join("");
}

/** HTML escapado (para el informe descargable). Los títulos bajan un nivel bajo el h2 de la sección. */
export function markdownAHtml(md: string): string {
  return parseMarkdown(md)
    .map((b) => {
      switch (b.t) {
        case "heading":
          return `<h${Math.min(6, b.level + 2)}>${inlineHtml(b.inline)}</h${Math.min(6, b.level + 2)}>`;
        case "paragraph":
          return `<p>${inlineHtml(b.inline)}</p>`;
        case "quote":
          return `<blockquote>${inlineHtml(b.inline)}</blockquote>`;
        case "code":
          return `<pre>${esc(b.v)}</pre>`;
        case "hr":
          return "<hr>";
        case "list": {
          const tag = b.ordered ? "ol" : "ul";
          return `<${tag}>${b.items.map((it) => `<li>${inlineHtml(it)}</li>`).join("")}</${tag}>`;
        }
        case "table":
          return `<table><thead><tr>${b.header.map((c) => `<th>${inlineHtml(c)}</th>`).join("")}</tr></thead><tbody>${b.rows
            .map((r) => `<tr>${r.map((c) => `<td>${inlineHtml(c)}</td>`).join("")}</tr>`)
            .join("")}</tbody></table>`;
      }
    })
    .join("");
}
