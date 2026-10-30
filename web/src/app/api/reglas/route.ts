import { leerCatalogo } from "@/server/reglas/almacen";

/** Catálogo real de reglas del motor (reglas/*.json) traducido al tipo ComplianceRule. El proxy exige la sesión. */
export async function GET() {
  const items = await leerCatalogo();
  return Response.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}
