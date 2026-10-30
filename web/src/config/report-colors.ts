/**
 * Paleta del informe HTML autocontenido. El documento se descarga y se abre sin la hoja de estilos
 * de la app, así que no puede usar var(--mp-*): lleva los valores literales, en este único lugar.
 * Cada color es copia de su token de src/styles/tokens.css (lo verifica report-colors.test.ts).
 */
export const reportColorTokens = {
  ink: "--mp-ink",
  inkMuted: "--mp-ink-muted",
  line: "--mp-line",
  note: "--mp-info",
  noteSoft: "--mp-info-soft",
  alert: "--mp-fail",
} as const;

export const reportColors: Record<keyof typeof reportColorTokens, string> = {
  ink: "#1a1a1a",
  inkMuted: "#5b6472",
  line: "#e5e7eb",
  note: "#0046ef",
  noteSoft: "#e8eefe",
  alert: "#d4183d",
};
