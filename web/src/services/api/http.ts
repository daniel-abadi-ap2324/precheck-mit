import type { ApiClient } from "./contract";
import { ApiError } from "./contract";

/**
 * Cliente HTTP hacia FastAPI (pendiente). Cada método corresponde a una fila de plan.md §7.
 * Mientras no exista el backend, lanza un error explícito en lugar de devolver datos falsos.
 *
 * Rutas previstas para el GIS (PostGIS detrás de FastAPI):
 *   getGisLayer({ layer })  GET /gis/capas/{layer}               (district, corregimientos, rivers, ocean, sheets…)
 *   getZoningIndex()        GET /gis/zonificacion/hojas            (índice de hojas vectorizadas)
 *   getZoningSheet(hoja)    GET /gis/zonificacion/hojas/{hoja}     (FeatureCollection de la hoja)
 *   geocodeAddress(q)       GET /gis/geocodificar?q=               (direcciones dentro del distrito)
 *   declareParcel(input)    POST /lotes/declarados                  (lote dibujado por el profesional)
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function notYet(op: string): never {
  throw new ApiError("api.no_disponible", `La API ${BASE} todavía no implementa ${op}.`);
}

export const httpClient: ApiClient = new Proxy({} as ApiClient, {
  get: (_target, prop: string) => () => notYet(prop),
});
