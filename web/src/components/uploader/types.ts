import type { PlanFormat } from "@/types";

export type UploadStatus = "queued" | "uploading" | "uploaded" | "failed";

/** Elemento de la lista de carga (compatible con WizardFile). */
export interface UploadItem {
  id: string;
  name: string;
  size: number;
  format: PlanFormat;
  progress: number;
  status: UploadStatus;
  error?: string;
}

/** Archivo que pasó la validación de formato y tamaño. */
export interface AcceptedFile {
  name: string;
  size: number;
  format: PlanFormat;
  file: File;
}

export interface RejectedFile {
  name: string;
  reason: string;
}
