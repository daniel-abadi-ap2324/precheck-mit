const nf = new Intl.NumberFormat("es-PA", { maximumFractionDigits: 2 });
const df = new Intl.DateTimeFormat("es-PA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Panama" });

export const formatNumber = (n: number): string => nf.format(n);

export function formatMeasure(value: number | undefined, unit?: string): string {
  if (value === undefined) return "—";
  return unit ? `${nf.format(value)} ${unit === "m2" ? "m²" : unit}` : nf.format(value);
}

export function formatSigned(value: number | undefined, unit?: string): string {
  if (value === undefined) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatMeasure(Math.abs(value), unit)}`;
}

export const formatDate = (iso: string): string => df.format(new Date(iso));

const dayFmt = new Intl.DateTimeFormat("es-PA", { dateStyle: "medium", timeZone: "UTC" });
/** Fecha sin hora («2026-09-30»): se formatea en UTC para no correrla un día por la zona horaria. Otro texto, tal cual. */
export function formatDay(fecha: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? dayFmt.format(new Date(`${fecha}T00:00:00Z`)) : fecha;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${nf.format(bytes / 1024)} KB`;
  return `${nf.format(bytes / 1024 ** 2)} MB`;
}
