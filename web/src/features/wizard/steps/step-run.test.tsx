import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { api } from "@/services/api";
import { useWizardStore } from "@/stores/wizard";
import { queryKeys } from "@/lib/query-keys";
import type { Plan, PlanExtraction, PlanFact, RegionPlano } from "@/types";
import type { RegionesServidor } from "@/services/planos/regiones";
import { StepRun, normaPorCorregimiento } from "./step-run";

const servidorRegiones = vi.hoisted(() => ({ leerRegionesPlano: vi.fn(), proponerRegionesPlano: vi.fn(), guardarRegionesPlano: vi.fn(), imagenRegionesUrl: (id: string, n: number) => `/img/${id}/${n}` }));
vi.mock("@/services/planos/regiones", () => servidorRegiones);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/projects/new", useSearchParams: () => new URLSearchParams() }));

describe("normaPorCorregimiento", () => {
  it("Casco Antiguo, San Francisco y el resto", () => {
    expect(normaPorCorregimiento("San Felipe")).toBe("MIVIOT-CA-R127-2003");
    expect(normaPorCorregimiento("SAN FRANCISCO")).toBe("PLOT-A61-2021+A270-2025");
    expect(normaPorCorregimiento("Las Mañanitas")).toBe("PLOT-A61-2021");
  });
});

describe("paso 5: barrera de datos sin confirmar (paso 1 del flujo)", () => {
  const leido = (hecho: string, valor: string | number, extra: Partial<PlanFact> = {}): PlanFact => ({ hecho, valor, confianza: 0.9, estado: "ok", fuente: { metodo: "pdf_texto", pagina: 1, bbox: [0, 0, 1, 1] }, ...extra });
  const extraccion = (hechos: PlanFact[]): PlanExtraction => ({ formato: "1.0.0", documento: "a.pdf", sha256: "0", paginas: [], escalas: [], requisitos_anexo_iv: [], hechos });
  const plano = (hechos: PlanFact[]): Plan => ({ id: "plan-1", projectId: "prj-web-1", fileName: "a.pdf", format: "PDF", sizeBytes: 1, status: "ready", progress: 100, sheets: [], extraction: extraccion(hechos) });

  beforeEach(() => {
    useWizardStore.getState().reset();
    useWizardStore.getState().upsertFile({ id: "f1", name: "a.pdf", size: 1, format: "PDF", progress: 100, status: "uploaded", planId: "plan-1" });
    servidorRegiones.leerRegionesPlano.mockReset().mockResolvedValue({ id: "plan-1", propuesta: { status: "idle" }, regiones: null } satisfies RegionesServidor);
  });

  it("con finca y área dudosas (OCR, 0.6) no deja ejecutar y dice qué no se pudo comprobar", async () => {
    vi.spyOn(api, "getPlan").mockResolvedValue(plano([leido("lote.finca", "071091", { confianza: 0.6 }), leido("lote.area_m2", 900, { estado: "revision", confianza: 0.6 }), leido("plano.zonificacion_declarada", "ZM7")]));
    renderWithProviders(<StepRun onBack={vi.fn()} />);
    expect((await screen.findAllByText(/No se pudo comprobar en el plano la finca y el área del lote/)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Ejecutar PreCheck/ })).toBeDisabled();
  });

  it("lo leído claro (0.9) queda comprobado sin preguntar: se puede ejecutar", async () => {
    vi.spyOn(api, "getPlan").mockResolvedValue(plano([leido("lote.finca", "071091"), leido("lote.area_m2", 900), leido("plano.zonificacion_declarada", "ZM7"), leido("lote.corregimiento", "Bella Vista")]));
    renderWithProviders(<StepRun onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Ejecutar PreCheck/ })).toBeEnabled());
    expect(screen.queryByText(/No se pudo comprobar/)).toBeNull();
    expect(screen.getByText(/PLOT-A61-2021 · ZM7/)).toBeInTheDocument();
  });

  it("un dato dudoso confirmado por la persona deja ejecutar", async () => {
    vi.spyOn(api, "getPlan").mockResolvedValue(plano([leido("lote.finca", "071091", { confianza: 0.6, confirmado: true }), leido("lote.area_m2", 900, { confianza: 0.6, corregido: true }), leido("plano.zonificacion_declarada", "ZM7")]));
    renderWithProviders(<StepRun onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Ejecutar PreCheck/ })).toBeEnabled());
  });

  it("avisa de una zona mal escrita (R2-A) y «Usar R2» la corrige en el plano; ejecutar sigue permitido", async () => {
    const hechos = [leido("lote.finca", "0071877"), leido("lote.area_m2", 892.03), leido("plano.zonificacion_declarada", "R2-A", { confirmado: true }), leido("lote.corregimiento", "San Francisco")];
    vi.spyOn(api, "getPlan").mockResolvedValue(plano(hechos));
    const corregir = vi.spyOn(api, "correctPlanData").mockResolvedValue(plano(hechos));
    const aviso = { campo: "zona", nivel: "aviso", mensaje: "La zona «R2-A» no existe en la norma PLOT-A61-2021+A270-2025. ¿«R2»?", sugerencia: "R2" };
    const original = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation((entrada, init) =>
      String(entrada).includes("/api/validar-datos") ? Promise.resolve(Response.json({ avisos: [aviso] })) : original(entrada, init),
    );
    const user = userEvent.setup();
    renderWithProviders(<StepRun onBack={vi.fn()} />);
    expect(await screen.findByText(/La zona «R2-A» no existe en la norma/)).toBeInTheDocument();
    expect(screen.getByText(/Revise estos datos antes de ejecutar/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ejecutar PreCheck/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Usar «R2»" }));
    expect(corregir).toHaveBeenCalledWith("plan-1", { "plano.zonificacion_declarada": "R2" });
    vi.restoreAllMocks();
  });

  it("sin avisos no aparece el recuadro de revisión", async () => {
    vi.spyOn(api, "getPlan").mockResolvedValue(plano([leido("lote.finca", "071091"), leido("lote.area_m2", 900), leido("plano.zonificacion_declarada", "ZM7")]));
    const original = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation((entrada, init) =>
      String(entrada).includes("/api/validar-datos") ? Promise.resolve(Response.json({ avisos: [] })) : original(entrada, init),
    );
    renderWithProviders(<StepRun onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Ejecutar PreCheck/ })).toBeEnabled());
    expect(screen.queryByText(/Revise estos datos antes de ejecutar/)).toBeNull();
    vi.restoreAllMocks();
  });
});

