import { ACCEPTED_FORMATS, MAX_FILE_BYTES, formatFromName } from "@/schemas/project";
import { formatBytes } from "@/lib/format";
import type { AcceptedFile, RejectedFile } from "./types";

export const ACCEPT_ATTR = ACCEPTED_FORMATS.map((f) => `.${f.toLowerCase()}`).join(",");
export const FORMATS_TEXT = "PDF, DWG, DXF o IFC";

export function validatePlanFile(file: File): { ok: true; file: AcceptedFile } | { ok: false; rejected: RejectedFile } {
  const format = formatFromName(file.name);
  if (!format) {
    return { ok: false, rejected: { name: file.name, reason: `Formato no admitido. Use ${FORMATS_TEXT}.` } };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, rejected: { name: file.name, reason: `Pesa ${formatBytes(file.size)}; el máximo es ${formatBytes(MAX_FILE_BYTES)}.` } };
  }
  if (file.size === 0) {
    return { ok: false, rejected: { name: file.name, reason: "El archivo está vacío." } };
  }
  return { ok: true, file: { name: file.name, size: file.size, format, file } };
}

export function partitionFiles(files: File[]): { accepted: AcceptedFile[]; rejected: RejectedFile[] } {
  const accepted: AcceptedFile[] = [];
  const rejected: RejectedFile[] = [];
  for (const f of files) {
    const r = validatePlanFile(f);
    if (r.ok) accepted.push(r.file);
    else rejected.push(r.rejected);
  }
  return { accepted, rejected };
}
