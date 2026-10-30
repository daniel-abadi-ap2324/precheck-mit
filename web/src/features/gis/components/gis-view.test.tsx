import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MapViewerProps } from "@/components/map";
import { renderWithProviders } from "@/test/render";
import { useGisStore } from "../store";
import { GisView } from "./gis-view";

const replace = vi.fn();
const router = { replace, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/map",
  useSearchParams: () => new URLSearchParams(),
}));

// MapLibre no funciona en jsdom: un stub que informa una vista (zoom `viewZoom`) al montarse y dibuja un botón
// por parcela y por polígono de zona visibles, y otro que simula un clic en un punto vacío del mapa.
let viewZoom = 16;
vi.mock("@/components/map", async () => {
  const { useEffect } = await import("react");
  return {
    MapViewer: ({ parcels, zoning, focus, onSelectParcel, onSelectZone, onSelectLocation, onViewportChange, ariaLabel }: MapViewerProps) => {
      useEffect(() => onViewportChange?.({ bounds: [-79.6, 8.9, -79.5, 9.05], zoom: viewZoom }), [onViewportChange]);
      return (
        <div role="region" aria-label={ariaLabel} data-focus={focus ? JSON.stringify(focus) : undefined}>
          {parcels?.features.map((f) => {
            const id = String(f.properties?.id);
            return (
              <button key={id} type="button" onClick={() => onSelectParcel?.(id)}>
                Mapa {id}
              </button>
            );
          })}
          {zoning?.features.map((f) => {
            const id = String(f.properties?.id);
            return (
              <button key={id} type="button" onClick={() => onSelectZone?.(id)}>
                Zona {id}
              </button>
            );
          })}
          <button type="button" onClick={() => onSelectLocation?.([-79.55, 8.99])}>
            Punto en 10-3B
          </button>
          <button type="button" onClick={() => onSelectLocation?.([-79.45, 8.99])}>
            Punto en 10-4A
          </button>
        </div>
      );
    },
  };
});

// Extractos de public/data (dgz/ y base/) servidos por fetch.
const square: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
const zone = (props: Record<string, unknown>): GeoJSON.Feature => ({ type: "Feature", geometry: square, properties: { hoja: "10-3B", fecha_hoja: "Octubre 2023", area_m2: 93548.6, ...props } });
const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const box = (x0: number, y0: number, x1: number, y1: number): GeoJSON.Polygon => ({ type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const SHEET_10_3B = fc([
  zone({ id: "DGZ-10-3B-0006", codigo: "1RM-2", codigos: ["1RM-2"], codigo_ficha: "RM-2", familia: "residencial_alta", estado: "ok" }),
  zone({ id: "DGZ-10-3B-0100", codigo: "MP-C2", codigos: ["MP-C2"], codigo_ficha: "MP-C2", familia: "miviot", estado: "ok" }),
  zone({ id: "DGZ-10-3B-0200", codigo: null, codigos: [], codigo_ficha: null, familia: "sin_etiqueta", estado: "sin_etiqueta" }),
]);
const SHEET_5_5D = fc([zone({ id: "DGZ-5-5D-0000", codigo: "1ZM7", codigos: ["1ZM7"], codigo_ficha: "ZM7", familia: "mixta", estado: "ok", hoja: "5-5D", fecha_hoja: "Octubre 2025" })]);
const PDF_10_3B = "https://dpu.mupa.gob.pa/wp-content/uploads/2025/03/10-3B-121223.pdf";
const INDEX = {
  generado_desde: "Documento Gráfico de Zonificación (Anexo 6 del PLOT), DPU",
  hojas: [
    { hoja: "10-3B", escala: "1:10.000", pdf: PDF_10_3B, fecha_hoja: "Octubre 2023", bbox: [-79.5914, 8.9689, -79.5136, 9.0148], poligonos: 898, por_estado: { ok: 346, sin_etiqueta: 541, conflicto: 11 } },
    { hoja: "5-5D", escala: "1:5.000", pdf: null, fecha_hoja: "Octubre 2025", bbox: [-79.52, 8.98, -79.5, 9.0], poligonos: 1, por_estado: { ok: 1, sin_etiqueta: 0, conflicto: 0 } },
  ],
};
const MOSAICO = fc([
  { type: "Feature", properties: { hoja: "10-3B", escala: "1:10.000", serie: 10, pdf: PDF_10_3B }, geometry: box(-79.5914, 8.9689, -79.5136, 9.0148) },
  { type: "Feature", properties: { hoja: "5-5D", escala: "1:5.000", serie: 5, pdf: null }, geometry: box(-79.52, 8.98, -79.5, 9.0) },
  { type: "Feature", properties: { hoja: "10-4A", escala: "1:10.000", serie: 10, pdf: "https://dpu.mupa.gob.pa/10-4A.pdf" }, geometry: box(-79.5, 8.95, -79.4, 9.0) },
]);
const CORREGIMIENTOS = fc([
  { type: "Feature", properties: { id: "080806", nombre: "Betania", distrito: "Panamá", provincia: "Panamá", area_ha: 823.5, cabecera: "No", etiqueta: [-79.53, 9.01] }, geometry: box(-79.6, 8.98, -79.5, 9.03) },
]);
// Un río a unos 34 m del borde este del lote PAR-081400.
const RIOS = fc([{ type: "Feature", properties: { tipo: "Río" }, geometry: { type: "LineString", coordinates: [[-79.5301, 8.99], [-79.5301, 9.0]] } }]);
const DISTRITO = fc([{ type: "Feature", properties: { nombre: "Distrito de Panamá" }, geometry: box(-79.7, 8.9, -79.1, 9.4) }]);
const VIA_ESPANA = [{ id: "osm-W7", label: "Vía España", detail: "Bella Vista", point: [-79.55, 8.99] }];
const ROUTES: Record<string, unknown> = {
  "/data/dgz/index.json": INDEX,
  "/data/dgz/10-3B.geojson": SHEET_10_3B,
  "/data/dgz/5-5D.geojson": SHEET_5_5D,
  "/data/base/mosaico.geojson": MOSAICO,
  "/data/base/corregimientos.geojson": CORREGIMIENTOS,
  "/data/base/rios.geojson": RIOS,
  "/data/base/distrito.geojson": DISTRITO,
  "/data/base/oceano.geojson": fc([]),
};

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.startsWith("/api/geocodificar?")
        ? new URLSearchParams(url.split("?")[1]).get("q") === "Via Espana"
          ? new Response(JSON.stringify({ items: VIA_ESPANA }))
          : new Response(JSON.stringify({ code: "gis.geocodificador_no_disponible" }), { status: 502 })
        : url in ROUTES
          ? new Response(JSON.stringify(ROUTES[url]))
          : new Response("", { status: 404 }),
    ),
  );
});

