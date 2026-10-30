import { create } from "zustand";
import type { ComplianceStatus, RuleCategory } from "@/types";

export type StatusFilter = "ALL" | ComplianceStatus;
export type PlanTool = "select" | "pan" | "measure" | "annotate";
export type MobilePane = "rules" | "plan" | "details";

export interface PlanLayers {
  boundary: boolean;
  building: boolean;
  measurements: boolean;
  annotations: boolean;
  grid: boolean;
}

interface WorkspaceState {
  selectedRuleId: string | null;
  statusFilter: StatusFilter;
  search: string;
  collapsedCategories: RuleCategory[];
  tool: PlanTool;
  layers: PlanLayers;
  mobilePane: MobilePane;
  selectRule: (id: string | null) => void;
  setStatusFilter: (f: StatusFilter) => void;
  setSearch: (s: string) => void;
  toggleCategory: (c: RuleCategory) => void;
  setTool: (t: PlanTool) => void;
  toggleLayer: (l: keyof PlanLayers) => void;
  setMobilePane: (p: MobilePane) => void;
  reset: () => void;
}

const initial = {
  selectedRuleId: null,
  statusFilter: "ALL" as StatusFilter,
  search: "",
  collapsedCategories: [] as RuleCategory[],
  tool: "select" as PlanTool,
  layers: { boundary: true, building: true, measurements: true, annotations: true, grid: true },
  mobilePane: "rules" as MobilePane,
};

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  ...initial,
  selectRule: (id) => set({ selectedRuleId: id, mobilePane: id ? "plan" : "rules" }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setSearch: (search) => set({ search }),
  toggleCategory: (c) =>
    set((s) => ({ collapsedCategories: s.collapsedCategories.includes(c) ? s.collapsedCategories.filter((x) => x !== c) : [...s.collapsedCategories, c] })),
  setTool: (tool) => set({ tool }),
  toggleLayer: (l) => set((s) => ({ layers: { ...s.layers, [l]: !s.layers[l] } })),
  setMobilePane: (mobilePane) => set({ mobilePane }),
  reset: () => set(initial),
}));
