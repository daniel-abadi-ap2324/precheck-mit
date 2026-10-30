import type { ComplianceStatus } from "@/types";

/**
 * Marcador: una conclusión de una revisión que el usuario guardó porque le pareció interesante o equivocada
 * (ADR-0015). Apunta a una regla de un PreCheck o, con `ruleId` null, a la conclusión del dictamen entero.
 */
export type TipoMarcador = "interesante" | "equivocada";

export const MAX_NOTA_MARCADOR = 500;
export const MAX_EXTRACTO = 400;
export const MAX_CONCLUSION = 600;

/** Lo que el usuario vio al guardarlo: la revisión puede volver a correr y cambiar, el marcador conserva esto. */
export interface FotoMarcador {
  proyecto: string;
  plano: string;
  modelo: string | null;
  ronda: number | null;
  repeticion: number | null;
  regla: {
    titulo: string;
    estado: ComplianceStatus;
    faltaEnPlano?: boolean;
    /** Decisión de la IA (estado del dictamen) y su justificación, recortadas. */
    decision?: string;
    justificacion?: string;
  } | null;
  /** Solo en los marcadores de la conclusión entera. */
  conclusion?: string;
}

export interface Marcador {
  id: string;
  projectId: string;
  /** null en los expedientes, que no tienen PreCheck de la web. */
  precheckId: string | null;
  /** null: la conclusión del dictamen entero. */
  ruleId: string | null;
  tipo: TipoMarcador;
  nota: string;
  createdAt: string;
  updatedAt: string;
  foto: FotoMarcador;
}

/** Lo que manda el cliente al guardar; el id y las fechas los pone el servidor. */
export type EntradaMarcador = Pick<Marcador, "projectId" | "precheckId" | "ruleId" | "tipo" | "foto"> & { nota?: string };
export type CambiosMarcador = { tipo?: TipoMarcador; nota?: string };
