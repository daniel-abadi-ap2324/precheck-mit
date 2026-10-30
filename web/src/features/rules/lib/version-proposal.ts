import { z } from "zod";

const OPERATORS = ["<=", ">=", "=", "in", "criterio"] as const;

/**
 * Propuesta de nueva versión de una regla. Las reglas nunca se editan en sitio (principio 4):
 * cada cambio es una versión con vigencia que aprueba un revisor aprobador distinto del autor.
 * Ninguna conclusión sin fuente (principio 1): norma, artículo y cita literal son obligatorios.
 */
export const versionProposalSchema = z
  .object({
    description: z.string().trim().min(10, "Describa la regla (mínimo 10 caracteres)."),
    operator: z.enum(OPERATORS, { message: "Elija un operador." }),
    value: z
      .string()
      .trim()
      .refine((v) => v === "" || Number.isFinite(Number(v)), "Escriba un número (use punto decimal)."),
    unit: z.string().trim().max(20, "Máximo 20 caracteres."),
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indique la fecha desde la que rige la nueva versión."),
    reason: z.string().trim().min(1, "El motivo es obligatorio.").min(10, "Explique el motivo con al menos 10 caracteres."),
    norma: z.string().trim().min(1, "Indique la norma de la que sale la regla."),
    article: z.string().trim().min(1, "Indique el artículo o la sección de la norma."),
    quote: z.string().trim().min(1, "Copie la cita literal de la norma."),
  })
  .refine((v) => v.operator === "criterio" || v.value !== "", { path: ["value"], message: "Indique el valor de referencia (o use «Criterio»)." });

export type VersionProposal = z.infer<typeof versionProposalSchema>;
