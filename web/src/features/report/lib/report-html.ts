import { brand } from "@/config/brand";
import { reportColors as c } from "@/config/report-colors";
import { formatDate, formatMeasure, formatSigned } from "@/lib/format";
import { resumenPorZona, separarPorZona } from "@/lib/agrupar-zona";
import { FUENTE_DICTAMEN, textoObjecion, textoReservasDictamen, textoRevisionIa, textoSupuesto } from "@/lib/dictamen";
import type { QueSeSupuso } from "@/lib/supuestos";
import { isOfficialResult } from "@/lib/official";
import { complianceMeta, metaDeResultado } from "@/lib/status";
import type { RuleResult } from "@/hooks/use-rule-results";
import type { ComplianceResult, DictamenInfo } from "@/types";
import { expedienteDocumentFields, expedienteLotFields, expedienteZoningFields, headerFields, lotFields, projectFields, zoningFields, type Field } from "./report-fields";
import type { ReportModel } from "./report-model";
import { sectionsOf } from "./sections";
import { markdownAHtml } from "@/lib/markdown-seguro";

/** Escapa texto para HTML: todo texto se muestra como texto plano (spec §6.1). */
export const esc = (s: string | number): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const dl = (fields: Field[]) => `<dl>${fields.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join("")}</dl>`;

/** Decisión del arquitecto revisor de una regla: valor leído, límite, justificación, evidencia, qué subsanar y motor. */
function decisionHtml(r: ComplianceResult): string {
  const d = r.dictamen;
  if (!d) return "";
  const respaldo = d.origen === "motor";
  const partes = [
    respaldo
      ? `<b>Decisión de respaldo del motor.</b> La IA no decidió esta regla${d.supuestos?.length ? `; descansa en ${esc(d.supuestos.join(", "))} (ver «Qué se supuso en esta revisión»)` : ""}.`
      : null,
    d.reserva ? `<b>${d.reserva.motivo === "motor" ? "Prevalece el motor de reglas." : "No bloquea por confianza baja."}</b> ${esc(d.reserva.detalle)}` : null,
    d.estado === "INFORMACION_REQUERIDA" ? "<b>Información requerida:</b> la decisión depende de un documento o dato que no está en el expediente; no es una falla del plano." : null,
    d.valorLeido ? `<b>Valor leído:</b> ${esc(d.valorLeido)}` : null,
    d.limite ? `<b>Límite:</b> ${esc(d.limite)}` : null,
    `<b>${respaldo ? "Motivo" : "Justificación"}:</b> ${esc(d.justificacion)}`,
    d.evidencia.length
      ? `<b>Evidencia:</b> ${d.evidencia.map((e) => esc([e.pagina !== null ? `p. ${e.pagina}` : null, e.detalle || null].filter(Boolean).join(": "))).join("; ")}`
      : null,
    // Las marcas se dibujan en la web; en el informe quedan como texto (página, etiqueta y recuadro en fracciones de la página).
    d.marcas?.length ? `<b>Marcas en el plano:</b> ${d.marcas.map((m) => esc(`p. ${m.pagina}: ${m.etiqueta || "sin nombre"} (x ${m.x.toFixed(2)}, y ${m.y.toFixed(2)}, ${m.w.toFixed(2)} × ${m.h.toFixed(2)})`)).join("; ")}` : null,
    d.subsanar ? `<b>Qué subsanar:</b> ${esc(d.subsanar)}` : null,
    r.motorStatus ? `<i>${respaldo ? "Antes del respaldo" : "Motor"}: ${esc(complianceMeta[r.motorStatus].label)}${r.motorReason ? ` — ${esc(r.motorReason)}` : ""}</i>` : null,
  ].filter(Boolean);
  return `<div class="dic">${partes.map((p) => `<p>${p}</p>`).join("")}</div>`;
}

/** Conclusión, supuestos, discrepancias de regiones y quién revisó (arriba del informe). */
function dictamenHtml(d: DictamenInfo): string {
  const supuestos = d.supuestos.length ? `<h3>Supuestos</h3><ul>${d.supuestos.map((s) => `<li>${esc(textoSupuesto(s))}</li>`).join("")}</ul>` : "";
  const regiones = d.regionesDiscrepantes?.length
    ? `<h3>Regiones del plano que no coinciden con lo declarado</h3><ul>${d.regionesDiscrepantes.map((r) => `<li>${esc(`${r.referencia}: ${r.detalle}`)}</li>`).join("")}</ul>`
    : "";
  const objeciones = d.objeciones?.length
    ? `<h3>Objeciones de la IA al motor</h3><p class="note">No cambian el resultado: prevalece el motor. El equipo las revisa.</p><ul>${d.objeciones.map((o) => `<li>${esc(textoObjecion(o))}</li>`).join("")}</ul>`
    : "";
  const revision = textoRevisionIa(d);
  const reservas = textoReservasDictamen(d);
  return `<h3>Conclusión del arquitecto revisor</h3><p>${esc(d.conclusion ?? "El dictamen no trae conclusión.")}</p>${supuestos}${objeciones}${regiones}<p class="note">Fuente: ${esc(FUENTE_DICTAMEN)}${d.fecha ? `, ${esc(d.fecha)}` : ""}. ${revision ? `${esc(revision)} ` : ""}Resultado preliminar y no oficial (reglas en borrador): no sustituye el dictamen técnico de la DOYC (Acuerdo 110, Art. 3). El visto bueno final es del Revisor DOYC.${reservas ? ` ${esc(reservas)}` : ""}</p>`;
}

