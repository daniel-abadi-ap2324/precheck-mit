import { Info } from "lucide-react";

/** Cómo leer los rótulos del Documento Gráfico frente a las fichas. */
export function ZoningNotes() {
  return (
    <aside aria-label="Cómo leer los códigos" className="flex gap-2.5 rounded-lg border border-info/30 bg-info-soft p-3 text-sm">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
      <div className="flex flex-col gap-1">
        <p>
          En el Documento Gráfico los códigos llevan un prefijo de clase de suelo: <span className="tabular font-medium">1</span> = suelo urbano. Así,{" "}
          <span className="tabular font-medium">1RM-2</span> corresponde a la ficha <span className="tabular font-medium">RM-2</span>. La búsqueda acepta ambos.
        </p>
        <p>
          Un rótulo doble como <span className="tabular font-medium">1P / 1ZM6</span> indica <strong className="font-medium">uso actual / uso futuro</strong>. Usar el
          futuro exige compensación, por lo que el PreCheck lo envía a revisión.
        </p>
      </div>
    </aside>
  );
}
