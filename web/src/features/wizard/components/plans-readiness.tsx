import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { toneClasses } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { LecturaPlano } from "../hooks/use-plans-readiness";

/** Lista corta del estado de lectura de cada PDF: icono + color + texto (nunca solo color). */
export function PlansReadiness({ planos }: { planos: LecturaPlano[] }) {
  if (!planos.length) return null;
  return (
    <ul aria-label="Lectura de los planos" className="flex flex-col gap-1.5 text-sm">
      {planos.map((p) => {
        const listo = p.status === "ready";
        const fallo = p.status === "failed";
        const Icon = listo ? CircleCheck : fallo ? CircleX : LoaderCircle;
        const tono = toneClasses[listo ? "pass" : fallo ? "fail" : "processing"];
        const texto = listo ? "leído" : fallo ? `no se pudo leer${p.error ? `: ${p.error}` : ""}` : "leyendo… (los escaneados tardan varios minutos)";
        return (
          <li key={p.planId} className="flex min-w-0 items-start gap-2">
            <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tono.text, !listo && !fallo && "animate-spin motion-reduce:animate-none")} />
            <span className="min-w-0">
              <span className="font-medium break-words">{p.fileName}</span> · {texto}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