const lista = (titulo: string, items: string[]) => (items.length ? `<h3>${esc(titulo)}</h3><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");

/** «Qué se supuso en esta revisión» (ADR-0016): zona de trabajo, descartadas, datos supuestos, vigentes, avisos y conteo. */
function supuestosHtml(s: QueSeSupuso): string {
  return [
    s.iaFallida ? `<p class="note"><b>${esc(s.iaFallida)}</b></p>` : "",
    s.zona ? `<p>${esc(s.zona.texto)}${s.zona.accion ? ` <b>${esc(s.zona.accion)}</b>` : ""}</p>` : "",
    lista("Zonas descartadas", s.descartadas),
    lista(
      "Datos supuestos",
      s.supuestos.map((x) => `${x.id} · ${x.texto}${x.reglas ? ` (${x.reglas} ${x.reglas === 1 ? "regla" : "reglas"}).` : ""}${x.accion ? ` ${x.accion}` : ""}`),
    ),
    s.vigentes ? `<h3>Reglas vigentes de esta corrida</h3><p>${esc(s.vigentes.resumen)}</p><ul>${s.vigentes.detalle.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "",
    lista("Avisos del motor", s.avisos),
    s.conteo ? `<p class="note">${esc(s.conteo)}</p>` : "",
  ].join("");
}

function rulesTable(todas: RuleResult[], showUnofficial: boolean): string {
  if (todas.length === 0) return "<p>Ninguna.</p>";
  // Las reglas de otras zonas que solo dependen de confirmar el código de zona van en una línea (ADR-0012).
  const { detalle: items, porZona } = separarPorZona(todas);
  const zona = porZona.length ? resumenPorZona(porZona) : null;
  const filaZona = zona ? `<tr><td>${esc(complianceMeta[zona.status].label + (showUnofficial ? " · no oficial" : ""))}</td><td colspan="4">${esc(zona.texto)}</td></tr>` : "";
  const rows = items
    .map((item) => {
      const { rule, result } = item;
      const tag = (showUnofficial && !isOfficialResult(item) ? " · no oficial" : "") + (result.fueraDeCatalogo ? " · propuesto por la IA, fuera del catálogo" : "");
      return `<tr><td>${esc(metaDeResultado(result.status, result.faltaEnPlano, result.conSupuesto).label + tag)}</td><td>${esc(rule.title)}<br><small>${esc(rule.id)}</small>${decisionHtml(result)}</td><td>${esc(formatMeasure(result.detectedValue ?? undefined, result.unit))}</td><td>${esc(formatSigned(result.difference ?? undefined, result.unit))}</td><td>${esc(`${rule.regulation.article} · ${rule.regulation.norma}`)}</td></tr>`;
    })
    .join("");
  return `<table><thead><tr><th>Estado</th><th>Regla</th><th>Detectado</th><th>Diferencia</th><th>Referencia</th></tr></thead><tbody>${rows}${filaZona}</tbody></table>`;
}

