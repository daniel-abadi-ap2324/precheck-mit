import type { ComplianceRule } from "@/types";

/**
 * Catálogo real de reglas (GET /api/reglas). Se carga una vez por sesión; si falla, devuelve null (y se vuelve a
 * intentar en la próxima llamada) para que quien llama use su respaldo.
 */
let pendiente: Promise<ComplianceRule[] | null> | null = null;

export function catalogoDeReglas(): Promise<ComplianceRule[] | null> {
  if (!pendiente) {
    pendiente = fetch("/api/reglas")
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { items?: unknown } | null;
        if (!res.ok || !Array.isArray(body?.items) || body.items.length === 0) throw new Error("catálogo no disponible");
        return body.items as ComplianceRule[];
      })
      .catch(() => {
        pendiente = null;
        return null;
      });
  }
  return pendiente;
}

/** Solo para pruebas: olvida el catálogo cargado. */
export const olvidarCatalogo = () => {
  pendiente = null;
};
