import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { draftCollection, MapViewer, type MapFocus } from "./map-viewer";

// MapLibre no funciona en jsdom: un mapa falso que registra fitBounds, flyTo y los datos de cada fuente.
const fake = vi.hoisted(() => ({
  fitBounds: [] as unknown[][],
  flyTo: [] as unknown[][],
  data: new Map<string, GeoJSON.FeatureCollection>(),
  load: [] as (() => void)[],
  handlers: new Map<string, ((e: unknown) => void)[]>(),
  dblZoom: { disable: vi.fn(), enable: vi.fn() },
}));
vi.mock("maplibre-gl", () => {
  class FakeMap {
    constructor() {
      return new Proxy(this, { get: (t, k) => (k in t ? t[k as keyof FakeMap] : () => undefined) });
    }
    on(ev: string, fn: (e?: unknown) => void) {
      if (ev === "load") fake.load.push(fn as () => void);
      fake.handlers.set(ev, [...(fake.handlers.get(ev) ?? []), fn]);
    }
    queryRenderedFeatures() {
      return [{ properties: { id: "PAR-081400" } }];
    }
    getLayer() {
      return true;
    }
    getSource(id: string) {
      return { setData: (d: GeoJSON.FeatureCollection) => fake.data.set(id, d) };
    }
    fitBounds(...a: unknown[]) {
      fake.fitBounds.push(a);
    }
    flyTo(...a: unknown[]) {
      fake.flyTo.push(a);
    }
    getBounds() {
      return { getWest: () => -79.6, getSouth: () => 8.9, getEast: () => -79.4, getNorth: () => 9.1 };
    }
    getZoom() {
      return 11;
    }
    getCanvas() {
      return { style: {} };
    }
    getContainer() {
      return document.createElement("div");
    }
    get doubleClickZoom() {
      return fake.dblZoom;
    }
  }
  class Control {}
  return { Map: FakeMap, NavigationControl: Control, ScaleControl: Control, AttributionControl: Control, setWorkerUrl: () => undefined };
});

function renderLoaded(focus: MapFocus | null) {
  const view = render(<MapViewer focus={focus} />);
  act(() => fake.load.forEach((fn) => fn()));
  return view;
}
const searchPoint = () => fake.data.get("search-point")?.features ?? [];

describe("MapViewer: encuadre pedido desde fuera", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    fake.fitBounds.length = 0;
    fake.flyTo.length = 0;
    fake.data.clear();
    fake.load.length = 0;
    fake.handlers.clear();
    fake.dblZoom.disable.mockClear();
    fake.dblZoom.enable.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("encuadra una caja sin marcar punto, y vuela a un punto marcándolo", () => {
    const view = renderLoaded({ key: "corr-080809", bbox: [-79.52, 8.98, -79.49, 9.0] });
    expect(fake.fitBounds).toEqual([[[[-79.52, 8.98], [-79.49, 9.0]], { padding: 48, maxZoom: 16, duration: 600 }]]);
    expect(searchPoint()).toEqual([]);

    view.rerender(<MapViewer focus={{ key: "dir-W1", point: [-79.52, 8.99], zoom: 17 }} />);
    expect(fake.flyTo).toEqual([[{ center: [-79.52, 8.99], zoom: 17, duration: 800 }]]);
    expect(searchPoint().map((f) => f.geometry)).toEqual([{ type: "Point", coordinates: [-79.52, 8.99] }]);
  });

  it("no repite el encuadre con la misma clave y quita el marcador sin foco", () => {
    const view = renderLoaded({ key: "dir-W1", point: [-79.52, 8.99] });
    view.rerender(<MapViewer focus={{ key: "dir-W1", point: [-79.52, 8.99] }} />);
    expect(fake.flyTo).toHaveLength(1);
    view.rerender(<MapViewer focus={null} />);
    expect(searchPoint()).toEqual([]);
  });

  it("en modo dibujo, un clic agrega un vértice en lugar de seleccionar el lote bajo el cursor", () => {
    const onAddPoint = vi.fn();
    const onSelectParcel = vi.fn();
    const view = render(<MapViewer drawing={{ points: [], onAddPoint }} onSelectParcel={onSelectParcel} />);
    act(() => fake.load.forEach((fn) => fn()));
    const click = (lng: number, lat: number) => fake.handlers.get("click")?.forEach((fn) => fn({ lngLat: { lng, lat }, point: { x: 0, y: 0 } }));
    act(() => click(-79.5, 9.0));
    expect(onAddPoint).toHaveBeenCalledWith([-79.5, 9.0]);
    expect(onSelectParcel).not.toHaveBeenCalled();

    const puntos: [number, number][] = [[-79.5, 9.0], [-79.49, 9.0], [-79.49, 9.01]];
    view.rerender(<MapViewer drawing={{ points: puntos, onAddPoint }} onSelectParcel={onSelectParcel} />);
    expect(fake.data.get("draft")).toEqual(draftCollection(puntos));
    expect(draftCollection(puntos).features.map((f) => f.geometry.type)).toEqual(["Polygon", "LineString", "Point", "Point", "Point"]);

    // Fuera del modo dibujo, el clic vuelve a seleccionar lotes y el borrador se vacía.
    view.rerender(<MapViewer drawing={null} onSelectParcel={onSelectParcel} />);
    act(() => click(-79.5, 9.0));
    expect(onSelectParcel).toHaveBeenCalledWith("PAR-081400");
    expect(fake.data.get("draft")?.features).toEqual([]);
  });

  it("mientras se dibuja, el doble clic no acerca el mapa (evita vértices duplicados); al salir se reactiva", () => {
    const view = render(<MapViewer drawing={{ points: [], onAddPoint: vi.fn() }} />);
    act(() => fake.load.forEach((fn) => fn()));
    expect(fake.dblZoom.disable).toHaveBeenCalled();
    view.rerender(<MapViewer drawing={null} />);
    expect(fake.dblZoom.enable).toHaveBeenCalled();
  });
});
