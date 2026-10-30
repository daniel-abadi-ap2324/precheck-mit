import type { ReactNode } from "react";

export function SettingsSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 rounded-lg border bg-card p-5">
      <h2 id={`${id}-title`} className="text-base font-semibold">
        {title}
      </h2>
      {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
