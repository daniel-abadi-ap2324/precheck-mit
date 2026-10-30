"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/services/api";
import type { Reviewer } from "@/types";
import { useReviewFlags } from "../stores/review-flags";

const SHEET_ID = "A-101";
const errorToast = () => toast.error("No se pudo guardar. Intente de nuevo.");

/** Acciones del revisor sobre un resultado: comentar, marcar para revisión y asignar revisor. */
export function useReviewActions(precheckId: string, ruleId: string) {
  const flagged = useReviewFlags((s) => s.flagged.includes(ruleId));
  const toggleFlag = useReviewFlags((s) => s.toggle);

  const comment = useMutation({
    mutationFn: (text: string) => api.addAnnotation(precheckId, { resultId: ruleId, sheetId: SHEET_ID, text, kind: "comment" }),
    onSuccess: () => toast.success("Comentario agregado", { description: ruleId }),
    onError: errorToast,
  });

  const flag = useMutation({
    mutationFn: async () => {
      const on = !flagged;
      if (on) await api.addAnnotation(precheckId, { resultId: ruleId, sheetId: SHEET_ID, text: "Marcada para revisión", kind: "review_flag" });
      return on;
    },
    onSuccess: (on) => {
      toggleFlag(ruleId);
      toast.success(on ? "Regla marcada para revisión" : "Se quitó la marca de revisión", { description: ruleId });
    },
    onError: errorToast,
  });

  const assign = useMutation({
    mutationFn: async (reviewer: Reviewer) => {
      await api.assignReviewer(precheckId, reviewer.id);
      return reviewer;
    },
    onSuccess: (reviewer) => toast.success(`Revisor asignado: ${reviewer.name}`),
    onError: errorToast,
  });

  return { flagged, comment, flag, assign };
}
