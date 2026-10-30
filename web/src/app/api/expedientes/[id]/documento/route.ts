import { readFile } from "node:fs/promises";
import { buscarExpediente } from "@/server/expedientes/almacen";
import { buscarEjemplo } from "@/server/planos/ejemplos";
import { error, sinSesion } from "@/server/planos/respuestas";

/**
 * PDF original del expediente: el anteproyecto de la carpeta de planos de ejemplo (PLANOS_EJEMPLO_DIR) cuyo nombre
 * coincide exactamente con el documento que revisó el agente. Se abre en otra pestaña (no se incrusta: CSP).
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  const expediente = await buscarExpediente(id);
  const pdf = await buscarEjemplo(expediente?.project.expediente?.documento);
  const contenido = pdf ? await readFile(/* turbopackIgnore: true */ pdf.ruta).catch(() => null) : null;
  if (!pdf || !contenido) return error(404, "expediente.documento_inexistente", "El PDF original del expediente no está disponible.");
  return new Response(new Uint8Array(contenido), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(pdf.nombre)}`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
