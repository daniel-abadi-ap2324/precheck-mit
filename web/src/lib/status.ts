import {
  CircleCheck,
  CircleX,
  CircleDashed,
  TriangleAlert,
  CircleHelp,
  MinusCircle,
  Info,
  LoaderCircle,
  FilePen,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import type { ComplianceStatus, ProjectStatus } from "@/types";

/** Estado semántico: siempre icono + color + texto (nunca solo color). */
export type Tone = "pass" | "fail" | "warning" | "info" | "manual" | "processing" | "neutral" | "supuesto";

export interface StatusMeta {
  label: string;
  tone: Tone;
  icon: LucideIcon;
  /** Término del motor al que corresponde (CONTEXT.md). */
  engineTerm?: string;
}

export const complianceMeta: Record<ComplianceStatus, StatusMeta> = {
  PASS: { label: "Cumple", tone: "pass", icon: CircleCheck, engineTerm: "CUMPLE" },
  FAIL: { label: "No cumple", tone: "fail", icon: CircleX, engineTerm: "NO_CUMPLE (bloqueante)" },
  WARNING: { label: "Observación", tone: "warning", icon: TriangleAlert, engineTerm: "NO_CUMPLE (observación)" },
  MANUAL_REVIEW: { label: "Requiere revisión", tone: "manual", icon: CircleHelp, engineTerm: "REQUIERE_REVISION" },
  NOT_APPLICABLE: { label: "No aplica", tone: "neutral", icon: MinusCircle, engineTerm: "NO_APLICA" },
};

/** «No cumple» de un requisito de contenido del plano: mismo tono (bloquea el registro), se subsana completando el plano. */
export const faltaEnPlanoMeta: StatusMeta = { ...complianceMeta.FAIL, label: "No cumple · falta en el plano", engineTerm: "NO_CUMPLE (bloqueante, documental)" };

/**
 * «No cumple» que descansa en un supuesto de la corrida (zona de trabajo supuesta, dato dudoso; ADR-0016): tono propio,
 * porque está por confirmar y cuenta como pendiente, no como falla firme.
 */
export const conSupuestoMeta: StatusMeta = { label: "No cumple · con supuesto", tone: "supuesto", icon: CircleDashed, engineTerm: "NO_CUMPLE (con supuesto)" };

/** Meta de un resultado: la de su estado, la de «con supuesto» o la de «falta en el plano» si es un NO_CUMPLE documental. */
export const metaDeResultado = (status: ComplianceStatus, faltaEnPlano?: boolean, conSupuesto?: boolean): StatusMeta =>
  status === "FAIL" && conSupuesto ? conSupuestoMeta : status === "FAIL" && faltaEnPlano ? faltaEnPlanoMeta : complianceMeta[status];

export const projectStatusMeta: Record<ProjectStatus, StatusMeta> = {
  DRAFT: { label: "Borrador", tone: "neutral", icon: FilePen },
  PROCESSING: { label: "Procesando", tone: "processing", icon: LoaderCircle },
  REVIEW_REQUIRED: { label: "Pendiente de revisión DOYC", tone: "manual", icon: CircleHelp },
  /** PreCheck terminado, no «aprobado»: tono informativo y un icono distinto del de «Cumple». */
  COMPLETED: { label: "Revisión cerrada", tone: "info", icon: ClipboardList },
  FAILED: { label: "Error al procesar", tone: "fail", icon: CircleX },
};

export const infoMeta: StatusMeta = { label: "Información", tone: "info", icon: Info };

export const toneClasses: Record<Tone, { text: string; bg: string; border: string; fill: string }> = {
  pass: { text: "text-pass", bg: "bg-pass-soft", border: "border-pass/30", fill: "bg-pass" },
  fail: { text: "text-fail", bg: "bg-fail-soft", border: "border-fail/30", fill: "bg-fail" },
  warning: { text: "text-warning", bg: "bg-warning-soft", border: "border-warning/30", fill: "bg-warning" },
  info: { text: "text-info", bg: "bg-info-soft", border: "border-info/30", fill: "bg-info" },
  manual: { text: "text-manual", bg: "bg-manual-soft", border: "border-manual/30", fill: "bg-manual" },
  processing: { text: "text-processing", bg: "bg-processing-soft", border: "border-processing/30", fill: "bg-processing" },
  neutral: { text: "text-ink-muted", bg: "bg-muted", border: "border-line", fill: "bg-ink-muted" },
  supuesto: { text: "text-supuesto", bg: "bg-supuesto-soft", border: "border-supuesto/30 border-dashed", fill: "bg-supuesto" },
};

export const categoryLabels: Record<import("@/types").RuleCategory, string> = {
  site: "Lote",
  zoning: "Zonificación",
  setbacks: "Retiros",
  height: "Altura",
  coverage: "Ocupación",
  density: "Densidad",
  parking: "Estacionamientos",
  accessibility: "Accesibilidad",
  landscaping: "Áreas verdes",
  other: "Otros",
};