describe("paso 5: aviso de regiones sin revisar (paso 2 del flujo, no es barrera)", () => {
  const confirmado = (hecho: string, valor: string | number): PlanFact => ({ hecho, valor, confianza: 0.9, estado: "ok", confirmado: true, fuente: { metodo: "pdf_texto", pagina: 1, bbox: [0, 0, 1, 1] } });
  const plano: Plan = {
    id: "plan-1", projectId: "prj-web-1", fileName: "a.pdf", format: "PDF", sizeBytes: 1, status: "ready", progress: 100, sheets: [],
    extraction: { formato: "1.0.0", documento: "a.pdf", sha256: "0", paginas: [], escalas: [], requisitos_anexo_iv: [], hechos: [confirmado("lote.finca", "071091"), confirmado("lote.area_m2", 900), confirmado("plano.zonificacion_declarada", "ZM7")] },
  };
  const region = (extra: Partial<RegionPlano> = {}): RegionPlano => ({ id: "r-1", pagina: 1, tipo: "estacionamiento", puntos: [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3]], origen: "vectorial", confianza: 0.7, etiqueta: "", confirmada: false, editada: false, ...extra });
  const conRegiones = (regiones: RegionPlano[] | null): RegionesServidor => ({
    id: "plan-1",
    propuesta: { status: "ready" },
    regiones: regiones && { version: 1, generado: "g1", paginas: { "1": { imagen: "r1.png", ancho_px: 200, alto_px: 100 } }, regiones },
  });

  beforeEach(() => {
    useWizardStore.getState().reset();
    useWizardStore.getState().upsertFile({ id: "f1", name: "a.pdf", size: 1, format: "PDF", progress: 100, status: "uploaded", planId: "plan-1" });
    vi.spyOn(api, "getPlan").mockResolvedValue(plano);
    servidorRegiones.leerRegionesPlano.mockReset();
  });

  it("sin regiones avisa, pero deja ejecutar", async () => {
    servidorRegiones.leerRegionesPlano.mockResolvedValue(conRegiones(null));
    renderWithProviders(<StepRun onBack={vi.fn()} />);
    expect(await screen.findByText(/El plano no tiene regiones: la IA contará las plazas de estacionamiento y medirá los retiros solo a simple vista/)).toBeInTheDocument();
    expect(screen.getByText(/Sin regiones revisadas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ejecutar PreCheck/ })).toBeEnabled();
    expect(servidorRegiones.leerRegionesPlano).toHaveBeenCalledWith("plan-1");
  });

  it("con regiones solo propuestas (ninguna revisada) también avisa", async () => {
    servidorRegiones.leerRegionesPlano.mockResolvedValue(conRegiones([region(), region({ id: "r-2", origen: "vision", confianza: 0.5 })]));
    renderWithProviders(<StepRun onBack={vi.fn()} />);
    expect(await screen.findByText(/Ninguna región del plano está confirmada ni corregida/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ejecutar PreCheck/ })).toBeEnabled();
  });

  it("mientras la propuesta automática corre lo dice, sin afirmar que no hay regiones", async () => {
    servidorRegiones.leerRegionesPlano.mockResolvedValue({ ...conRegiones(null), propuesta: { status: "processing", vision: false } });
    renderWithProviders(<StepRun onBack={vi.fn()} />);
    expect(await screen.findByText(/Las regiones del plano se están proponiendo/)).toBeInTheDocument();
    expect(screen.queryByText(/El plano no tiene regiones/)).toBeNull();
    expect(screen.getByRole("button", { name: /Ejecutar PreCheck/ })).toBeEnabled();
  });

  it("con al menos una región revisada por una persona no avisa", async () => {
    servidorRegiones.leerRegionesPlano.mockResolvedValue(conRegiones([region(), region({ id: "r-2", confirmada: true, confianza: 0.8 })]));
    const { client } = renderWithProviders(<StepRun onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Ejecutar PreCheck/ })).toBeEnabled());
    // Que no haya aviso solo dice algo una vez que las regiones llegaron.
    await waitFor(() => expect(client.getQueryData(queryKeys.planRegions("plan-1"))).toBeDefined());
    expect(screen.queryByText(/Sin regiones revisadas/)).toBeNull();
  });
});

