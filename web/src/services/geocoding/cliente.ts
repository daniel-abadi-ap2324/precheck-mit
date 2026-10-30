import type { AddressMatch } from "@/types";

/** Direcciones desde la ruta propia /api/geocodificar (el servidor consulta el geocodificador). */
export async function geocodeViaApi(q: string): Promise<AddressMatch[]> {
  const res = await fetch(`/api/geocodificar?${new URLSearchParams({ q })}`);
  const body = (await res.json().catch(() => null)) as { items?: AddressMatch[]; code?: string } | null;
  if (!res.ok || !body?.items) throw new Error(body?.code ?? `geocodificar respondió ${res.status}`);
  return body.items;
}
