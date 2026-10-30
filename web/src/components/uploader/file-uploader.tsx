"use client";

import { useRef, useState } from "react";
import { CircleX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dropzone, type TextosZona } from "./dropzone";
import { UploadItemRow } from "./upload-item";
import { ACCEPT_ATTR, partitionFiles } from "./validate";
import type { AcceptedFile, RejectedFile, UploadItem } from "./types";

export interface FileUploaderProps {
  items: UploadItem[];
  onAdd: (files: AcceptedFile[]) => void;
  onRemove: (id: string) => void;
  onReplace: (id: string, file: AcceptedFile) => void;
  /** Mensaje para lectores de pantalla (inicio y fin de cada carga). */
  announcement?: string;
  disabled?: boolean;
  className?: string;
  /** Textos de la zona y nombre de la lista (por defecto, los de los planos). */
  textos?: TextosZona & { lista: string };
  compacta?: boolean;
}

/** Carga de planos: valida formato y tamaño antes de subir; la subida la hace quien lo usa. */
export function FileUploader({ items, onAdd, onRemove, onReplace, announcement = "", disabled, className, textos, compacta }: FileUploaderProps) {
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);

  const handleFiles = (files: File[]) => {
    const { accepted, rejected: bad } = partitionFiles(files);
    setRejected(bad);
    if (accepted.length) onAdd(accepted);
  };
  const handleReplace = (files: File[]) => {
    const id = replaceTarget.current;
    replaceTarget.current = null;
    if (!id || !files[0]) return;
    const { accepted, rejected: bad } = partitionFiles([files[0]]);
    setRejected(bad);
    if (accepted[0]) onReplace(id, accepted[0]);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <Dropzone onFiles={handleFiles} disabled={disabled} textos={textos} compacta={compacta} />
      {rejected.length ? (
        <ul role="alert" className="flex flex-col gap-1 rounded-md border border-fail/30 bg-fail-soft px-4 py-3 text-sm">
          {rejected.map((r) => (
            <li key={r.name} className="flex items-start gap-2">
              <CircleX aria-hidden className="mt-0.5 size-4 shrink-0 text-fail" />
              <span>
                <span className="font-medium">«{r.name}»</span>: {r.reason}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {items.length ? (
        <ul aria-label={textos?.lista ?? "Planos cargados"} className="rounded-lg border bg-card">
          {items.map((item) => (
            <UploadItemRow
              key={item.id}
              item={item}
              onRemove={() => onRemove(item.id)}
              onReplace={() => {
                replaceTarget.current = item.id;
                replaceInput.current?.click();
              }}
            />
          ))}
        </ul>
      ) : null}
      <input
        ref={replaceInput}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="plan-replace-input"
        onChange={(e) => {
          handleReplace(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
