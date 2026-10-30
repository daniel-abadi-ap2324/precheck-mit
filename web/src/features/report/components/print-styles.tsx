import { REPORT_DOCUMENT_ID } from "./report-document";

/**
 * Estilos de impresión acotados al contenedor del informe: al imprimir solo se ve el documento
 * (el shell de la app queda oculto sin tocar sus componentes). Tamaño carta, márgenes de 18 mm.
 */
const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 18mm; }
  body * { visibility: hidden !important; }
  #${REPORT_DOCUMENT_ID}, #${REPORT_DOCUMENT_ID} * { visibility: visible !important; }
  #${REPORT_DOCUMENT_ID} { position: absolute; inset: 0 auto auto 0; width: 100%; font-size: 11pt; }
  #${REPORT_DOCUMENT_ID} thead { display: table-header-group; }
  #${REPORT_DOCUMENT_ID} tr, #${REPORT_DOCUMENT_ID} li { break-inside: avoid; }
}`;

export function ReportPrintStyles() {
  return <style>{PRINT_CSS}</style>;
}
