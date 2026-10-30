import { toast } from "sonner";
import type { ReportModel } from "./report-model";
import { renderReportHtml } from "./report-html";

export const reportFileName = (m: ReportModel) => `informe-precheck-${m.project.id}-${m.version}.html`;

/**
 * «Descargar informe (HTML)»: el documento autocontenido, que se imprime o guarda como PDF desde el navegador.
 * El PDF lo emitirá el núcleo (informe-precheck) cuando se conecte la API; el botón no promete lo que no entrega.
 */
export function downloadReportHtml(model: ReportModel): string {
  const html = renderReportHtml(model);
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = reportFileName(model);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  toast.info("Informe descargado en HTML", {
    description: "Para obtener un PDF, ábralo en el navegador y elija Imprimir › Guardar como PDF.",
  });
  return a.download;
}
