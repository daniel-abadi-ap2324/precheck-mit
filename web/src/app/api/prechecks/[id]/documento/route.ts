import { readFile } from "node:fs/promises";
import { esIdPreCheck, leerEstadoPreCheck } from "@/server/prechecks/almacen";
import { pdfOriginal } from "@/server/prechecks/traducir";
import { error, sinSesion } from "@/server/planos/respuestas";

/** PDF original del plano evaluado en el PreCheck. Se abre en otra pestaña (no se incrusta: CSP). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  const estado = esIdPreCheck(id) ? await leerEstadoPreCheck(id).catch(() => null) : null;
  const ruta = estado ? await pdfOriginal(estado) : null;
  const contenido = ruta ? await readFile(/* turbopackIgnore: true */ ruta).catch(() => null) : null;
  if (!estado || !contenido) return error(404, "precheck.documento_inexistente", "El PDF original del plano no está disponible.");
  const nombre = estado.datos.nombreProyecto.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 80) || "plano";
  return new Response(new Uint8Array(contenido), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`${nombre}.pdf`)}`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
