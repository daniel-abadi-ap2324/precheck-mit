import { geocodePhoton } from "@/services/geocoding/photon";

/**
 * Direcciones dentro del distrito. El navegador no llama a Photon: la consulta sale desde el servidor, detrás
 * de la sesión (proxy.ts). Mismo contrato que tendrá la API: GET /gis/geocodificar?q=.
 */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 120) {
    return Response.json({ code: "gis.consulta_invalida", message: "Escriba entre 2 y 120 caracteres." }, { status: 400 });
  }
  try {
    const items = await geocodePhoton(q);
    return Response.json({ items }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch {
    return Response.json(
      { code: "gis.geocodificador_no_disponible", message: "La búsqueda de direcciones no respondió." },
      { status: 502 },
    );
  }
}
