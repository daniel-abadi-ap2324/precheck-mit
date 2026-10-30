import type { DashboardMetrics } from "./compute-dashboard-metrics";

/** Saludo según la hora de Panamá. */
export function greetingFor(date: Date): string {
  const hour = Number(new Intl.DateTimeFormat("es-PA", { hour: "numeric", hourCycle: "h23", timeZone: "America/Panama" }).format(date));
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Una línea con lo pendiente, en orden de urgencia. */
export function pendingSummary(m: DashboardMetrics): string {
  const parts: string[] = [];
  if (m.inReview) parts.push(`${plural(m.inReview, "proyecto requiere", "proyectos requieren")} revisión`);
  if (m.byStatus.PROCESSING) parts.push(`${plural(m.byStatus.PROCESSING, "PreCheck está", "PreChecks están")} en proceso`);
  if (m.byStatus.FAILED) parts.push(`${plural(m.byStatus.FAILED, "PreCheck falló", "PreChecks fallaron")}`);
  if (m.byStatus.DRAFT) parts.push(`${plural(m.byStatus.DRAFT, "borrador", "borradores")} sin enviar`);
  return parts.length ? `${parts.join(" · ")}.` : "No hay trabajo pendiente.";
}
