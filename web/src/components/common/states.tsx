"use client";

import { ApiError } from "@/services/api/contract";
import type { LucideIcon } from "lucide-react";
import { CircleAlert, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function EmptyState({ title, body, icon: Icon = Inbox, action, className }: { title: string; body?: string; icon?: LucideIcon; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center", className)}>
      <Icon aria-hidden className="size-6 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {body ? <p className="max-w-sm text-sm text-muted-foreground">{body}</p> : null}
      {action}
    </div>
  );
}

interface ErrorStateProps {
  error?: unknown;
  /** Texto propio del error; si falta, se usa el mensaje del error de la API o uno genérico. */
  message?: string;
  onRetry?: () => void;
  /**
   * `block` (por defecto): recuadro centrado con rótulo, para una vista o sección entera.
   * `inline`: icono + texto + «Reintentar» opcional, compacto; es un `<span>` y cabe dentro de una frase.
   */
  variant?: "block" | "inline";
  className?: string;
}

export function ErrorState({ error, message: custom, onRetry, variant = "block", className }: ErrorStateProps) {
  // Solo los errores de la API traen un mensaje pensado para el usuario; los demás pueden exponer detalles internos.
  const message = custom ?? (error instanceof ApiError ? error.message : "No se pudo cargar la información. Revise la conexión e inténtelo de nuevo.");
  if (variant === "inline") {
    return (
      <span role="alert" className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fail", className)}>
        <CircleAlert aria-hidden className="size-4 shrink-0" />
        <span>{message}</span>
        {onRetry ? (
          <Button variant="link" size="sm" className="px-1" onClick={onRetry}>
            Reintentar
          </Button>
        ) : null}
      </span>
    );
  }
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-2 rounded-lg border border-fail/30 bg-fail-soft p-6 text-center", className)}>
      <CircleAlert aria-hidden className="size-6 text-fail" />
      <p className="font-medium text-fail">No se pudo cargar</p>
      <p className="max-w-md text-sm text-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
