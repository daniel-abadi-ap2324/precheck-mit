/**
 * Destino tras el login: solo una ruta de esta aplicación. «//otro.sitio» y «/\otro.sitio» empiezan con «/»,
 * pero el navegador los resuelve como otro dominio (redirección abierta).
 */
export function rutaInterna(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  try {
    const url = new URL(next, "http://interno.invalid");
    return url.origin === "http://interno.invalid" ? next : null;
  } catch {
    return null;
  }
}

/** Enlace a una hoja del Documento Gráfico: solo https de la DPU (el dato viene del GeoJSON o de la API). */
export function pdfDeLaDpu(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "dpu.mupa.gob.pa" ? u.href : null;
  } catch {
    return null;
  }
}
