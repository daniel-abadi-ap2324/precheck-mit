import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { ApiError, api } from "@/services/api";
import type { Parcel, ZonePolygon } from "@/types";
import { ZoneInfoPanel } from "./zone-info-panel";
import { ParcelContext } from "./parcel-context";

const zona = (p: Partial<ZonePolygon>): ZonePolygon => ({ id: "DGZ-5-5E-0004", codigo: "1ZM5 / 1ZM6", codigos: ["1ZM5 / 1ZM6"], codigo_ficha: "ZM6", familia: "mixta", estado: "ok", hoja: "5-5E", fecha_hoja: "Octubre 2025", area_m2: 1000, ...p });

describe("ZoneInfoPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("un rótulo doble (uso actual / uso futuro) se marca «Requiere revisión»", async () => {
    renderWithProviders(<ZoneInfoPanel zone={zona({})} onClose={vi.fn()} />);
    const nota = (await screen.findByText(/Rótulo doble/)).closest("[role=note]") as HTMLElement;
    expect(nota).toHaveTextContent(/^Requiere revisión\. Rótulo doble \(uso actual \/ uso futuro\)\. Se muestra la ficha ZM6; el revisor confirma la norma aplicable\.$/);
    expect(nota.className).toMatch(/\bbg-manual-soft\b/);
  });

  it("si no cargan las fichas, muestra el error con reintento en vez de quedarse cargando", async () => {
    vi.spyOn(api, "listZonings").mockRejectedValue(new ApiError("zonas.no_disponible", "No se pudieron cargar las fichas."));
    renderWithProviders(<ZoneInfoPanel zone={zona({ codigo: "1ZM6", codigos: ["1ZM6"] })} onClose={vi.fn()} />);
    expect(await screen.findByText("No se pudieron cargar las fichas.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("ParcelContext", () => {
  afterEach(() => vi.restoreAllMocks());
  const parcel = { id: "PAR-081400", finca: "1", areaM2: 1, zoningCode: "RM-2", landUse: "x", centroid: [-79.53, 8.99], geometry: { type: "Polygon", coordinates: [[[-79.53, 8.99], [-79.529, 8.99], [-79.529, 8.991], [-79.53, 8.99]]] }, district: "Panamá", corregimiento: "Betania", address: "x" } as Parcel;

  it("si una capa no carga, lo dice: no afirma «fuera del distrito» ni «fuera del índice»", async () => {
    vi.spyOn(api, "getGisLayer").mockRejectedValue(new ApiError("gis.capa", "No se pudo cargar una capa del mapa."));
    renderWithProviders(<ParcelContext parcel={parcel} />);
    expect(await screen.findAllByText("no se pudo cargar la capa")).toHaveLength(2);
    expect(screen.queryByText(/fuera de los límites del distrito/)).not.toBeInTheDocument();
    expect(screen.queryByText(/fuera del índice de hojas/)).not.toBeInTheDocument();
  });
});
