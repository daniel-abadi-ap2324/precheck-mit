import { create } from "zustand";
import type { MapLayerKey } from "@/components/map";
import { EMPTY_FILTERS, toggleValue, type GisFilters } from "./lib/filter-parcels";

export type GisLayers = Record<MapLayerKey, boolean>;

const DEFAULT_LAYERS: GisLayers = {
  basemap: true,
  boundary: true,
  corregimientos: true,
  rivers: true,
  sheets: true,
  zoning: true,
  parcels: true,
  landUse: false,
  projects: true,
  infrastructure: false,
};

interface GisState {
  selectedParcelId: string | null;
  /** Polígono del Documento Gráfico seleccionado (excluyente con el lote). */
  selectedZoneId: string | null;
  /** Punto [lng, lat] elegido fuera de lotes y zonas: muestra su hoja del Documento Gráfico y su corregimiento. */
  selectedLocation: [number, number] | null;
  layers: GisLayers;
  filters: GisFilters;
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  selectParcel: (id: string | null) => void;
  selectZone: (id: string | null) => void;
  selectLocation: (lngLat: [number, number] | null) => void;
  toggleLayer: (layer: MapLayerKey) => void;
  toggleFamiliaFilter: (familia: string) => void;
  toggleLandUseFilter: (use: string) => void;
  clearFilters: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  reset: () => void;
}

const initial = {
  selectedParcelId: null,
  selectedZoneId: null,
  selectedLocation: null,
  layers: DEFAULT_LAYERS,
  filters: EMPTY_FILTERS,
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
};

/** Estado de la vista GIS. La parcela seleccionada se sincroniza con ?parcel= (use-parcel-url-sync). */
export const useGisStore = create<GisState>()((set) => ({
  ...initial,
  selectParcel: (selectedParcelId) =>
    set((s) => ({ selectedParcelId, selectedZoneId: selectedParcelId ? null : s.selectedZoneId, selectedLocation: selectedParcelId ? null : s.selectedLocation })),
  selectZone: (selectedZoneId) =>
    set((s) => ({ selectedZoneId, selectedParcelId: selectedZoneId ? null : s.selectedParcelId, selectedLocation: selectedZoneId ? null : s.selectedLocation })),
  selectLocation: (selectedLocation) =>
    set((s) => ({
      selectedLocation,
      selectedParcelId: selectedLocation ? null : s.selectedParcelId,
      selectedZoneId: selectedLocation ? null : s.selectedZoneId,
    })),
  toggleLayer: (layer) => set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })),
  toggleFamiliaFilter: (familia) => set((s) => ({ filters: { ...s.filters, familias: toggleValue(s.filters.familias, familia) } })),
  toggleLandUseFilter: (use) => set((s) => ({ filters: { ...s.filters, landUses: toggleValue(s.filters.landUses, use) } })),
  clearFilters: () => set({ filters: EMPTY_FILTERS }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
  reset: () => set(initial),
}));
