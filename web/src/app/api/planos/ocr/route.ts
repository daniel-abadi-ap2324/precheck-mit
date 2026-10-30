import { disponibilidadOcr } from "@/server/planos/ocr-disponible";

/** Qué lectores OCR se pueden usar en este equipo y, de los que no, qué falta (server/planos/ocr-disponible.ts). */
export async function GET() {
  return Response.json(await disponibilidadOcr());
}
