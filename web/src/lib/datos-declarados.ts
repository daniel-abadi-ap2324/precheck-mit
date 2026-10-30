/**
 * Paso 0 del flujo: datos del anteproyecto que el usuario declara en el «cuadro de datos» antes de ejecutar (lo que
 * hoy se mide a escala en el dibujo). Van a lote.json con procedencia «declarado» y confianza 1; el motor los hace
 * prevalecer sobre la lectura del plano y la revisión los contrasta con el dibujo (regiones). La clave es la ruta del
 * hecho en el motor (prerrequisitos D-01…D-26). Sin dependencias de Node ni de React: lo usan el servidor y la web.
 */
export type GrupoDeclarado = "lote" | "retiros" | "alturas" | "intensidad" | "estacionamientos" | "acera";

export interface DatoDeclarable {
  clave: string;
  etiqueta: string;
  unidad?: string;
  grupo: GrupoDeclarado;
  /** Valor máximo razonable (los porcentajes, 100). */
  max: number;
  /** Cuenta de cosas (pisos, unidades, estacionamientos): sin decimales. */
  entero?: boolean;
  /** Una medida que no puede ser 0 (el área o el frente del lote). Un retiro sí puede ser 0 (adosado). */
  positivo?: boolean;
}

export const GRUPOS_DECLARADOS: { grupo: GrupoDeclarado; titulo: string }[] = [
  { grupo: "lote", titulo: "Lote" },
  { grupo: "retiros", titulo: "Retiros" },
  { grupo: "alturas", titulo: "Alturas" },
  { grupo: "intensidad", titulo: "Intensidad de uso" },
  { grupo: "estacionamientos", titulo: "Estacionamientos y accesos" },
  { grupo: "acera", titulo: "Acera" },
];

export const DATOS_DECLARABLES: DatoDeclarable[] = [
  { clave: "lote.area_m2", etiqueta: "Área del lote", unidad: "m²", grupo: "lote", max: 5_000_000, positivo: true },
  { clave: "lote.frente_m", etiqueta: "Frente del lote", unidad: "m", grupo: "lote", max: 5_000, positivo: true },
  { clave: "lote.fondo_m", etiqueta: "Fondo del lote", unidad: "m", grupo: "lote", max: 5_000, positivo: true },
  { clave: "lote.linea_construccion_m", etiqueta: "Línea de construcción (desde el eje de la vía)", unidad: "m", grupo: "lote", max: 200 },
  { clave: "proyecto.retiro_frontal_m", etiqueta: "Retiro frontal", unidad: "m", grupo: "retiros", max: 200 },
  { clave: "proyecto.retiro_lateral_m", etiqueta: "Retiro lateral", unidad: "m", grupo: "retiros", max: 200 },
  { clave: "proyecto.retiro_posterior_m", etiqueta: "Retiro posterior", unidad: "m", grupo: "retiros", max: 200 },
  { clave: "proyecto.altura_m", etiqueta: "Altura de la edificación", unidad: "m", grupo: "alturas", max: 400, positivo: true },
  { clave: "proyecto.pisos_totales", etiqueta: "Pisos", grupo: "alturas", max: 120, entero: true, positivo: true },
  { clave: "proyecto.unidades_vivienda", etiqueta: "Unidades de vivienda", grupo: "intensidad", max: 10_000, entero: true },
  { clave: "proyecto.densidad_pers_ha", etiqueta: "Densidad", unidad: "pers/ha", grupo: "intensidad", max: 20_000 },
  { clave: "proyecto.ocupacion_pct", etiqueta: "Ocupación", unidad: "%", grupo: "intensidad", max: 100 },
  { clave: "proyecto.area_libre_pct", etiqueta: "Área libre", unidad: "%", grupo: "intensidad", max: 100 },
  { clave: "proyecto.area_verde_pct", etiqueta: "Área verde", unidad: "%", grupo: "intensidad", max: 100 },
  { clave: "proyecto.estacionamientos", etiqueta: "Estacionamientos", grupo: "estacionamientos", max: 10_000, entero: true },
  { clave: "proyecto.estacionamientos_visita", etiqueta: "Estacionamientos de visita", grupo: "estacionamientos", max: 2_000, entero: true },
  { clave: "acceso_vehicular.cantidad", etiqueta: "Accesos vehiculares", grupo: "estacionamientos", max: 50, entero: true },
  { clave: "acceso_vehicular.rotura_cordon_m", etiqueta: "Rotura de cordón", unidad: "m", grupo: "estacionamientos", max: 100 },
  { clave: "proyecto.acera_ancho_m", etiqueta: "Ancho de acera", unidad: "m", grupo: "acera", max: 30 },
];

const POR_CLAVE = new Map(DATOS_DECLARABLES.map((d) => [d.clave, d]));
export const datoDeclarable = (clave: string) => POR_CLAVE.get(clave);

const conUnidad = (d: DatoDeclarable, n: number) => `${n.toLocaleString("es-PA")}${d.unidad ? ` ${d.unidad}` : ""}`;

/** El mensaje para el usuario si el valor no es razonable para ese dato; null si está bien. */
export function errorDatoDeclarado(clave: string, valor: unknown): string | null {
  const d = POR_CLAVE.get(clave);
  if (!d) return `«${clave.slice(0, 60)}» no es un dato del cuadro.`;
  if (typeof valor !== "number" || !Number.isFinite(valor)) return `${d.etiqueta}: escriba un número.`;
  if (valor < 0) return `${d.etiqueta}: no puede ser negativo.`;
  if (d.positivo && valor === 0) return `${d.etiqueta}: debe ser mayor que 0.`;
  if (d.entero && !Number.isInteger(valor)) return `${d.etiqueta}: escriba un número entero.`;
  if (valor > d.max) return `${d.etiqueta}: no puede pasar de ${conUnidad(d, d.max)}.`;
  return null;
}

/** Valida los datos declarados que llegan del cliente: los limpios (sin vacíos) o el primer error. */
export function validarDatosDeclarados(crudo: unknown): { datos: Record<string, number> | undefined } | { mensaje: string } {
  if (crudo === undefined || crudo === null) return { datos: undefined };
  if (typeof crudo !== "object" || Array.isArray(crudo)) return { mensaje: "El cuadro de datos no es válido." };
  const datos: Record<string, number> = {};
  for (const [clave, valor] of Object.entries(crudo)) {
    if (valor === null || valor === undefined || valor === "") continue;
    const e = errorDatoDeclarado(clave, valor);
    if (e) return { mensaje: e };
    datos[clave] = valor as number;
  }
  return { datos: Object.keys(datos).length ? datos : undefined };
}
