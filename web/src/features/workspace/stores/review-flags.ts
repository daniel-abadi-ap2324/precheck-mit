import { create } from "zustand";

/** Marcas «para revisión» de esta sesión (el backend las guardará como anotaciones `review_flag`). */
interface ReviewFlagsState {
  flagged: string[];
  toggle: (ruleId: string) => boolean;
}

export const useReviewFlags = create<ReviewFlagsState>()((set, get) => ({
  flagged: [],
  toggle: (ruleId) => {
    const on = !get().flagged.includes(ruleId);
    set((s) => ({ flagged: on ? [...s.flagged, ruleId] : s.flagged.filter((id) => id !== ruleId) }));
    return on;
  },
}));