describe("paso 5: variables definidas por el arquitecto", () => {
  const leido = (hecho: string, valor: string | number): PlanFact => ({ hecho, valor, confianza: 0.9, estado: "ok", fuente: { metodo: "pdf_texto", pagina: 1, bbox: [0, 0, 1, 1] } });
  const plano: Plan = {
    id: "plan-1", projectId: "prj-web-1", fileName: "a.pdf", format: "PDF", sizeBytes: 1, status: "ready", progress: 100, sheets: [],
    extraction: { formato: "1.0.0", documento: "a.pdf", sha256: "0", paginas: [], escalas: [], requisitos_anexo_iv: [], hechos: [leido("lote.finca", "071091"), leido("lote.area_m2", 900), leido("plano.zonificacion_declarada", "R2")] },
  };

  beforeEach(() => {
    useWizardStore.getState().reset();
    useWizardStore.getState().setRun("prj-web-1", "");
    useWizardStore.getState().upsertFile({ id: "f1", name: "a.pdf", size: 1, format: "PDF", progress: 100, status: "uploaded", planId: "plan-1" });
    vi.spyOn(api, "getPlan").mockResolvedValue(plano);
    servidorRegiones.leerRegionesPlano.mockReset().mockResolvedValue({ id: "plan-1", propuesta: { status: "idle" }, regiones: null } satisfies RegionesServidor);
  });

  it("lo que el arquitecto define (zona y altura) viaja como definido y manda sobre lo que dice el plano", async () => {
    const iniciar = vi.spyOn(api, "startPreCheck").mockResolvedValue({ precheckId: "pck-1" });
    const user = userEvent.setup();
    renderWithProviders(<StepRun onBack={vi.fn()} />);
    await user.click(await screen.findByText("Variables definidas"));
    await user.type(screen.getByLabelText("Zonificación (código)"), "R2-A");
    await user.type(screen.getByLabelText("Altura de la edificación (m)"), "12");
    expect(screen.getByText(/2 definidas/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ejecutar PreCheck/ }));
    await waitFor(() => expect(iniciar).toHaveBeenCalled());
    const datos = iniciar.mock.calls[0][1];
    expect(datos).toMatchObject({ codigoZona: "R2-A", datosDeclarados: { "proyecto.altura_m": 12 }, definidas: ["lote.codigo_zona", "proyecto.altura_m"] });
  });

  it("sin definir nada no manda el campo definidas y la zona sale del plano", async () => {
    const iniciar = vi.spyOn(api, "startPreCheck").mockResolvedValue({ precheckId: "pck-1" });
    const user = userEvent.setup();
    renderWithProviders(<StepRun onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Ejecutar PreCheck/ })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /Ejecutar PreCheck/ }));
    await waitFor(() => expect(iniciar).toHaveBeenCalled());
    const datos = iniciar.mock.calls[0][1];
    expect(datos).toMatchObject({ codigoZona: "R2" });
    expect(datos).not.toHaveProperty("definidas");
  });

  it("un valor imposible en lo definido bloquea y dice cuál", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StepRun onBack={vi.fn()} />);
    await user.click(await screen.findByText("Variables definidas"));
    await user.type(screen.getByLabelText("Ocupación (%)"), "120");
    expect(await screen.findAllByText(/Ocupación: no puede pasar de 100/)).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: /Ejecutar PreCheck/ })).toBeDisabled();
  });
});
