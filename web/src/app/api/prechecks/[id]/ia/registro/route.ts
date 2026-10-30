import { leerRegistro, type FormatoRegistro } from "@/server/ia/registro";
import { esIdPreCheck } from "@/server/prechecks/almacen";
import { error, sinSesion } from "@/server/planos/respuestas";

/**
 * Registro de la revisión con IA: ?formato=txt (legible, por defecto) o jsonl (eventos crudos). Con ?descargar=1 se
 * entrega como archivo. Contiene datos del expediente: solo detrás de la sesión.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  if (!esIdPreCheck(id)) return error(404, "precheck.inexistente", "El PreCheck no existe.");
  const url = new URL(request.url);
  const formato: FormatoRegistro = url.searchParams.get("formato") === "jsonl" ? "jsonl" : "txt";
  const texto = await leerRegistro(id, formato, url.searchParams.get("descargar") ? 50 * 1024 * 1024 : undefined);
  if (texto === null) return error(404, "ia.sin_registro", "Todavía no hay registro de la revisión con IA.");
  return new Response(texto, {
    headers: {
      "Content-Type": formato === "jsonl" ? "application/x-ndjson; charset=utf-8" : "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      ...(url.searchParams.get("descargar") ? { "Content-Disposition": `attachment; filename="${id}-ia.log.${formato}"` } : {}),
    },
  });
}
