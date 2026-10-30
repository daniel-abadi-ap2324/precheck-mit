/**
 * Paso 1 del flujo: sin finca, área y zona comprobadas no se ejecuta el PreCheck. Un dato está comprobado si la
 * lectura lo dio claro (un solo valor, confianza >= 0.85: texto del PDF o dos lectores OCR que coinciden) o si una
 * persona lo confirmó o corrigió. Solo se le pregunta a la persona lo demás.
 * Son los datos de los que dependen los demás (la escala del dibujo, la ficha de la zona, el Registro Público).
 * La usan el asistente, «Volver a ejecutar» y el servidor (que responde 409 con el mismo mensaje).
 */
export interface HechoRevisable {
  hecho: string;
  valor: string | number | null;
  corregido?: boolean;
  confirmado?: boolean;
  estado?: string;
  confianza?: number;
}

/** Confianza a partir de la cual el motor usa un dato sin revisión (precheck/motor). */
export const UMBRAL_COMPROBADO = 0.85;

/** Confirmado o corregido por la persona, con un valor que el motor pueda usar. */
export const hechoRevisado = (h: HechoRevisable | undefined): boolean =>
  Boolean(h && h.valor !== null && h.valor !== "" && (h.corregido || h.confirmado || (h.estado === "ok" && (h.confianza ?? 0) >= UMBRAL_COMPROBADO)));

/** Lo que falta confirmar o corregir para ejecutar, en palabras del usuario. Vacío = se puede ejecutar. */
export function datosSinConfirmar(hechos: HechoRevisable[], codigoZona?: string | null): string[] {
  const de = (clave: string) => hechos.find((h) => h.hecho === clave);
  const faltan: string[] = [];
  if (!hechoRevisado(de("lote.finca")) && !hechoRevisado(de("lote.fincas"))) faltan.push("la finca");
  if (!hechoRevisado(de("lote.area_m2"))) faltan.push("el área del lote");
  if (!hechoRevisado(de("plano.zonificacion_declarada")) && !codigoZona?.trim()) faltan.push("la zona");
  return faltan;
}

const enumerar = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** «No se pudo comprobar en el plano la finca y el área del lote. Para ejecutar el PreCheck, confírmelo o corríjalo…» */
export const mensajeSinConfirmar = (faltan: string[]) =>
  `No se pudo comprobar en el plano ${enumerar(faltan)}. Para ejecutar el PreCheck, confírmelo o corríjalo en la lectura del plano${faltan.includes("la zona") ? " (o indique el código de zona)" : ""}.`;
