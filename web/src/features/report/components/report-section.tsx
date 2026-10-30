import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Field } from "../lib/report-fields";
import { sectionHeadingId, type ReportSection as Section } from "../lib/sections";

/** Sección del informe: ancla para el índice y encabezado enlazado. */
export function ReportSection({ section, children, className }: { section: Section; children: ReactNode; className?: string }) {
  return (
    <section id={section.id} aria-labelledby={sectionHeadingId(section.id)} className={cn("scroll-mt-24 break-inside-avoid-page border-t pt-5 print:pt-3", className)}>
      <h2 id={sectionHeadingId(section.id)} className="mb-3 text-base font-semibold tracking-tight">
        {section.title}
      </h2>
      {children}
    </section>
  );
}

export function FieldList({ fields, className }: { fields: Field[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(10rem,14rem)_1fr]", className)}>
      {fields.map((f) => (
        <div key={f.label} className="contents">
          <dt className="text-ink-muted">{f.label}</dt>
          <dd className={f.value.startsWith("no consta") ? "text-ink-muted italic" : undefined}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const Muted = ({ children }: { children: ReactNode }) => <p className="text-sm text-ink-muted">{children}</p>;
