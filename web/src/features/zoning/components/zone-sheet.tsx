import { BookCheck, Landmark } from "lucide-react";
import type { Zoning } from "@/types";
import { FactList, LinkButton } from "@/components/common";
import { zoneFields } from "../lib/zone-fields";

/** Ficha normativa de una zona con todos sus campos literales y su página de origen. */
export function ZoneSheet({ zoning }: { zoning: Zoning }) {
  return (
    <article aria-labelledby="zone-sheet-title" className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Landmark aria-hidden className="size-4" />
            Ficha {zoning.code} · pág. {zoning.sourcePage}
          </p>
          <h2 id="zone-sheet-title" className="text-lg font-semibold">
            {zoning.code} — {zoning.name}
          </h2>
        </div>
        <LinkButton href={`/rules?zoning=${encodeURIComponent(zoning.code)}`} variant="outline" size="sm">
          <BookCheck aria-hidden />
          Ver reglas de la zona
        </LinkButton>
      </header>
      <FactList rows={zoneFields(zoning)} labelWidth="md" tabular />
      <p className="border-t pt-3 text-xs text-muted-foreground">
        Valores literales de la ficha del Anexo 4 del PLOT (Acuerdo 61 de 2021), pág. {zoning.sourcePage}; no se completan de memoria. Si el expediente
        trae certificación de uso de suelo (CEUS) de la DPUOT, esta prevalece sobre el Documento Gráfico.
      </p>
    </article>
  );
}
