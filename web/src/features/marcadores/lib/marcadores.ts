import { leerNombrePrueba } from "@/lib/corridas-prueba";
import type { ComplianceResult } from "@/types";
import { MAX_CONCLUSION, MAX_EXTRACTO, type FotoMarcador, type Marcador } from "@/services/marcadores/tipos";

/** Adónde lleva un marcador: a la regla en la revisión, o a la conclusión en el resumen del proyecto. */
export function enlaceDeMarcador(m: Pick<Marcador, "projectId" | "ruleId">): string {
  const proyecto = `/projects/${encodeURIComponent(m.projectId)}`;
  // encodeURIComponent: hay ids con «#» («X#2»), espacios o «:»; sin codificar, «#» cortaría la URL.
  return m.ruleId ? `${proyecto}/precheck?rule=${encodeURIComponent(m.ruleId)}` : `${proyecto}#conclusion`;
}

const recortar = (t: string | undefined, max: number) => (t && t.length > max ? `${t.slice(0, max - 1)}…` : t);

/** Plano, modelo, ronda y repetición del proyecto (de su nombre si es una corrida de prueba). */
export function contextoDeProyecto(nombre: string): Pick<FotoMarcador, "proyecto" | "plano" | "modelo" | "ronda" | "repeticion"> {
  const n = leerNombrePrueba(nombre);
  return { proyecto: nombre.slice(0, 200), plano: (n?.plano ?? nombre).slice(0, 200), modelo: n?.modelo ?? null, ronda: n?.ronda ?? null, repeticion: n?.repeticion ?? null };
}

/** Foto de una regla tal como la vio el usuario: título, estado y la decisión de la IA recortada. */
export function fotoDeRegla(nombreProyecto: string, titulo: string, result: Pick<ComplianceResult, "status" | "faltaEnPlano" | "dictamen">): FotoMarcador {
  const d = result.dictamen;
  return {
    ...contextoDeProyecto(nombreProyecto),
    regla: {
      titulo: titulo.slice(0, 300),
      estado: result.status,
      ...(result.faltaEnPlano ? { faltaEnPlano: true } : {}),
      ...(d ? { decision: d.estado ?? d.decision, justificacion: recortar(d.justificacion, MAX_EXTRACTO) } : {}),
    },
  };
}

export const fotoDeConclusion = (nombreProyecto: string, conclusion: string): FotoMarcador => ({
  ...contextoDeProyecto(nombreProyecto),
  regla: null,
  conclusion: recortar(conclusion, MAX_CONCLUSION),
});

export const TIPOS_MARCADOR = {
  interesante: { etiqueta: "Interesante" },
  equivocada: { etiqueta: "Equivocada" },
} as const;
