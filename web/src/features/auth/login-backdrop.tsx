/** Panel oscuro con trazado urbano y lámina de plano, en el lenguaje visual de la Alcaldía. */
export function LoginBackdrop() {
  return (
    <div aria-hidden className="relative m-4 hidden overflow-hidden rounded-3xl bg-navy lg:block">
      <svg className="absolute inset-0 size-full" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice">
        <g fill="none" stroke="var(--mp-on-brand)" strokeOpacity="0.07" strokeWidth="1.2">
          <path d="M0 120 L260 180 L420 90 L800 170" />
          <path d="M0 330 L180 300 L330 380 L560 330 L800 400" />
          <path d="M0 560 L240 600 L470 540 L800 620" />
          <path d="M120 0 L160 260 L110 520 L170 800" />
          <path d="M420 0 L380 300 L450 560 L400 800" />
          <path d="M660 0 L700 240 L640 520 L700 800" />
        </g>
        <path d="M0 470 C140 440 220 520 330 470 S520 390 620 450 800 430 800 430" fill="none" stroke="var(--mp-brand)" strokeOpacity="0.55" strokeWidth="3" />
        <g transform="translate(250 190)">
          <rect width="300" height="400" rx="6" fill="var(--mp-on-brand)" fillOpacity="0.04" stroke="var(--mp-on-brand)" strokeOpacity="0.35" strokeDasharray="10 6" />
          <rect x="40" y="90" width="220" height="250" rx="2" fill="var(--mp-brand)" fillOpacity="0.18" stroke="var(--mp-on-brand)" strokeOpacity="0.8" strokeWidth="2" />
          <g stroke="var(--mp-brand-accent)" strokeWidth="2" fill="var(--mp-brand-accent)">
            <path d="M150 340v60M142 340h16M142 400h16" />
            <text x="164" y="378" fontSize="18" stroke="none" fontFamily="inherit">4.25 m</text>
          </g>
          <text x="0" y="-18" fontSize="15" fill="var(--mp-on-brand)" fillOpacity="0.7" fontFamily="inherit">Finca 083076 · Zona RM-2 · 960 m²</text>
        </g>
      </svg>
      <div className="absolute bottom-8 left-8 max-w-sm text-white">
        <p className="text-2xl font-bold leading-tight">Revisión de planos más clara y trazable</p>
        <p className="mt-2 text-sm text-white/70">Cada observación con su norma, su dato y su cita.</p>
      </div>
    </div>
  );
}
