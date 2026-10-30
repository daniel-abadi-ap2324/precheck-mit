"use client";

import { useActiveSection } from "../hooks/use-active-section";
import type { ReportSection } from "../lib/sections";
import { cn } from "@/lib/utils";

/** Índice fijo del informe: enlaces a cada sección y aria-current en la visible. */
export function ReportToc({ sections }: { sections: ReportSection[] }) {
  const active = useActiveSection(sections.map((s) => s.id));
  return (
    <nav aria-label="Navegación del informe" className="print:hidden lg:sticky lg:top-4">
      <p className="mb-2 text-sm font-medium">Contenido</p>
      <ol className="flex gap-1 overflow-x-auto border-l-0 text-sm lg:flex-col lg:gap-0 lg:border-l">
        {sections.map((s) => {
          const current = active === s.id;
          return (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={current ? "location" : undefined}
                className={cn(
                  "block rounded px-2 py-1 whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:-ml-px lg:rounded-none lg:border-l-2 lg:border-transparent lg:whitespace-normal",
                  current && "bg-brand-soft font-medium text-brand lg:border-brand lg:bg-transparent",
                )}
              >
                {s.title}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
