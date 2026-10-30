import { CircleCheck, CircleX, LoaderCircle, Upload, type LucideIcon } from "lucide-react";
import type { Plan } from "@/types";
import { toneClasses, type Tone } from "@/lib/status";
import { cn } from "@/lib/utils";

const META: Record<Plan["status"], { label: string; icon: LucideIcon; tone: Tone }> = {
  uploading: { label: "Cargando", icon: Upload, tone: "processing" },
  uploaded: { label: "Cargado", icon: CircleCheck, tone: "neutral" },
  processing: { label: "Leyendo", icon: LoaderCircle, tone: "processing" },
  ready: { label: "Listo", icon: CircleCheck, tone: "pass" },
  failed: { label: "Falló", icon: CircleX, tone: "fail" },
};

export function PlanStatus({ status }: { status: Plan["status"] }) {
  const m = META[status];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", toneClasses[m.tone].text)}>
      <Icon aria-hidden className="size-4" />
      {m.label}
    </span>
  );
}