vi.mock("../hooks/use-media-query", () => ({ useIsDesktop: () => true, useMediaQuery: () => true }));

async function expectLotPanel() {
  const panel = await screen.findByRole("region", { name: "Información del lote" });
  const p = within(panel);
  expect(await p.findByText("ID del lote")).toBeInTheDocument();
  expect(p.getAllByText("PAR-081400").length).toBeGreaterThan(0);
  expect(p.getByText("083076")).toBeInTheDocument();
  expect(p.getByText("RM-2")).toBeInTheDocument();
  expect(p.getByText("Lo establecido ó 5m")).toBeInTheDocument();
  expect(p.getAllByText("Según ficha")).toHaveLength(2);
  expect(p.getByText(/Anexo 4, ficha RM-2, pág\. 11/)).toBeInTheDocument();
  expect(await p.findByText(/Documento Gráfico, Hoja 10-3B · Octubre 2023 · rótulo 1RM-2, polígono DGZ-10-3B-0006/)).toBeInTheDocument();
  expect(p.getByRole("link", { name: /Nuevo PreCheck en este lote/ })).toHaveAttribute("href", "/projects/new?parcel=PAR-081400");
  return panel;
}

describe("GisView", { timeout: 15_000 }, () => {
  beforeEach(() => {
    useGisStore.getState().reset();
    replace.mockClear();
    viewZoom = 16;
  });

  it("selecciona un lote desde la lista de resultados de búsqueda (teclado)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GisView initialParcelId={null} />);
    const input = screen.getByRole("combobox", { name: /Dirección, corregimiento, hoja/ });
    await user.type(input, "PAR-081400");
    const option = await screen.findByRole("option", { name: /PAR-081400 · Finca 083076/ });
    expect(option).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    await expectLotPanel();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/map?parcel=PAR-081400", { scroll: false }));
  });

  it("selecciona un lote desde el mapa y lo cierra con Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GisView initialParcelId={null} />);
    await user.click(await screen.findByRole("button", { name: "Mapa PAR-081400" }));
    await expectLotPanel();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("region", { name: "Información del lote" })).not.toBeInTheDocument());
    expect(useGisStore.getState().selectedParcelId).toBeNull();
  });

  it("abre el lote indicado en ?parcel= y filtra la zonificación por familia", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GisView initialParcelId="PAR-081400" />);
    await expectLotPanel();
    await screen.findByRole("button", { name: "Zona DGZ-10-3B-0100" });
    const filters = screen.getByRole("group", { name: "Familia de zona" });
    await user.click(within(filters).getByRole("checkbox", { name: /Zona mixta/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Zona DGZ-10-3B-0100" })).not.toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: /^Zona / }).map((b) => b.textContent)).toEqual(["Zona DGZ-5-5D-0000"]);
    // Los lotes de demostración no dependen del filtro de familia.
    expect(screen.getByRole("button", { name: "Mapa PAR-081400" })).toBeInTheDocument();
    expect(screen.getByText(/1 de 4 polígonos de zona/)).toBeInTheDocument();
  });

  it("muestra la leyenda por familia y claves que no parecen casillas", async () => {
    renderWithProviders(<GisView initialParcelId={null} />);
    await screen.findByRole("button", { name: "Zona DGZ-10-3B-0100" });
    const legend = screen.getByRole("list", { name: "Leyenda de zonificación" });
    expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Residencial de alta densidad",
      "Zona mixta",
      "Norma del MIVIOT (sin ficha del PLOT)",
      "Sin código en la hoja",
    ]);
    const on = ["Mapa base", "Océano y límite distrital", "Corregimientos", "Ríos", "Hojas del Documento Gráfico", "Zonificación", "Lotes (demostración y declarados)", "Proyectos"];
    for (const name of on) expect(screen.getByRole("checkbox", { name })).toBeChecked();
    for (const name of ["Uso de suelo", "Infraestructura"]) expect(screen.getByRole("checkbox", { name })).not.toBeChecked();
    expect(await screen.findByText("2 de 3 hojas vectorizadas")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Leyenda de hojas" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Hoja vectorizada",
      "Hoja pendiente de vectorizar",
    ]);
  });

  it("al elegir una zona PLOT muestra la ficha con su página y la nota referencial", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GisView initialParcelId={null} />);
    await user.click(await screen.findByRole("button", { name: "Zona DGZ-5-5D-0000" }));
    const panel = await screen.findByRole("region", { name: "Información de la zona" });
    const p = within(panel);
    expect(p.getAllByText("1ZM7").length).toBeGreaterThan(0);
    expect(p.getByText("5-5D · Octubre 2025")).toBeInTheDocument();
    expect(await p.findByText("2,000 pers/ha")).toBeInTheDocument();
    expect(p.getByText("80% o según retiros en PB+2")).toBeInTheDocument();
    expect(p.getByText(/ficha ZM7, pág\. 19/)).toBeInTheDocument();
    expect(p.getByText(/sólo a manera de referencia/)).toBeInTheDocument();
    expect(useGisStore.getState().selectedParcelId).toBeNull();
  });

  it("una zona del MIVIOT o sin código va a revisión y no muestra ficha", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GisView initialParcelId={null} />);
    await user.click(await screen.findByRole("button", { name: "Zona DGZ-10-3B-0100" }));
    let panel = await screen.findByRole("region", { name: "Información de la zona" });
    expect(await within(panel).findByText(/Norma del MIVIOT no cargada: los resultados que dependan de esta zona van a revisión/)).toBeInTheDocument();
    expect(within(panel).queryByText(/Densidad máxima/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Zona DGZ-10-3B-0200" }));
    panel = await screen.findByRole("region", { name: "Información de la zona" });
    expect(await within(panel).findByText(/Polígono sin código único en la hoja: requiere revisión/)).toBeInTheDocument();
    expect(within(panel).getByText(/sólo a manera de referencia/)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("region", { name: "Información de la zona" })).not.toBeInTheDocument());
  });

  it("carga solo las hojas de la vista y lo indica en el chip de estado", async () => {
    renderWithProviders(<GisView initialParcelId={null} />);
    expect(await screen.findByText("Zonificación: 2 hojas cargadas")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Zona / })).toHaveLength(4);
  });

  it("a zoom bajo no carga zonificación y pide acercar el mapa", async () => {
    viewZoom = 11;
    renderWithProviders(<GisView initialParcelId={null} />);
    expect(await screen.findByText("Acerque el mapa para ver la zonificación")).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /^Zona / })).toHaveLength(0);
  });

  it("la ficha del lote muestra su hoja, el corregimiento del polígono y la marca de río cercano", async () => {
    renderWithProviders(<GisView initialParcelId="PAR-081400" />);
    const panel = await expectLotPanel();
    const p = within(panel);
    expect(await p.findByText("Betania")).toBeInTheDocument();
    expect(p.getByText("(capa distrito8v4)", { exact: false })).toBeInTheDocument();
    expect(await p.findByText("10-3B")).toBeInTheDocument();
    const pdf = p.getByRole("link", { name: /Ver PDF/ });
    expect(pdf).toHaveAttribute("href", PDF_10_3B);
    expect(pdf).toHaveAttribute("target", "_blank");
    expect(await p.findByText(/Río a 3\d m: verificar servidumbre fluvial con el MOP \(Acuerdo 110, Art\. 21\.10\)/)).toBeInTheDocument();
  });

  it("un clic fuera de lotes y zonas abre la hoja y el corregimiento del punto", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GisView initialParcelId={null} />);
    await screen.findByText("2 de 3 hojas vectorizadas");
    await user.click(screen.getByRole("button", { name: "Punto en 10-3B" }));
    const panel = await screen.findByRole("region", { name: "Hoja del Documento Gráfico" });
    const p = within(panel);
    expect(p.getByText("Betania")).toBeInTheDocument();
    expect(p.getByText("Octubre 2023")).toBeInTheDocument();
    expect(p.getByText("Sí")).toBeInTheDocument();
    expect(p.getByText("346")).toBeInTheDocument();
    expect(p.getByText("541")).toBeInTheDocument();
    expect(p.getByRole("link", { name: /Ver hoja original \(PDF, DPU\)/ })).toHaveAttribute("rel", "noopener noreferrer");
    expect(p.getByText(/la CEUS|\(CEUS\)/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Punto en 10-4A" }));
    const pending = await screen.findByRole("region", { name: "Hoja del Documento Gráfico" });
    expect(within(pending).getByText("10-4A", { selector: "p" })).toBeInTheDocument();
    expect(within(pending).getByText("No, pendiente")).toBeInTheDocument();
  });
  it("busca un corregimiento, encuadra el mapa en él y muestra la ubicación", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GisView initialParcelId={null} />);
    await user.type(screen.getByRole("combobox", { name: /Dirección, corregimiento, hoja/ }), "betania");
    const option = await screen.findByRole("option", { name: /^Betania\s*Corregimiento/ });
    // Los lotes de demostración de Betania también aparecen, antes del corregimiento.
    await waitFor(() => expect(screen.getAllByRole("option")[0]).toHaveTextContent(/^PAR-/));
    await user.click(option);
    const panel = await screen.findByRole("region", { name: "Hoja del Documento Gráfico" });
    expect(within(panel).getAllByText("Betania").length).toBeGreaterThan(0);
    const map = screen.getByRole("region", { name: /Mapa de lotes/ });
    expect(JSON.parse(map.dataset.focus ?? "{}")).toMatchObject({ key: "corr-080806", bbox: [-79.6, 8.98, -79.5, 9.03] });
  });

  it("busca una hoja del Documento Gráfico por su código", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GisView initialParcelId={null} />);
    await user.type(screen.getByRole("combobox", { name: /Dirección, corregimiento, hoja/ }), "10-4a");
    await user.click(await screen.findByRole("option", { name: /10-4A\s*Hoja/ }));
    const panel = await screen.findByRole("region", { name: "Hoja del Documento Gráfico" });
    expect(within(panel).getAllByText("10-4A").length).toBeGreaterThan(0);
  });

  it("busca una dirección real y marca el punto; si el geocodificador falla, lo dice", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GisView initialParcelId={null} />);
    const input = screen.getByRole("combobox", { name: /Dirección, corregimiento, hoja/ });
    await user.type(input, "Via Espana");
    await user.click(await screen.findByRole("option", { name: /Vía España\s*Dirección · Bella Vista/ }));
    // Al elegir, la lista se cierra pero el estado sigue contando los resultados de la búsqueda.
    const estado = await screen.findByText(/^\d+ resultados?\./, {}, { timeout: 5000 });
    expect(estado.textContent).not.toMatch(/^0 resultados/);
    await screen.findByRole("region", { name: "Hoja del Documento Gráfico" });
    const map = screen.getByRole("region", { name: /Mapa de lotes/ });
    expect(JSON.parse(map.dataset.focus ?? "{}")).toMatchObject({ point: [-79.55, 8.99], zoom: 17 });
    await user.clear(input);
    await user.type(input, "Calle inexistente");
    expect(await screen.findByText(/La búsqueda de direcciones no respondió/)).toBeInTheDocument();
  });
});
