"use client";

import type { ReactNode } from "react";
import { CircleX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DATOS_DECLARABLES, GRUPOS_DECLARADOS } from "@/lib/datos-declarados";
import { leerCuadro, type TextosCuadro } from "../lib/cuadro-datos";

interface Props {
  textos: TextosCuadro;
  onChange: (clave: string, texto: string) => void;
  idPrefix?: string;
  /** Título y explicación propios (por defecto, los del cuadro de datos del anteproyecto). */
  titulo?: string;
  ayuda?: ReactNode;
}

/**
 * Paso 0: cuadro de datos del anteproyecto. La persona declara lo que hoy se mide a escala en el dibujo (retiros,
 * área, alturas…); el motor lo usa con procedencia «declarado» y la revisión lo contrasta con lo dibujado.
 */
export function CuadroDatosAnteproyecto({ textos, onChange, idPrefix = "cuadro", titulo = "Cuadro de datos del anteproyecto", ayuda: ayudaPropia }: Props) {
  const { errores } = leerCuadro(textos);
  const ayuda = `${idPrefix}-ayuda`;
  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border p-4" aria-describedby={ayuda}>
      <legend className="px-1 text-sm font-semibold">{titulo}</legend>
      <div id={ayuda} className="space-y-1 text-sm text-muted-foreground">
        {ayudaPropia ?? (
          <>
        <p>Declárelos tal como están en el cuadro de datos del plano, en la unidad indicada. Son opcionales: lo que deje vacío se lee o se mide del plano.</p>
        <p>
          Lo declarado no se da por bueno sin más: el PreCheck lo contrasta con el dibujo y, si no coincide, lo señala como observación para el revisor.
        </p>
          </>
        )}
      </div>
      {GRUPOS_DECLARADOS.map((g) => {
        const datos = DATOS_DECLARABLES.filter((d) => d.grupo === g.grupo);
        return (
          <section key={g.grupo} aria-labelledby={`${idPrefix}-${g.grupo}`} className="flex flex-col gap-2">
            <h4 id={`${idPrefix}-${g.grupo}`} className="text-sm font-medium">
              {g.titulo}
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {datos.map((d) => {
                const id = `${idPrefix}-${d.clave.replace(/\W/g, "-")}`;
                const error = errores[d.clave];
                return (
                  <div key={d.clave} className="flex flex-col gap-1.5">
                    <Label htmlFor={id}>{d.unidad ? `${d.etiqueta} (${d.unidad})` : d.etiqueta}</Label>
                    <Input
                      id={id}
                      value={textos[d.clave] ?? ""}
                      onChange={(e) => onChange(d.clave, e.target.value)}
                      inputMode="decimal"
                      placeholder="Como está en el plano"
                      maxLength={20}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? `${id}-error` : undefined}
                    />
                    {error ? (
                      <p id={`${id}-error`} className="flex items-start gap-1 text-2xs text-fail">
                        <CircleX aria-hidden className="mt-px size-3 shrink-0" />
                        {error}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </fieldset>
  );
}
