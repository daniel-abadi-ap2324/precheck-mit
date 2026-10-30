"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Cierra con Escape mientras `enabled` sea verdadero. Respeta `defaultPrevented`: si un menú o diálogo abierto ya
 * atendió la tecla, el panel no se cierra con ella.
 */
export function useEscapeToClose(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled, onClose]);
}

interface SidePanelProps {
  /** Id del h2; nombra la región. */
  titleId: string;
  title: ReactNode;
  /** Línea bajo el título (identificador, código…); admite una clave de color delante. */
  subtitle?: ReactNode;
  onClose: () => void;
  /** Nombre accesible del botón de cierre, p. ej. «Cerrar información del lote». */
  closeLabel: string;
  /** En escritorio el panel escucha Escape; en la hoja móvil lo gestiona el Sheet. */
  closeOnEscape?: boolean;
  className?: string;
  children: ReactNode;
}

/** Panel lateral de información (mapa): cabecera con título, subtítulo y botón de cierre; Escape cierra. */
export function SidePanel({ titleId, title, subtitle, onClose, closeLabel, closeOnEscape = true, className, children }: SidePanelProps) {
  useEscapeToClose(onClose, closeOnEscape);
  return (
    <section aria-labelledby={titleId} className={cn("flex flex-col gap-4 p-4", className)}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          {subtitle ? <p className="tabular flex min-w-0 items-center gap-2 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={closeLabel}>
          <X aria-hidden />
        </Button>
      </header>
      {children}
    </section>
  );
}
