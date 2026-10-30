import { FactList } from "@/components/common";
import type { Property } from "@/types";
import { buildLotInfo, ceusLine, sourceLine } from "../lib/lot-info";

/** Filas de la ficha del lote con fuente y línea de CEUS. */
export function LotInfo({ property }: { property: Property }) {
  const rows = buildLotInfo(property);
  return (
    <div className="flex flex-col gap-3">
      <FactList rows={rows} labelWidth="fluid" tabular />
      <p className="text-xs text-muted-foreground">{sourceLine(property)} Valores literales de la ficha; datos catastrales de demostración.</p>
      <p className="rounded-md border bg-muted px-2.5 py-2 text-xs">{ceusLine(property)}</p>
    </div>
  );
}
