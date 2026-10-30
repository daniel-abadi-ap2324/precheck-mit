"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/services/api";
import { useWizardStore, type WizardFile } from "@/stores/wizard";
import type { AcceptedFile } from "@/components/uploader";

/**
 * Cargas en curso en esta pestaña (a nivel de módulo: sobreviven si el paso se desmonta).
 * Tras recargar la página quedan vacías, y así se detectan las cargas interrumpidas.
 */
const generation = new Map<string, number>();

const newId = () => `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Sube planos al proyecto del asistente y refleja el avance en el store (persistido). Sin proyecto, `asegurar` lo crea
 * con el nombre del archivo antes de la primera carga. Cada PDF se sube con el lector OCR elegido en el asistente.
 */
export function usePlanUploads(projectId: string | null, asegurar?: (archivo: string) => Promise<string>) {
  const files = useWizardStore((s) => s.files);
  const upsertFile = useWizardStore((s) => s.upsertFile);
  const removeFile = useWizardStore((s) => s.removeFile);
  const [announcement, setAnnouncement] = useState("");

  // Una carga que quedó a medias (recarga de la página) no puede continuar.
  useEffect(() => {
    for (const f of useWizardStore.getState().files) {
      if ((f.status === "uploading" || f.status === "queued") && !generation.has(f.id)) {
        upsertFile({ ...f, status: "failed", error: "La carga se interrumpió. Reemplace o quite el archivo." });
      }
    }
  }, [upsertFile]);

  const patch = (id: string, token: number, changes: Partial<WizardFile>) => {
    if (generation.get(id) !== token) return;
    const current = useWizardStore.getState().files.find((f) => f.id === id);
    if (current) upsertFile({ ...current, ...changes });
  };

  const upload = async (id: string, file: AcceptedFile, complementario = false) => {
    const token = (generation.get(id) ?? 0) + 1;
    generation.set(id, token);
    upsertFile({ id, name: file.name, size: file.size, format: file.format, progress: 0, status: "queued", ...(complementario ? { complementario } : {}) });
    let proyecto = projectId ?? useWizardStore.getState().projectId;
    if (!proyecto && asegurar) proyecto = await asegurar(file.name).catch(() => null);
    if (!proyecto) {
      patch(id, token, { status: "failed", error: "No se pudo crear el proyecto. Inténtelo de nuevo." });
      return;
    }
    patch(id, token, { status: "uploading" });
    setAnnouncement(`Cargando ${file.name}.`);
    try {
      const plan = await api.uploadPlan(proyecto, { name: file.name, size: file.size, format: file.format, file: file.file, ocr: useWizardStore.getState().ocr, ...(complementario ? { complementario } : {}) }, (p) => patch(id, token, { progress: p }));
      patch(id, token, { status: "uploaded", progress: 100, planId: plan.id });
      if (generation.get(id) === token) setAnnouncement(`${file.name} cargado.`);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "No se pudo cargar el archivo. Inténtelo de nuevo.";
      patch(id, token, { status: "failed", error: message });
      setAnnouncement(`Error al cargar ${file.name}.`);
    }
  };

  const discardServerPlan = (id: string) => {
    const planId = useWizardStore.getState().files.find((f) => f.id === id)?.planId;
    if (planId) void api.deletePlan(planId).catch(() => undefined);
  };

  return {
    files,
    announcement,
    add: (accepted: AcceptedFile[], complementario = false) => accepted.forEach((f) => void upload(newId(), f, complementario)),
    replace: (id: string, file: AcceptedFile) => {
      discardServerPlan(id);
      void upload(id, file, Boolean(files.find((f) => f.id === id)?.complementario));
    },
    remove: (id: string) => {
      const name = files.find((f) => f.id === id)?.name ?? "El archivo";
      generation.delete(id);
      discardServerPlan(id);
      removeFile(id);
      setAnnouncement(`${name} quitado.`);
    },
  };
}
