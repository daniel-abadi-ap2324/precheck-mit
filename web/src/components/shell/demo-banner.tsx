"use client";

import { usePathname } from "next/navigation";
import { FlaskConical, Scale } from "lucide-react";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/** Expediente real (/projects/exp-…): sus datos no son de demostración, pero el resultado sigue sin ser oficial. */
const EXPEDIENTE = /^\/projects\/exp-[^/]+/;

export function DemoBanner() {
  const expediente = EXPEDIENTE.test(usePathname() ?? "");
  const Icon = expediente ? Scale : FlaskConical;
  return (
    <div
      role="note"
      className={cn(
        "flex items-center justify-center gap-2 border-b px-3 py-1 text-xs",
        expediente ? "border-info/30 bg-info-soft text-info" : "border-warning/30 bg-warning-soft text-warning",
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      <span className="text-foreground">{expediente ? brand.expedienteNotice : brand.demoNotice}</span>
    </div>
  );
}
