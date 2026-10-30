/**
 * Distancias que el profesional debe acotar en el plano para que la revisión con IA las lea en vez de medirlas a
 * escala (medir a escala es la principal fuente de error y de variación entre corridas). `claves` son los datos del
 * contrato (`scripts/hechos_documentales.json` y `scripts/datos_universales.json`) que usan las reglas; vacío cuando
 * la medida aún no es un dato del contrato, pero la DOYC la revisa en el plano.
 */
export interface CotaADeclarar {
  etiqueta: string;
  claves: readonly string[];
}

export const COTAS_A_DECLARAR: readonly CotaADeclarar[] = [
  { etiqueta: "Frente del lote, fondo y área del lote (m²)", claves: ["lote.frente_m", "lote.largo_promedio_m", "lote.area_m2"] },
  { etiqueta: "Línea de construcción", claves: ["lote.linea_construccion_m"] },
  { etiqueta: "Retiro frontal, retiros laterales y retiro posterior, medidos hasta la pared", claves: ["proyecto.retiro_frontal_m", "proyecto.retiro_lateral_m", "proyecto.retiro_posterior_m"] },
  { etiqueta: "Altura total de la edificación y número de pisos", claves: ["proyecto.altura_m", "proyecto.pisos_totales"] },
  { etiqueta: "Altura de piso a piso (entre losas)", claves: ["proyecto.altura_entre_losas_max_m"] },
  { etiqueta: "Ancho de la acera existente y de la proyectada", claves: ["lote.acera_existente_ancho_m", "proyecto.acera_ancho_m"] },
  { etiqueta: "Ancho de la vía o servidumbre frente al lote", claves: [] },
  { etiqueta: "Rotura de cordón: ancho de cada acceso vehicular y cantidad de accesos", claves: ["acceso_vehicular.rotura_cordon_m", "acceso_vehicular.cantidad"] },
  { etiqueta: "Ancho y pendiente de las rampas", claves: ["rampa.ancho_m", "rampa.pendiente_pct_indicada"] },
  { etiqueta: "Cantidad de estacionamientos, incluidos los de visita", claves: ["proyecto.estacionamientos", "proyecto.estacionamientos_visita"] },
  { etiqueta: "Medidas de los estacionamientos y ancho de los pasillos de circulación", claves: [] },
  { etiqueta: "Áreas de ocupación, libre y verde (m² y %)", claves: ["proyecto.ocupacion_pct", "proyecto.area_libre_pct", "proyecto.area_verde_pct"] },
  { etiqueta: "Distancia a los colindantes y a las edificaciones existentes", claves: ["proyecto.distancia_edificacion_existente_m"] },
  { etiqueta: "En un edificio existente, qué retiros y aberturas son existentes y cuáles nuevos", claves: ["proyecto.obra_nueva"] },
];
