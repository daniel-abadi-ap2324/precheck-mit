import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad. La CSP permite solo lo que la aplicación usa: el propio origen, el mapa base de
 * OpenFreeMap y el worker de MapLibre (blob:). Los PDF de la DPU se abren como enlaces, no se incrustan.
 */
const CSP = [
  "default-src 'self'",
  // Next inyecta scripts en línea para la hidratación; MapLibre necesita 'wasm-unsafe-eval' en algunos navegadores.
  // En desarrollo React usa eval() para reconstruir las pilas de llamadas; en producción no se permite.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tiles.openfreemap.org",
  "font-src 'self' data: https://tiles.openfreemap.org",
  "connect-src 'self' https://tiles.openfreemap.org",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
