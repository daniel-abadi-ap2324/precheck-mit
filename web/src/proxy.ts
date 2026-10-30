import { NextResponse, type NextRequest } from "next/server";

/**
 * Protege la aplicación con la sesión de demostración (cookie mp_session). Una ruta /api/* sin sesión responde
 * 401 JSON: una redirección a /login devolvería HTML a quien espera JSON.
 *
 * RIESGO DE DESPLIEGUE: solo se comprueba que la cookie exista. Antes de producción hay que validar un token
 * firmado emitido por el servidor (HttpOnly, Secure) o consultar al backend.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("mp_session")?.value);
  if (!hasSession && pathname.startsWith("/api/")) {
    return NextResponse.json({ code: "auth.sin_sesion", message: "Inicie sesión para continuar." }, { status: 401 });
  }
  if (!hasSession && pathname !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Solo se excluyen los estáticos por su carpeta, nunca por extensión: «/projects/abc.json» es una ruta de la app.
  // La carga de planos (POST /api/planos) tampoco pasa por aquí: el proxy trunca el cuerpo en 10 MB; la ruta
  // verifica la sesión ella misma (server/planos/respuestas.ts).
  matcher: ["/((?!_next/static/|_next/image/|data/|maplibre/|api/planos$|favicon\\.ico$|icon\\.svg$).*)"],
};
