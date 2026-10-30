import { escribirEstado, esPdf, esRolDocumento, guardarPlano } from "@/server/planos/almacen";
import { esLectorOcr } from "@/lib/lector-ocr";
import { encolarExtraccion } from "@/server/planos/procesar";
import { MAX_BYTES, error, sinSesion } from "@/server/planos/respuestas";

/** Carga un plano PDF y lo encola para leerlo (texto del PDF u OCR). Responde 202 con su id y estado. */
export async function POST(request: Request) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const largo = Number(request.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES + 1024 * 1024) return error(413, "plano.tamano", "El archivo supera los 200 MB.");
  const form = await request.formData().catch(() => null);
  const archivo = form?.get("file");
  const ocr = form?.get("ocr");
  const rol = form?.get("rol");
  // Por forma y no con instanceof: el File de formData() puede ser de otra implementación que el File global.
  if (!archivo || typeof archivo === "string" || typeof archivo.arrayBuffer !== "function") {
    return error(400, "plano.sin_archivo", "No se recibió ningún archivo.");
  }
  if (archivo.size > MAX_BYTES) return error(413, "plano.tamano", "El archivo supera los 200 MB.");
  const contenido = Buffer.from(await archivo.arrayBuffer());
  if (!esPdf(contenido)) return error(415, "plano.formato", "El archivo no es un PDF válido.");
  const id = await guardarPlano(contenido, archivo.name.slice(0, 200));
  if (esLectorOcr(ocr) || esRolDocumento(rol)) await escribirEstado(id, { ...(esLectorOcr(ocr) ? { ocr } : {}), ...(esRolDocumento(rol) ? { rol } : {}) });
  encolarExtraccion(id);
  return Response.json({ id, status: "queued", fileName: archivo.name.slice(0, 200), sizeBytes: contenido.length, updatedAt: new Date().toISOString() }, { status: 202 });
}
