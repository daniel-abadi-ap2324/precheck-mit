import type { Zoning } from "@/types";

export interface ZoneField {
  label: string;
  value: string;
}

const NOT_IN_FICHA = "No definido en la ficha";

/** Campos de la ficha en el orden del Anexo 4. Los vacíos se dicen, no se inventan. */
export function zoneFields(z: Zoning): ZoneField[] {
  return [
    { label: "Código", value: z.code },
    { label: "Nombre", value: z.name },
    { label: "Densidad máxima", value: z.maxDensity ?? NOT_IN_FICHA },
    { label: "Área mínima de lote", value: z.minLotArea ?? NOT_IN_FICHA },
    { label: "Frente mínimo", value: z.minFront ?? NOT_IN_FICHA },
    { label: "Ocupación máxima", value: z.maxCoverage ?? NOT_IN_FICHA },
    { label: "Altura máxima", value: z.maxHeight ?? NOT_IN_FICHA },
    { label: "Pisos máximos", value: z.maxFloors !== undefined ? String(z.maxFloors) : NOT_IN_FICHA },
    { label: "Acera mínima", value: z.minSidewalk ?? NOT_IN_FICHA },
    { label: "Retiros", value: z.setbacks ?? "Según ficha" },
    { label: "Norma", value: z.norma },
    { label: "Página de la fuente", value: `pág. ${z.sourcePage}` },
  ];
}

/** Acepta el código con el prefijo de clase de suelo del Documento Gráfico: «1RM-2» busca la ficha RM-2. */
export function normalizeZoneQuery(q: string): string {
  const s = q.trim().toLowerCase();
  return /^1[a-z]/.test(s) ? s.slice(1) : s;
}

export function filterZonings(list: Zoning[], q: string): Zoning[] {
  const s = normalizeZoneQuery(q);
  if (!s) return list;
  return list.filter((z) => `${z.code} ${z.name}`.toLowerCase().includes(s));
}
