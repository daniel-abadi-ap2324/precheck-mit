import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import type { Marcador } from "@/services/marcadores/tipos";
import { GuardarMarcador } from "./components/guardar-marcador";
import { MarcadorProvider } from "./components/marcador-contexto";
import { MarcadoresPage } from "./components/marcadores-page";
import { MarcadoresRecientes } from "./components/marcadores-recientes";
import { enlaceDeMarcador, fotoDeRegla } from "./lib/marcadores";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/marcadores",
  useSearchParams: () => new URLSearchParams(),
}));
// La página consulta los proyectos para saber si el del marcador sigue existiendo.
vi.mock("@/hooks/use-api", () => ({ useProjects: () => ({ data: { items: [{ id: "prj-web-000000000001" }] } }) }));

const marcador = (over: Partial<Marcador> = {}): Marcador => ({
  id: "mrc-00000000-0000-4000-8000-000000000001",
  projectId: "prj-web-000000000001",
  precheckId: "pck-1",
  ruleId: "MP-C2-RETIRO#2",
  tipo: "equivocada",
  nota: "El retiro es 3 m.",
  createdAt: "2026-10-19T12:00:00.000Z",
  updatedAt: "2026-10-19T12:00:00.000Z",
  foto: { proyecto: "Tocumen (comercial) - prueba 77 con Opus 5.5 (2)", plano: "Tocumen (comercial)", modelo: "Opus 5.5", ronda: 77, repeticion: 2, regla: { titulo: "Retiro posterior", estado: "FAIL", decision: "NO_CUMPLE", justificacion: "Acota 1.20 m." } },
  ...over,
});

let guardados: Marcador[];
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (url.startsWith("/api/marcadores") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify({ items: guardados }));
  if (url === "/api/marcadores" && init?.method === "POST") {
    const m = marcador({ ...JSON.parse(String(init.body)), id: "mrc-00000000-0000-4000-8000-000000000009" });
    guardados = [m];
    return new Response(JSON.stringify(m), { status: 201 });
  }
  if (init?.method === "DELETE") {
    guardados = [];
    return new Response(null, { status: 204 });
  }
  return new Response("{}", { status: 404 });
});

beforeEach(() => {
  guardados = [];
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("enlaces y foto", () => {
  it("lleva a la regla con el id codificado («#» no corta la URL) o a la conclusión", () => {
    expect(enlaceDeMarcador({ projectId: "prj-web-000000000001", ruleId: "MP-C2-RETIRO#2" })).toBe("/projects/prj-web-000000000001/precheck?rule=MP-C2-RETIRO%232");
    expect(enlaceDeMarcador({ projectId: "prj-web-000000000001", ruleId: null })).toBe("/projects/prj-web-000000000001#conclusion");
  });

  it("la foto toma plano, modelo, ronda y repetición del nombre y recorta la justificación", () => {
    const f = fotoDeRegla("Tocumen (comercial) - prueba 77 con Opus 5.5 (2)", "Retiro", {
      status: "FAIL",
      faltaEnPlano: true,
      dictamen: { decision: "NO_CUMPLE", justificacion: "x".repeat(900), evidencia: [] },
    });
    expect(f).toMatchObject({ plano: "Tocumen (comercial)", modelo: "Opus 5.5", ronda: 77, repeticion: 2, regla: { estado: "FAIL", faltaEnPlano: true, decision: "NO_CUMPLE" } });
    expect(f.regla?.justificacion).toHaveLength(400);
  });
});

describe("GuardarMarcador", () => {
  const contexto = { projectId: "prj-web-000000000001", precheckId: "pck-1", proyecto: "Tocumen (comercial) - prueba 77 con Opus 5.5 (2)" };
  const foto = () => marcador().foto;

  it("guarda como «Equivocada» con nota, muestra lo guardado y lo quita", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MarcadorProvider value={contexto}>
        <GuardarMarcador ruleId="MP-C2-RETIRO#2" foto={foto} />
      </MarcadorProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Guardar" }));
    await user.click(screen.getByRole("button", { name: "Equivocada" }));
    await user.type(screen.getByLabelText(/Nota/), "El retiro es 3 m.");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/marcadores", expect.objectContaining({ method: "POST" })));
    const cuerpo = JSON.parse(String(fetchMock.mock.calls.find(([, i]) => i?.method === "POST")?.[1]?.body));
    expect(cuerpo).toMatchObject({ projectId: "prj-web-000000000001", precheckId: "pck-1", ruleId: "MP-C2-RETIRO#2", tipo: "equivocada", nota: "El retiro es 3 m." });
    expect(await screen.findByText(/Guardada: Equivocada/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/marcadores/mrc-00000000-0000-4000-8000-000000000009", { method: "DELETE" }));
    expect(await screen.findByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("fuera de un proyecto no se ofrece ni pide nada", () => {
    renderWithProviders(<GuardarMarcador ruleId="X" foto={foto} />);
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("/marcadores y el panel", () => {
  beforeEach(() => {
    guardados = [
      marcador(),
      marcador({ id: "mrc-00000000-0000-4000-8000-000000000002", projectId: "prj-web-000000000099", ruleId: null, tipo: "interesante", nota: "", foto: { ...marcador().foto, plano: "CASO-A", modelo: "Fable 5.1", regla: null, conclusion: "Aplica el permiso DPU." } }),
    ];
  });

  it("filtra por tipo y enlaza a la regla; un proyecto borrado no tiene enlace", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MarcadoresPage />);
    const abrir = await screen.findByRole("link", { name: /Abrir la regla/ });
    expect(abrir).toHaveAttribute("href", "/projects/prj-web-000000000001/precheck?rule=MP-C2-RETIRO%232");
    expect(screen.getByText("Proyecto eliminado")).toBeInTheDocument();
    expect(screen.getAllByText(/Opus 5\.5 · ronda 77 · repetición 2/)).toHaveLength(1);

    await user.selectOptions(screen.getByLabelText("Tipo"), "interesante");
    expect(screen.queryByRole("link", { name: /Abrir la regla/ })).not.toBeInTheDocument();
    expect(screen.getByText("Conclusión del dictamen")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Tipo"), "");
    await user.selectOptions(screen.getByLabelText("Modelo"), "Opus 5.5");
    expect(screen.getAllByTestId("lista-marcadores")).toHaveLength(1);
  });

  it("el panel muestra los recientes y «Ver todos»", async () => {
    renderWithProviders(<MarcadoresRecientes />);
    const lista = await screen.findByTestId("marcadores-recientes");
    expect(within(lista).getAllByRole("link")).toHaveLength(2);
    expect(within(lista).getAllByRole("link")[1]).toHaveAttribute("href", "/projects/prj-web-000000000099#conclusion");
    expect(screen.getByRole("link", { name: /Ver todos los marcadores/ })).toHaveAttribute("href", "/marcadores");
  });
});
