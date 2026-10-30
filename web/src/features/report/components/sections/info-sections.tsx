import { formatBytes } from "@/lib/format";
import { expedienteDocumentFields, expedienteLotFields, expedienteZoningFields, lotFields, projectFields, zoningFields } from "../../lib/report-fields";
import type { ReportModel } from "../../lib/report-model";
import { FieldList, Muted } from "../report-section";

export const ProjectInfo = ({ model }: { model: ReportModel }) => <FieldList fields={projectFields(model.project)} />;

export function LotInfo({ model }: { model: ReportModel }) {
  const expediente = model.property ? null : expedienteLotFields(model.project);
  if (expediente) return <FieldList fields={expediente} />;
  return model.property ? <FieldList fields={lotFields(model.property)} /> : <Muted>Datos del lote: no constan.</Muted>;
}

export function ZoningInfo({ model }: { model: ReportModel }) {
  const expediente = model.property ? null : expedienteZoningFields(model.project);
  if (expediente) return <FieldList fields={expediente} />;
  if (!model.property) return <Muted>Zonificación: no consta.</Muted>;
  return (
    <>
      <FieldList fields={zoningFields(model.property)} />
      <p className="mt-2 text-xs text-ink-muted">Valores literales de la ficha normativa; no se completan de memoria.</p>
    </>
  );
}

export function PlansInfo({ model }: { model: ReportModel }) {
  const expediente = model.plans.length === 0 ? expedienteDocumentFields(model.project) : null;
  if (expediente) return <FieldList fields={expediente} />;
  if (model.plans.length === 0) return <Muted>No hay planos cargados.</Muted>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-ink-muted">
        <tr className="border-b">
          <th scope="col" className="py-1 pr-3 font-medium">
            Archivo
          </th>
          <th scope="col" className="py-1 pr-3 font-medium">
            Formato
          </th>
          <th scope="col" className="py-1 pr-3 font-medium">
            Hojas
          </th>
          <th scope="col" className="py-1 font-medium">
            Tamaño
          </th>
        </tr>
      </thead>
      <tbody>
        {model.plans.map((p) => (
          <tr key={p.id} className="border-b last:border-0">
            <td className="py-1 pr-3 break-all">{p.fileName}</td>
            <td className="py-1 pr-3">{p.format}</td>
            <td className="py-1 pr-3">{p.sheets.length ? p.sheets.map((s) => s.name).join(", ") : "—"}</td>
            <td className="tabular py-1">{formatBytes(p.sizeBytes)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
