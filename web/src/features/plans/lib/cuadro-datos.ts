import { DATOS_DECLARABLES, errorDatoDeclarado } from "@/lib/datos-declarados";
import { leerNumero } from "./datos-motor";

/** Lo escrito en el cuadro de datos, por clave (texto tal cual, para no perder lo que la persona teclea). */
export type TextosCuadro = Record<string, string>;

/** Los números listos para enviar y, por campo, el error de lo que no se pudo leer o no es razonable. */
export function leerCuadro(textos: TextosCuadro | undefined): { datos: Record<string, number>; errores: Record<string, string> } {
  const datos: Record<string, number> = {};
  const errores: Record<string, string> = {};
  for (const d of DATOS_DECLARABLES) {
    const t = textos?.[d.clave]?.trim();
    if (!t) continue;
    const n = leerNumero(t);
    const e = n === null ? `${d.etiqueta}: escriba un número, por ejemplo 2,5.` : errorDatoDeclarado(d.clave, n);
    if (e) errores[d.clave] = e;
    else datos[d.clave] = n as number;
  }
  return { datos, errores };
}

/** Al revés: los datos declarados de un PreCheck anterior como textos del cuadro. */
export function textosDe(datos: Record<string, number> | undefined): TextosCuadro {
  return Object.fromEntries(Object.entries(datos ?? {}).map(([k, v]) => [k, String(v)]));
}

/** «Corrija en el cuadro de datos: Retiro lateral: no puede ser negativo.» */
export const mensajeErroresCuadro = (errores: Record<string, string>) => {
  const lista = Object.values(errores);
  return lista.length ? `Corrija el cuadro de datos del anteproyecto: ${lista.join(" ")}` : null;
};
