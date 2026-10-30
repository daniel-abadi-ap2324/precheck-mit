import { esIdValido } from "./almacen";

/** Tamaño máximo de un plano (el mismo que valida el cliente en schemas/project.ts). */
export const MAX_BYTES = 200 * 1024 * 1024;

export const error = (status: number, code: string, message: string) => Response.json({ code, message }, { status });
export const noEncontrado = () => error(404, "plano.inexistente", "El plano no existe.");

/**
 * La carga (POST /api/planos) no pasa por el proxy, que limita el cuerpo a 10 MB: la sesión se verifica aquí,
 * con la misma regla que proxy.ts (sesión de demostración: basta la cookie).
 */
export function sinSesion(request: Request): Response | null {
  const cookie = request.headers.get("cookie") ?? "";
  return /(?:^|;\s*)mp_session=[^;]+/.test(cookie) ? null : error(401, "auth.sin_sesion", "Inicie sesión para continuar.");
}

export const idValido = (id: string) => esIdValido(id);
