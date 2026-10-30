import { cn } from "@/lib/utils";
import { complianceMeta, metaDeResultado, projectStatusMeta, toneClasses, type StatusMeta } from "@/lib/status";
import type { ComplianceStatus, ProjectStatus } from "@/types";

interface ToneBadgeProps {
  meta: StatusMeta;
  size?: "sm" | "md";
  className?: string;
  /** Texto adicional para lectores de pantalla (p. ej. «no oficial»). */
  srSuffix?: string;
}

/** Estado con icono + color + texto. Nunca depende solo del color (WCAG 1.4.1). */
export function ToneBadge({ meta, size = "md", className, srSuffix }: ToneBadgeProps) {
  const Icon = meta.icon;
  const tone = toneClasses[meta.tone];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border font-medium whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-compact",
        tone.text,
        tone.bg,
        tone.border,
        className,
      )}
    >
      <Icon aria-hidden className={size === "sm" ? "size-3.5" : "size-4"} />
      {meta.label}
      {srSuffix ? <span className="sr-only">, {srSuffix}</span> : null}
    </span>
  );
}

export function StatusBadge({ status, ...rest }: { status: ProjectStatus } & Omit<ToneBadgeProps, "meta">) {
  return <ToneBadge meta={projectStatusMeta[status]} {...rest} />;
}

export function ComplianceBadge({
  status,
  official = true,
  faltaEnPlano,
  conSupuesto,
  ...rest
}: {
  status: ComplianceStatus;
  official?: boolean;
  /** NO_CUMPLE de contenido del plano: «No cumple · falta en el plano». */
  faltaEnPlano?: boolean;
  /** NO_CUMPLE que descansa en un supuesto: «No cumple · con supuesto». */
  conSupuesto?: boolean;
} & Omit<ToneBadgeProps, "meta" | "srSuffix">) {
  return <ToneBadge meta={metaDeResultado(status, faltaEnPlano, conSupuesto)} srSuffix={official ? undefined : "resultado indicativo, no oficial"} {...rest} />;
}

/** Icono de estado compacto con etiqueta accesible (listas densas). */
export function ComplianceIcon({ status, className }: { status: ComplianceStatus; className?: string }) {
  const meta = complianceMeta[status];
  const Icon = meta.icon;
  return <Icon role="img" aria-label={meta.label} className={cn("size-4 shrink-0", toneClasses[meta.tone].text, className)} />;
}