function sectionBody(id: string, m: ReportModel): string {
  const revisor = m.version === "revisor";
  switch (id) {
    case "encabezado":
      return `<p class="note">${esc(brand.preliminaryNotice)}</p>${dl(headerFields(m))}`;
    case "que-se-supuso":
      return m.supuestos ? supuestosHtml(m.supuestos) : "";
    case "dictamen":
      return m.dictamen ? dictamenHtml(m.dictamen) : "";
    case "proyecto":
      return dl(projectFields(m.project));
    case "lote":
      if (!m.property && m.project.expediente) return dl(expedienteLotFields(m.project) ?? []);
      return m.property ? dl(lotFields(m.property)) : "<p>No consta.</p>";
    case "zonificacion":
      if (!m.property && m.project.expediente) return dl(expedienteZoningFields(m.project) ?? []);
      return m.property ? dl(zoningFields(m.property)) : "<p>No consta.</p>";
    case "planos":
      if (m.plans.length === 0 && m.project.expediente) return dl(expedienteDocumentFields(m.project) ?? []);
      return `<ul>${m.plans.map((p) => `<li>${esc(`${p.fileName} (${p.format})`)}</li>`).join("")}</ul>`;
    case "resumen":
      return `<p>${m.counts.total} reglas evaluadas: ${m.counts.pass} cumple, ${m.counts.fail} no cumple${m.counts.conSupuesto ? ` (${m.counts.conSupuesto} con supuesto, por confirmar)` : ""}, ${m.counts.warning} observación, ${m.counts.manual} requieren revisión. Índice preliminar de cumplimiento: ${m.counts.index} % (no equivale a aprobación).</p>${m.precheck.fuenteResultado ? `<p>Fuente de los estados: ${esc(m.precheck.fuenteResultado)}.</p>` : ""}`;
    case "informe-revisor":
      return m.precheck.informeRevisor ? markdownAHtml(m.precheck.informeRevisor) : "";
    case "no-cumplen":
      return rulesTable(m.failing, revisor);
    case "observaciones":
      return rulesTable(m.warnings, revisor);
    case "requieren-revision":
      return rulesTable(m.manual, revisor);
    case "cumplen":
      return `<ul>${m.passByCategory.map((c) => `<li>${esc(c.label)}: ${c.count}${revisor ? ` — ${esc(c.titles.join("; "))}` : ""}</li>`).join("")}</ul>`;
    case "observaciones-redactadas":
      return m.observations
        .map(
          (o, i) =>
            `<article><h3>${i + 1}. ${esc(o.title)} (${o.blocking ? "bloqueante" : "no bloqueante"})${o.fueraDeCatalogo ? " · propuesto por la IA, fuera del catálogo: pendiente de validar" : ""}</h3><p><b>Qué:</b> ${esc(o.que)}</p><p><b>Dónde:</b> ${esc(o.donde)}</p><p><b>Por qué:</b> ${esc(`${o.porque.norma}, ${o.porque.article}`)}${o.porque.quote ? `: «${esc(o.porque.quote)}»` : " (regla de demostración, sin cita literal)"}</p><p><b>${o.subsanar ? "Qué subsanar" : "Qué hacer"}:</b> ${esc(o.queHacer)}</p>${o.zoneNote ? `<p><i>${esc(o.zoneNote)}</i></p>` : ""}</article>`,
        )
        .join("");
    case "alcance":
      return `<ul>${m.scope.map((s) => `<li><b>${esc(s.title)}.</b> ${esc(s.body)}</li>`).join("")}</ul>`;
    case "referencias":
      return `<ul>${m.references.map((r) => `<li>${esc(r.norma)}${r.articles.length ? ` — ${esc(r.articles.join(", "))}` : ""}${r.pages.length ? ` (pág. ${r.pages.join(", ")})` : ""}</li>`).join("")}</ul>`;
    default:
      return "";
  }
}

const CSS = `body{font-family:"Montserrat",system-ui,sans-serif;color:${c.ink};max-width:816px;margin:0 auto;padding:48px;line-height:1.5;font-size:14px}h1{font-size:22px}h2{font-size:17px;border-bottom:1px solid ${c.line};padding-bottom:4px;margin-top:28px}h3{font-size:15px}.note{border:1px solid ${c.note};background:${c.noteSoft};padding:10px 12px}dl div{display:flex;gap:8px}dt{min-width:200px;color:${c.inkMuted}}dd{margin:0}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid ${c.line};padding:4px 6px;text-align:left;vertical-align:top}thead{display:table-header-group}article{break-inside:avoid;margin-bottom:12px}.wm{color:${c.alert};font-weight:600}.dic{margin-top:4px;font-size:11px}.dic p{margin:2px 0}@page{size:letter;margin:18mm}`;

/** Documento autocontenido (sin recursos externos) del informe, en la versión elegida. */
export function renderReportHtml(m: ReportModel): string {
  const title = `${brand.productName} — Informe preliminar`;
  const watermark = m.version === "profesional" && !m.canIssue ? `<p class="wm">Vista previa — no emitida</p>` : "";
  const internal = m.version === "revisor" ? `<p class="wm">Uso interno — versión del revisor</p>` : "";
  const body = sectionsOf(m)
    .map((s) => (s.id === "encabezado" ? `<section id="${s.id}"><h1>${esc(title)}</h1>${internal}${watermark}${sectionBody(s.id, m)}</section>` : `<section id="${s.id}"><h2>${esc(s.title)}</h2>${sectionBody(s.id, m)}</section>`))
    .join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(`${title} · ${m.project.name}`)}</title><style>${CSS}</style></head><body>${body}<footer><small>Generado ${esc(formatDate(m.generatedAt))} · ${esc(brand.entity)}</small></footer></body></html>`;
}
