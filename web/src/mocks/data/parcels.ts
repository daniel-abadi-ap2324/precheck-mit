import type { Parcel } from "@/types";
import parcelsJson from "./parcels.json";

/**
 * Parcelas de DEMOSTRACIÓN (scripts/preparar-zonificacion.py). La geometría del lote es sintética y no
 * corresponde al catastro de la ANATI, pero está colocada dentro del polígono real 1RM-2 de la hoja 10-3B
 * del Documento Gráfico, en el corregimiento de Betania: zoningCode y zoningSource salen de la zona real
 * bajo cada lote y el corregimiento, del polígono capa distrito8v4 que contiene su centroide.
 */
export const parcels: Parcel[] = parcelsJson as unknown as Parcel[];

/** La parcela del proyecto de demostración: 24 × 40 m = 960 m², zona RM-2. */
export const DEMO_PARCEL_ID = "PAR-081400";
