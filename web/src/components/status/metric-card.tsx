import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneClasses, type Tone } from "@/lib/status";

interface MetricCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
}

export function MetricCard({ label, value, hint, icon: Icon, tone = "neutral", className }: MetricCardProps) {
  return (
    <div data-tone={tone} className={cn("flex flex-col gap-1 rounded-lg border bg-card p-4", className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon ? <Icon aria-hidden className={cn("size-4", toneClasses[tone].text)} /> : null}
        <span>{label}</span>
      </div>
      <p className="tabular text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
