"use client";

import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { FileUp } from "lucide-react";
import { MAX_FILE_BYTES } from "@/schemas/project";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ACCEPT_ATTR, FORMATS_TEXT } from "./validate";

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  /** Textos de la zona: por defecto, los de los planos. */
  textos?: TextosZona;
  /** Más baja (para una zona secundaria, como la de documentos complementarios). */
  compacta?: boolean;
}

export interface TextosZona {
  etiqueta: string;
  titulo: string;
}

const TEXTOS_PLANOS: TextosZona = { etiqueta: "Elegir archivos de planos", titulo: "Arrastre aquí los archivos de planos" };

/** Retícula de papel de plano: la hoja donde «se colocan» los planos. */
const GRID_STYLE = {
  backgroundImage:
    "linear-gradient(var(--mp-plan-grid) 1px, transparent 1px), linear-gradient(90deg, var(--mp-plan-grid) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
};

/** Zona de arrastre. Es un único control: clic, Enter o Espacio abren el selector de archivos. */
export function Dropzone({ onFiles, disabled = false, multiple = true, textos = TEXTOS_PLANOS, compacta = false }: DropzoneProps) {
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const open = () => {
    if (!disabled) inputRef.current?.click();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) onFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-label={textos.etiqueta}
        aria-describedby={hintId}
        onClick={open}
        onKeyDown={onKeyDown}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={GRID_STYLE}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-input bg-plan-paper px-6 text-center transition-colors",
          compacta ? "py-5" : "py-10",
          "hover:border-brand focus-visible:border-brand",
          dragging && "border-brand bg-brand-soft",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-md border bg-card">
          <FileUp aria-hidden className="size-5 text-brand" />
        </span>
        <p className="font-medium">{dragging ? "Suelte los archivos para cargarlos" : textos.titulo}</p>
        <span className="inline-flex h-8 items-center rounded-lg border bg-card px-3 text-sm font-medium" aria-hidden>
          Elegir archivos
        </span>
        <p id={hintId} className="text-sm text-muted-foreground">
          {FORMATS_TEXT}. Hasta {formatBytes(MAX_FILE_BYTES)} por archivo.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={ACCEPT_ATTR}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="plan-file-input"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </>
  );
}
