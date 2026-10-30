import type { NormaZona } from "@/types";

/** Valor de un parámetro de zona cuando no hay ficha cargada que corresponda al lote. */
export const PARAMETRO_EN_REVISION = "Requiere revisión";

/** «Zona RM-2», o «Zona por revisar» si el lote no tiene una zona determinada (código vacío). */
export const etiquetaZona = (code: string | null | undefined) => (code ? `Zona ${code}` : "Zona por revisar");

/** Por qué el lote no tiene ficha del Anexo 4 (null si la tiene). Nunca se sustituye por otra ficha. */
export function mensajeSinFicha(norma: NormaZona, code: string): string | null {
  switch (norma) {
    case "ficha":
      return null;
    case "ficha_no_cargada":
      return `La ficha ${code} del PLOT no está cargada: los parámetros de la zona requieren revisión.`;
    case "miviot":
      return `Zona ${code} con norma del MIVIOT, no cargada: los parámetros de la zona requieren revisión.`;
    case "anexo5":
      return `Suelo ${code} del Anexo 5 (matriz de usos), no cargado: los parámetros de la zona requieren revisión.`;
    case "revision":
      return "El lote cae en un polígono sin código único en el Documento Gráfico: la zona requiere revisión.";
  }
}
