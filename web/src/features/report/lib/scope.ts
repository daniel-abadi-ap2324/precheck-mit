import type { RuleResult } from "@/hooks/use-rule-results";
import type { Project, Property } from "@/types";

export interface ScopeItem {
  id: "borrador" | "demo" | "expediente" | "lote-declarado" | "ceus" | "miviot" | "dictamen";
  title: string;
  body: string;
}

/**
 * Sección de alcance (spec informe-precheck, AC-19): sale siempre, también sin limitaciones.
 * Redactada sin «no oficial» para que sirva igual en las dos versiones.
 */
export function buildScope(items: RuleResult[], property: Property | null, project?: Pick<Project, "origen" | "expediente" | "zoningCode">): ScopeItem[] {
  const draft = items.filter(({ rule }) => rule.state !== "aprobada").length;
  const demo = items.filter(({ rule }) => rule.demo).length;
  const scope: ScopeItem[] = [];

  scope.push(
    draft > 0
      ? { id: "borrador", title: "Reglas en borrador", body: `${draft} de ${items.length} reglas evaluadas están en borrador y aún no las aprueba la DOYC; todos sus resultados son indicativos.` }
      : { id: "borrador", title: "Reglas aprobadas", body: `Las ${items.length} reglas evaluadas están aprobadas.` },
  );
  if (demo > 0) {
    scope.push({ id: "demo", title: "Reglas de demostración", body: `${demo} reglas no existen en el catálogo real y se usan solo para la demostración; no tienen cita literal verificada.` });
  }
  const expediente = project?.origen === "expediente" ? project.expediente : undefined;
  if (expediente) {
    scope.push({
      id: "expediente",
      title: "Expediente real, resultado preliminar",
      body: `Resultados del agente revisor-planos sobre el expediente${expediente.documento ? ` (${expediente.documento})` : ""}: los datos se leyeron del plano con la confianza indicada en cada uno y no se contrastaron con el Registro Público ni con el catastro. ${expediente.noAplican} reglas se descartaron por no aplicar y no se listan.`,
    });
    scope.push({
      id: "ceus",
      title: "Zona sin CEUS",
      body: project?.zoningCode
        ? `La zona ${project.zoningCode} se leyó del plano, sin certificación de uso de suelo (CEUS) de la DPUOT. Si existe una CEUS, prevalece sobre este dato.`
        : "La zona no se pudo leer del plano y no hay certificación de uso de suelo (CEUS) de la DPUOT: requiere revisión.",
    });
  }
  if (property?.parcel.origen === "declarado") {
    scope.push({
      id: "lote-declarado",
      title: "Lote declarado",
      body: `El lote ${property.parcel.id} lo dibujó el profesional: su forma, su área y su zona son declaradas y deben contrastarse con el catastro de la ANATI y con la CEUS, si existe.`,
    });
  }
  if (property && !property.ceus) {
    scope.push({
      id: "ceus",
      title: "Zona sin CEUS",
      body: (property.zoning?.code ?? property.parcel.zoningCode)
        ? `La zona ${property.zoning?.code ?? property.parcel.zoningCode} se tomó del Documento Gráfico del PLOT, sin certificación de uso de suelo (CEUS) de la DPUOT. Si existe una CEUS, prevalece sobre este dato.`
        : "La zona del lote no se pudo determinar en el Documento Gráfico del PLOT y no hay certificación de uso de suelo (CEUS) de la DPUOT: requiere revisión.",
    });
  }
  if (!expediente) scope.push({
    id: "miviot",
    title: "Normas del MIVIOT no cargadas",
    body: "Las normas del MIVIOT para las zonas exceptuadas no están cargadas en el sistema; los puntos que dependan de ellas no se evaluaron.",
  });
  scope.push({
    id: "dictamen",
    title: "No es el dictamen de la DOYC",
    body: "Este informe no es la lista de observaciones del dictamen técnico de la DOYC; el dictamen puede incluir otras.",
  });
  return scope;
}
