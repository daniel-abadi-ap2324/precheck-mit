import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Property } from "@/types";
import { PropertyCard } from "./property-card";

const parcel = { id: "DECL-0001", origen: "declarado" as const, finca: "0708195", areaM2: 900, zoningCode: "MP-C2", landUse: "No declarado", centroid: [-79.5, 9] as [number, number], geometry: { type: "Polygon" as const, coordinates: [] }, district: "Panamá", corregimiento: "Pueblo Nuevo", address: "Calle 17" };

describe("PropertyCard", () => {
  it("sin ficha cargada dice por qué y no muestra parámetros de otra zona", () => {
    render(<PropertyCard property={{ parcel, zoning: null, normaZona: "miviot", ceus: null } satisfies Property} />);
    expect(screen.getByText("Zona MP-C2")).toBeInTheDocument();
    expect(screen.getByText(/Zona MP-C2 con norma del MIVIOT, no cargada/)).toBeInTheDocument();
    expect(screen.getAllByText("Requiere revisión").length).toBeGreaterThan(0);
    const nota = screen.getByRole("note");
    expect(nota.className).toMatch(/\bbg-manual-soft\b/);
    expect(nota.querySelector("svg[aria-hidden]")).not.toBeNull();
    expect(screen.queryByText(/Anexo 4/)).not.toBeInTheDocument();
  });

  it("un lote declarado se identifica como dibujado por el profesional, no como catastro", () => {
    render(<PropertyCard property={{ parcel, zoning: null, normaZona: "miviot", ceus: null }} />);
    expect(screen.getByText("Lote declarado")).toBeInTheDocument();
    expect(screen.getByText(/Lote dibujado por el profesional: no es el catastro de la ANATI/)).toBeInTheDocument();
  });

  it("un lote en revisión por tocar varias zonas las lista con su porcentaje", () => {
    const zonasLote = [
      { hoja: "5-5E", poligono: "A", codigo: "1ZM7", estado: "ok" as const, pct: 52 },
      { hoja: "5-5E", poligono: "B", codigo: null, estado: "sin_etiqueta" as const, pct: 48 },
    ];
    render(<PropertyCard property={{ parcel: { ...parcel, zoningCode: "Por revisar", zonasLote }, zoning: null, normaZona: "revision", ceus: null }} />);
    expect(screen.getByText("Zonas del lote: 1ZM7 (52 %) · sin código (48 %)")).toBeInTheDocument();
  });
});
