import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { LECTOR_OCR_POR_DEFECTO, type LectorOcr } from "@/lib/lector-ocr";
import type { PlanFormat } from "@/types";

/** Dos pasos: se sube el PDF y se confirma solo lo que la lectura no pudo comprobar. */
export const WIZARD_STEPS = ["upload", "run"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface WizardFile {
  id: string;
  name: string;
  size: number;
  format: PlanFormat;
  progress: number;
  status: "queued" | "uploading" | "uploaded" | "failed";
  error?: string;
  /** Plano creado en el servidor; en un PDF, su lectura se consulta con este id. */
  planId?: string;
  /** Documento complementario (memoria, cuadro de áreas, carta…): se lee, pero no es el plano que evalúa el motor. */
  complementario?: boolean;
}

interface WizardState {
  step: WizardStep;
  /** Lector OCR del recuadro de datos de las hojas escaneadas (se elige antes de subir). */
  ocr: LectorOcr;
  files: WizardFile[];
  projectId: string | null;
  precheckId: string | null;
  /** Cuadro de datos del anteproyecto (paso 0): lo escrito por clave del hecho, tal cual. */
  cuadroDatos: Record<string, string>;
  /** Zonificación que el arquitecto definió al 100 % (variables definidas); vacía = se lee del plano. */
  zonaDefinida: string;
  setStep: (s: WizardStep) => void;
  setOcr: (ocr: LectorOcr) => void;
  upsertFile: (f: WizardFile) => void;
  removeFile: (id: string) => void;
  setRun: (projectId: string, precheckId: string) => void;
  setCuadroDato: (clave: string, texto: string) => void;
  setZonaDefinida: (zona: string) => void;
  reset: () => void;
}

const initial = { step: "upload" as WizardStep, ocr: LECTOR_OCR_POR_DEFECTO, files: [], projectId: null, precheckId: null, cuadroDatos: {}, zonaDefinida: "" };

export const useWizardStore = create<WizardState>()(
  persist(
    (set) => ({
      ...initial,
      setStep: (step) => set({ step }),
      setOcr: (ocr) => set({ ocr }),
      upsertFile: (f) => set((s) => ({ files: s.files.some((x) => x.id === f.id) ? s.files.map((x) => (x.id === f.id ? f : x)) : [...s.files, f] })),
      removeFile: (id) => set((s) => ({ files: s.files.filter((x) => x.id !== id) })),
      setRun: (projectId, precheckId) => set({ projectId, precheckId }),
      setCuadroDato: (clave, texto) => set((s) => ({ cuadroDatos: { ...(s.cuadroDatos ?? {}), [clave]: texto } })),
      setZonaDefinida: (zonaDefinida) => set({ zonaDefinida }),
      reset: () => set(initial),
    }),
    { name: "mp-wizard-v2", storage: createJSONStorage(() => sessionStorage) },
  ),
);
