"use client";

import { useId } from "react";
import { ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CuadroDatosAnteproyecto } from "@/features/plans/components/cuadro-datos-anteproyecto";
import type { TextosCuadro } from "@/features/plans/lib/cuadro-datos";

interface Props {
  zona: string;
  onZona: (zona: string) => void;
  cuadro: TextosCuadro;
  onCuadro: (clave: string, texto: string) => void;
  /** Cuántas variables tiene definidas (para el resumen cerrado). */
  definidas: number;
}

/**
 * «Variables definidas»: lo que el arquitecto decide al 100 %. Se imponen sobre la lectura del plano y sobre la IA, con
 * confianza total, y nadie las cuestiona (precheck/planos/definidas.py). Es opcional: lo que se deja vacío se lee del plano.
 */
export function VariablesDefinidas({ zona, onZona, cuadro, onCuadro, definidas }: Props) {
  const id = useId();
  return (
    <details className="rounded-lg border bg-card p-4" open={definidas > 0}>
      <summary className="flex cursor-pointer items-center gap-2 font-semibold">
        <ShieldCheck aria-hidden className="size-4 text-brand" />
        Variables definidas
        <span className="font-normal text-muted-foreground">{definidas ? `(${definidas} definida${definidas === 1 ? "" : "s"})` : "(opcional)"}</span>
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Lo que escriba aquí lo decide usted al 100 %: el PreCheck lo usa con confianza total y la IA no lo cuestiona ni lo cambia. Úselo solo con lo que
          tiene certeza (por ejemplo, la zonificación de su certificación de uso de suelo). Lo que deje vacío se lee del plano.
        </p>
        <div className="flex max-w-sm flex-col gap-1.5">
          <Label htmlFor={`${id}-zona`}>Zonificación (código)</Label>
          <Input id={`${id}-zona`} value={zona} onChange={(e) => onZona(e.target.value)} placeholder="Como lo escribe la norma, por ejemplo R2" maxLength={40} autoComplete="off" />
        </div>
        <CuadroDatosAnteproyecto
          idPrefix="definidas"
          textos={cuadro}
          onChange={onCuadro}
          titulo="Medidas y cantidades definidas"
          ayuda={<p>Escríbalas tal como están en el cuadro de datos del plano, en la unidad indicada. Son opcionales.</p>}
        />
      </div>
    </details>
  );
}
