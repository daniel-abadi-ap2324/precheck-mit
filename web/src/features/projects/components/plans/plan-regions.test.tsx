import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import type { RegionesPlano } from "@/types";
import type { RegionesServidor } from "@/services/planos/regiones";

const servidor = vi.hoisted(() => ({
  leerRegionesPlano: vi.fn(),
  proponerRegionesPlano: vi.fn(),
  guardarRegionesPlano: vi.fn(),
  imagenRegionesUrl: (id: string, n: number) => `/img/${id}/${n}`,
}));
vi.mock("@/services/planos/regiones", () => servidor);
// El editor real pinta la lámina; aquí basta saber si se montó y con qué datos.
vi.mock("@/components/regiones", () => ({
  EditorRegiones: ({ datos }: { datos: RegionesPlano }) => <div data-testid="editor">{`editor ${datos.generado} · ${datos.regiones.length} regiones`}</div>,
}));

import { INTERVALO_MS, PlanRegions } from "./plan-regions";

const REGIONES: RegionesPlano = { version: 1, generado: "g2", paginas: { "1": { imagen: "r1.png", ancho_px: 200, alto_px: 100 } }, regiones: [] };
const respuesta = (propuesta: RegionesServidor["propuesta"], regiones: RegionesPlano | null = null): RegionesServidor => ({ id: "plan-1", propuesta, regiones });

/**
 * Deja correr la consulta y el render que React Query agenda con setTimeout(0) (con el reloj falso, un timeout(0)
 * agendado durante un avance cae en el milisegundo siguiente: por eso 10 ms y no 0).
 */
const vaciar = () => act(() => vi.advanceTimersByTimeAsync(10));

describe("PlanRegions: la propuesta en curso se refresca sola", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    servidor.leerRegionesPlano.mockReset();
    servidor.proponerRegionesPlano.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("consulta cada 3 s mientras propone y deja de consultar al terminar", async () => {
    servidor.leerRegionesPlano
      .mockResolvedValueOnce(respuesta({ status: "processing" }))
      .mockResolvedValueOnce(respuesta({ status: "processing" }))
      .mockResolvedValue(respuesta({ status: "ready" }, REGIONES));
    renderWithProviders(<PlanRegions planId="plan-1" fileName="A-101.pdf" />);
    await vaciar();
    expect(screen.getByRole("status")).toHaveTextContent("Proponiendo regiones…");
    expect(servidor.leerRegionesPlano).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(INTERVALO_MS));
    expect(servidor.leerRegionesPlano).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("Proponiendo regiones…");

    await act(() => vi.advanceTimersByTimeAsync(INTERVALO_MS));
    expect(servidor.leerRegionesPlano).toHaveBeenCalledTimes(3);
    await vaciar();
    expect(screen.queryByText("Proponiendo regiones…")).not.toBeInTheDocument();
    expect(screen.getByTestId("editor")).toHaveTextContent("editor g2 · 0 regiones");

    // Terminada la propuesta, ya no se consulta más.
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(servidor.leerRegionesPlano).toHaveBeenCalledTimes(3);
  });

  it("al proponer, empieza a consultar con lo que responde el servidor y muestra el editor al terminar", async () => {
    servidor.leerRegionesPlano
      .mockResolvedValueOnce(respuesta({ status: "idle" }))
      .mockResolvedValueOnce(respuesta({ status: "processing" }))
      .mockResolvedValue(respuesta({ status: "ready" }, REGIONES));
    servidor.proponerRegionesPlano.mockResolvedValue({ propuesta: { status: "processing", vision: false } });
    renderWithProviders(<PlanRegions planId="plan-1" fileName="A-101.pdf" />);
    await vaciar();
    fireEvent.click(screen.getByRole("button", { name: "Proponer regiones" }));
    await vaciar();
    expect(servidor.proponerRegionesPlano).toHaveBeenCalledWith("plan-1", false);
    expect(screen.getByRole("status")).toHaveTextContent("Proponiendo regiones…");
    expect(servidor.leerRegionesPlano).toHaveBeenCalledTimes(2);

    await act(() => vi.advanceTimersByTimeAsync(INTERVALO_MS));
    await vaciar();
    expect(servidor.leerRegionesPlano).toHaveBeenCalledTimes(3);
    expect(screen.queryByText("Proponiendo regiones…")).not.toBeInTheDocument();
    expect(screen.getByTestId("editor")).toBeInTheDocument();
  });

  it("la lámina del editor se monta cuando la sección entra en la vista", async () => {
    let avisar: IntersectionObserverCallback = () => undefined;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          avisar = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    try {
      servidor.leerRegionesPlano.mockResolvedValue(respuesta({ status: "ready" }, REGIONES));
      renderWithProviders(<PlanRegions planId="plan-1" fileName="A-101.pdf" />);
      await vaciar();
      expect(screen.getByText("La lámina se carga al llegar a esta sección.")).toBeInTheDocument();
      expect(screen.queryByTestId("editor")).not.toBeInTheDocument();
      act(() => avisar([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
      expect(screen.getByTestId("editor")).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("muestra con qué modelo se propone con visión (lo elige el servidor)", async () => {
    const opus = { id: "claude-opus-5-5", nombre: "Claude Opus 5.5" };
    servidor.leerRegionesPlano
      .mockResolvedValueOnce({ ...respuesta({ status: "idle" }), modeloVision: opus })
      .mockResolvedValue({ ...respuesta({ status: "processing", vision: true, modelo: "claude-opus-5-5" }), modeloVision: opus });
    servidor.proponerRegionesPlano.mockResolvedValue({ propuesta: { status: "processing", vision: true, modelo: "claude-opus-5-5" } });
    renderWithProviders(<PlanRegions planId="plan-1" fileName="A-101.pdf" />);
    await vaciar();
    fireEvent.click(screen.getByRole("button", { name: "Proponer con IA (visión · Claude Opus 5.5)" }));
    await vaciar();
    expect(servidor.proponerRegionesPlano).toHaveBeenCalledWith("plan-1", true);
    expect(screen.getByRole("status")).toHaveTextContent("Proponiendo regiones con IA (visión, Claude Opus 5.5)… puede tardar varios minutos.");
  });

  it("sin propuesta en curso no consulta de nuevo", async () => {
    servidor.leerRegionesPlano.mockResolvedValue(respuesta({ status: "idle" }));
    renderWithProviders(<PlanRegions planId="plan-1" fileName="A-101.pdf" />);
    await vaciar();
    expect(screen.getByText("Este plano todavía no tiene regiones.")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(servidor.leerRegionesPlano).toHaveBeenCalledTimes(1);
  });
});
