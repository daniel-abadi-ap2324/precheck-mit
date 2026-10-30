import { z } from "zod";

export const PROJECT_TYPES = [
  "Residencial unifamiliar",
  "Residencial multifamiliar",
  "Uso mixto",
  "Comercial",
  "Institucional",
  "Industrial",
] as const;

/** Los 26 corregimientos del distrito de Panamá (capa distrito8v4, public/data/base/corregimientos.geojson). */
export const CORREGIMIENTOS = [
  "24 de Diciembre",
  "Alcalde Díaz",
  "Ancón",
  "Bella Vista",
  "Betania",
  "Caimitillo",
  "La Exposición o Calidonia",
  "Chilibre",
  "Curundú",
  "Don Bosco",
  "El Chorrillo",
  "Ernesto Córdoba Campos",
  "Juan Díaz",
  "Las Cumbres",
  "Las Garzas",
  "Las Mañanitas",
  "Pacora",
  "Parque Lefevre",
  "Pedregal",
  "Pueblo Nuevo",
  "Río Abajo",
  "San Felipe",
  "San Francisco",
  "San Martín",
  "Santa Ana",
  "Tocumen",
] as const;

export const projectInfoSchema = z.object({
  name: z.string().trim().min(3, "Escriba un nombre de al menos 3 caracteres."),
  // Opcional: un lote dibujado por el profesional no tiene ID en el sistema. Si se escribe, con formato PAR-000000.
  propertyId: z.string().trim().regex(/^(PAR-\d{6})?$/, "Use el formato PAR-000000 o déjelo vacío."),
  finca: z.string().trim().regex(/^\d{3,8}$/, "La finca es un número de 3 a 8 dígitos."),
  address: z.string().trim().min(5, "Escriba la dirección del lote."),
  corregimiento: z.enum(CORREGIMIENTOS, { message: "Elija un corregimiento." }),
  projectType: z.enum(PROJECT_TYPES, { message: "Elija el tipo de proyecto." }),
  applicant: z.string().trim().min(3, "Escriba el nombre del profesional idóneo o del solicitante."),
});

export type ProjectInfo = z.infer<typeof projectInfoSchema>;

export const projectInputSchema = projectInfoSchema.extend({
  parcelId: z.string(),
  zoningCode: z.string(),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

export const ACCEPTED_FORMATS = ["PDF", "DWG", "DXF", "IFC"] as const;
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

export function formatFromName(name: string): (typeof ACCEPTED_FORMATS)[number] | null {
  const punto = name.lastIndexOf(".");
  // Sin punto (o con el punto al inicio o al final) no hay extensión: «pdf» no es un PDF.
  if (punto <= 0 || punto === name.length - 1) return null;
  const ext = name.slice(punto + 1).toUpperCase();
  return (ACCEPTED_FORMATS as readonly string[]).includes(ext ?? "") ? (ext as (typeof ACCEPTED_FORMATS)[number]) : null;
}
