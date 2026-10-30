import { mensajeSinFicha, PARAMETRO_EN_REVISION } from "@/lib/norma-zona";
import { textoNoAplican } from "@/lib/dictamen";
import { formatDate, formatNumber } from "@/lib/format";
import { projectStatusMeta } from "@/lib/status";
import type { DatoExpediente, Project, Property } from "@/types";
import type { ReportModel } from "./report-model";

export interface Field {
  label: string;
  value: string;
}

/** Dato del encabezado: «no consta» cuando no se entregó; nunca inventado (AC-11). */
const orMissing = (v: string | number | null | undefined): string => (v === null || v === undefined || v === "" ? "no consta" : String(v));

export function headerFields(m: ReportModel): Field[] {
  const reviewPending = m.project.status === "REVIEW_REQUIRED";
  return [
    { label: "Expediente", value: m.project.id },
    { label: "Trámite", value: orMissing(m.project.tramite) },
    { label: "Proyecto", value: m.project.name },
    { label: "Profesional idóneo", value: orMissing(m.project.applicant) },
    { label: "Fecha de la evaluación", value: formatDate(m.precheck.finishedAt ?? m.precheck.startedAt) },
    ...(m.precheck.fuenteResultado
      ? [
          { label: "Fuente del resultado", value: m.precheck.fuenteResultado },
          { label: "Respaldo", value: `resultado del motor (${m.precheck.engineVersion})` },
          // Qué modelo revisó y cuánto costó: un revisor compara corridas y el costo decide qué modelo usar en el día a día.
          ...(m.dictamen?.modelo || m.dictamen?.proveedor ? [{ label: "Modelo de IA", value: [m.dictamen.proveedor, m.dictamen.modelo].filter(Boolean).join(" · ") }] : []),
          ...(typeof m.dictamen?.costoUsd === "number" ? [{ label: "Costo de la revisión con IA", value: `${m.dictamen.costoUsd.toFixed(2)} USD` }] : []),
        ]
      : [{ label: "Versión del motor", value: m.precheck.engineVersion }]),
    { label: "Evaluación", value: m.precheck.id },
    { label: "Estado del expediente", value: reviewPending ? "pendiente de revisión humana" : projectStatusMeta[m.project.status].label },
    { label: "Versión del informe", value: m.version === "revisor" ? "Versión del revisor (uso interno)" : m.canIssue ? "Versión del profesional" : "Versión del profesional (vista previa, no emitida)" },
    { label: "Huella", value: "no aplica: el informe no está emitido" },
  ];
}

export const projectFields = (p: Project): Field[] => [
  { label: "Nombre", value: p.name },
  ...(p.origen === "expediente" ? [{ label: "Origen", value: "Expediente real revisado por el agente revisor-planos (resultado preliminar)" }] : []),
  { label: "Tipo de proyecto", value: orMissing(p.projectType) },
  { label: "Solicitante", value: orMissing(p.applicant) },
  { label: "Dirección", value: orMissing(p.address) },
  { label: "Corregimiento", value: orMissing(p.corregimiento) },
  ...(p.expediente?.proyecto.map(datoAField) ?? []),
];

const pct = (n: number) => `${Math.round(n * 100)} %`;

/** Hecho leído del expediente: valor, confianza y fuente (documento, página y método). */
export function datoAField(d: DatoExpediente): Field {
  const extra = [d.confianza !== undefined ? `confianza ${pct(d.confianza)}` : null, d.fuente ? `fuente: ${d.fuente}` : null].filter(Boolean).join(" · ");
  return { label: d.etiqueta, value: d.valor ? (extra ? `${d.valor} (${extra})` : d.valor) : "no consta" };
}

/** Lote de un expediente real: los datos leídos del plano, no el catastro. null si el proyecto no es un expediente. */
export function expedienteLotFields(p: Project): Field[] | null {
  if (!p.expediente) return null;
  return [
    { label: "Origen del lote", value: "Datos leídos del plano del expediente por el agente revisor-planos (no es el catastro de la ANATI)" },
    ...p.expediente.lote.filter((d) => d.clave !== "lote.codigo_zona" && d.clave !== "lote.norma_aplicable").map(datoAField),
  ];
}

