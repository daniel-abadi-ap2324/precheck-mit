/**
 * Icono de la Dirección de Obras y Construcciones: grúa torre sobre un edificio, con el visto del
 * PreCheck. Trazo en el estilo de los productos digitales de la Alcaldía de Panamá. Es propio y no
 * reproduce el escudo oficial.
 */
export function BrandIcon({ className = "size-8", tone = "solid" }: { className?: string; tone?: "solid" | "line" }) {
  const ink = tone === "solid" ? "var(--mp-on-brand)" : "var(--mp-brand)";
  return (
    <svg viewBox="0 0 32 32" className={`shrink-0 ${className}`} aria-hidden>
      {tone === "solid" ? <rect width="32" height="32" rx="9" fill="var(--mp-brand)" /> : null}
      <g stroke={ink} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 26V9.5M11 26V9.5M8.5 13.5l2.5 2.5M11 13.5l-2.5 2.5M8.5 19l2.5 2.5M11 19l-2.5 2.5" />
        <path d="M5.5 9.5h21M9.75 9.5V6.5M9.75 6.5 5.5 9.5M9.75 6.5 22 9.5" />
        <path d="M21.5 9.5v4M20.3 13.5h2.4v1.6h-2.4z" />
        <path d="M14.5 26v-8h6v8M16.3 20.4h2.4M16.3 23h2.4M5.5 26h13" />
      </g>
      <rect x="5" y="8.6" width="2.2" height="2.2" rx="0.4" fill={ink} />
      <circle cx="24.3" cy="23.3" r="4.3" fill="var(--mp-brand-accent)" />
      <path d="m22.4 23.4 1.3 1.3 2.4-2.6" stroke="var(--mp-on-brand)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
