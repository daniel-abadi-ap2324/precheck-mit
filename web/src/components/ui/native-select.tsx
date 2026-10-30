import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Select nativo con el aspecto de los controles. Es el único selector de listas cortas de la app
 * (filtros, filas por página, operador de una regla): se prefiere al `Select` de Base UI (`./select`)
 * porque el <select> del navegador es accesible sin más (teclado, lectores de pantalla, selector
 * propio del móvil) y funciona con `register` de react-hook-form sin Controller. `./select` queda solo
 * donde ya se usa con Controller (SelectField del asistente).
 */
export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-8 w-full appearance-none rounded-lg border border-input bg-card py-1 pr-8 pl-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