export function expedienteZoningFields(p: Project): Field[] | null {
  const e = p.expediente;
  if (!e) return null;
  const zona = e.lote.find((d) => d.clave === "lote.codigo_zona");
  const asumida = e.dictamen?.supuestos.find((s) => s.hecho === "lote.codigo_zona");
  const norma = e.lote.find((d) => d.clave === "lote.norma_aplicable");
  return [
    zona ? { ...datoAField(zona), label: "Código de zona" } : { label: "Código de zona", value: p.zoningCode || "Por revisar" },
    ...(asumida ? [{ label: "Zona asumida por el arquitecto revisor", value: `${asumida.valor}${asumida.fundamento ? ` (${asumida.fundamento})` : ""}` }] : []),
    norma ? { ...datoAField(norma), label: "Norma aplicable" } : { label: "Norma aplicable", value: orMissing(e.normaAplicable) },
    { label: "Certificación de uso de suelo (CEUS)", value: "no consta: si existe, prevalece sobre la zona leída del plano" },
    ...(e.umbral !== null ? [{ label: "Confianza mínima del motor", value: pct(e.umbral) }] : []),
  ];
}

export function expedienteDocumentFields(p: Project): Field[] | null {
  const e = p.expediente;
  if (!e) return null;
  return [
    { label: "Documento revisado", value: orMissing(e.documento) },
    { label: "Páginas", value: orMissing(e.paginas) },
    { label: "Fecha de presentación", value: orMissing(e.fechaPresentacion) },
    { label: "Reglas que no aplican", value: textoNoAplican(e) },
    ...(e.zonaPorConfirmar
      ? [{ label: "Reglas de otras zonas", value: `${e.zonaPorConfirmar.total} en «Requiere revisión», agrupadas: ${e.zonaPorConfirmar.motivo}` }]
      : []),
    ...e.avisos.map((a, i) => ({ label: `Aviso ${i + 1}`, value: a })),
  ];
}

export const lotFields = ({ parcel }: Property): Field[] => [
  { label: "ID del lote", value: parcel.id },
  {
    label: "Origen del lote",
    value: parcel.origen === "declarado" ? "Dibujado por el profesional en el mapa (no es el catastro de la ANATI)" : "Lote de demostración (no es el catastro de la ANATI)",
  },
  { label: "Finca", value: orMissing(parcel.finca) },
  { label: "Área del lote", value: `${formatNumber(parcel.areaM2)} m²` },
  { label: "Uso de suelo", value: orMissing(parcel.landUse) },
  { label: "Distrito y corregimiento", value: `${parcel.district}, ${parcel.corregimiento}` },
];

export function zoningFields({ zoning, ceus, normaZona, parcel }: Property): Field[] {
  const z = zoning;
  if (!z) {
    // Sin ficha cargada: se dice por qué y los parámetros van a revisión (nunca los de otra ficha).
    return [
      { label: "Código de zona", value: parcel.zoningCode || "Por revisar" },
      { label: "Fuente", value: mensajeSinFicha(normaZona, parcel.zoningCode) ?? "no consta" },
      { label: "Certificación de uso de suelo (CEUS)", value: ceus ?? "no consta: zona tomada del Documento Gráfico" },
      ...["Densidad máxima", "Área mínima de lote", "Frente mínimo", "Ocupación máxima", "Altura máxima", "Acera mínima", "Retiros"].map(
        (label) => ({ label, value: PARAMETRO_EN_REVISION }),
      ),
    ];
  }
  return [
    { label: "Código de zona", value: `${z.code} · ${z.name}` },
    { label: "Fuente", value: `${z.norma}, pág. ${z.sourcePage}` },
    { label: "Certificación de uso de suelo (CEUS)", value: ceus ?? "no consta: zona tomada del Documento Gráfico" },
    { label: "Densidad máxima", value: orMissing(z.maxDensity) },
    { label: "Área mínima de lote", value: orMissing(z.minLotArea) },
    { label: "Frente mínimo", value: orMissing(z.minFront) },
    { label: "Ocupación máxima", value: orMissing(z.maxCoverage) },
    { label: "Altura máxima", value: orMissing(z.maxHeight) },
    { label: "Acera mínima", value: orMissing(z.minSidewalk) },
    { label: "Retiros", value: orMissing(z.setbacks) },
  ];
}
