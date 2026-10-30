import type { ReactNode } from "react";
import { parseMarkdown, type Inline } from "@/lib/markdown-seguro";

function Texto({ inline }: { inline: Inline[] }) {
  return (
    <>
      {inline.map((x, i) =>
        x.t === "code" ? (
          <code key={i} className="rounded bg-muted px-1 text-xs">
            {x.v}
          </code>
        ) : x.t === "strong" ? (
          <strong key={i}>{x.v}</strong>
        ) : x.t === "em" ? (
          <em key={i}>{x.v}</em>
        ) : (
          x.v
        ),
      )}
    </>
  );
}

const TITULO = ["text-base", "text-sm", "text-sm", "text-sm", "text-sm", "text-sm"];

/**
 * Informe narrativo del agente revisor-planos (informe.md). Se muestra como texto con formato: el Markdown se
 * convierte en elementos de React, nunca en HTML crudo.
 */
export function RevisorNarrative({ markdown }: { markdown: string }) {
  const bloques = parseMarkdown(markdown);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-ink-muted">
        Texto redactado por el agente revisor-planos a partir del expediente. Es preliminar e indicativo: no sustituye el dictamen técnico de la DOYC (Acuerdo 110, Art. 3).
      </p>
      {bloques.map((b, i): ReactNode => {
        switch (b.t) {
          case "heading":
            return (
              <p key={i} role="heading" aria-level={Math.min(6, b.level + 2)} className={`${TITULO[b.level - 1]} mt-2 font-semibold`}>
                <Texto inline={b.inline} />
              </p>
            );
          case "paragraph":
            return (
              <p key={i}>
                <Texto inline={b.inline} />
              </p>
            );
          case "quote":
            return (
              <blockquote key={i} className="border-l-2 border-line pl-3 text-ink-muted">
                <Texto inline={b.inline} />
              </blockquote>
            );
          case "code":
            return (
              <pre key={i} className="overflow-x-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">
                {b.v}
              </pre>
            );
          case "hr":
            return <hr key={i} className="border-line" />;
          case "list": {
            const Lista = b.ordered ? "ol" : "ul";
            return (
              <Lista key={i} className={`${b.ordered ? "list-decimal" : "list-disc"} flex flex-col gap-1 pl-5`}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Texto inline={it} />
                  </li>
                ))}
              </Lista>
            );
          }
          case "table":
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-ink-muted">
                    <tr className="border-b">
                      {b.header.map((c, j) => (
                        <th key={j} scope="col" className="py-1 pr-2 font-medium">
                          <Texto inline={c} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b align-top last:border-0">
                        {r.map((c, k) => (
                          <td key={k} className="py-1 pr-2">
                            <Texto inline={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
