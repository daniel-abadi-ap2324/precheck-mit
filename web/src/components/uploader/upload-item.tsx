"use client";

import { CircleCheck, CircleX, Clock, FileText, LoaderCircle, RefreshCw, Trash2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UploadItem, UploadStatus } from "./types";

const STATUS: Record<UploadStatus, { label: string; icon: LucideIcon; className: string }> = {
  queued: { label: "En cola", icon: Clock, className: "text-ink-muted" },
  uploading: { label: "Cargando", icon: LoaderCircle, className: "text-processing" },
  uploaded: { label: "Cargado", icon: CircleCheck, className: "text-pass" },
  failed: { label: "Error", icon: CircleX, className: "text-fail" },
};

interface UploadItemRowProps {
  item: UploadItem;
  onRemove: () => void;
  onReplace: () => void;
}

export function UploadItemRow({ item, onRemove, onReplace }: UploadItemRowProps) {
  const meta = STATUS[item.status];
  const Icon = meta.icon;
  const busy = item.status === "uploading" || item.status === "queued";
  return (
    <li className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0" aria-label={`${item.name}, ${meta.label}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium" title={item.name}>
          {item.name}
        </span>
        <span className="rounded border px-1.5 py-px text-xs font-medium text-ink-muted">{item.format}</span>
        <span className="tabular text-sm text-muted-foreground">{formatBytes(item.size)}</span>
        <span className={cn("inline-flex items-center gap-1 text-sm font-medium", meta.className)}>
          <Icon aria-hidden className={cn("size-4", item.status === "uploading" && "animate-spin motion-reduce:animate-none")} />
          {meta.label}
        </span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onReplace} disabled={busy} aria-label={`Reemplazar ${item.name}`}>
            <RefreshCw aria-hidden />
            Reemplazar
          </Button>
          <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Quitar ${item.name}`}>
            <Trash2 aria-hidden />
            Quitar
          </Button>
        </div>
      </div>
      {item.status === "failed" ? (
        <p className="text-sm text-fail">{item.error ?? "No se pudo cargar el archivo."}</p>
      ) : item.status !== "uploaded" ? (
        <Progress value={item.progress} aria-label={`Progreso de carga de ${item.name}`} />
      ) : null}
    </li>
  );
}
