import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigIa } from "@/services/ia/cliente";

const CLAUDE = [
  { id: "claude-sonnet-5-5", nombre: "Claude Sonnet 5.5" },
  { id: "claude-opus-5-5", nombre: "Claude Opus 5.5" },
];
const DEEPSEEK: ConfigIa = {
  proveedor: "deepseek-api",
  modelo: "deepseek-flash",
  modelos: [{ id: "deepseek-flash", nombre: "DeepSeek Flash" }],
  modeloEscaneados: null,
  modelosEscaneados: [...CLAUDE, { id: "deepseek-flash", nombre: "DeepSeek Flash" }],
  llaveConfigurada: false,
  origenLlave: null,
  claudeCodeDisponible: true,
  deepseek: { llave: true, gastoUsd: 10.4, topeUsd: 20, llamadas: 37 },
};

/** Servidor simulado: devuelve la configuración de cada prueba y, al guardar, la del proveedor nuevo. */
let config: ConfigIa = DEEPSEEK;
const guardar = vi.fn(async (cambios: { proveedor?: string; modeloEscaneados?: string | null }) => {
  config = cambios.proveedor === "claude-code" ? { ...config, proveedor: "claude-code", modelo: "claude-sonnet-5-5", modelos: CLAUDE } : config;
  if ("modeloEscaneados" in cambios) config = { ...config, modeloEscaneados: cambios.modeloEscaneados ?? null };
  return config;
});
vi.mock("@/services/ia/cliente", async (original) => ({
  ...(await original<typeof import("@/services/ia/cliente")>()),
  leerConfigIa: async () => config,
  guardarConfigIa: (c: { proveedor?: string; modeloEscaneados?: string | null }) => guardar(c),
}));
const { AiSettingsSection } = await import("./ai-settings-section");

const montar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AiSettingsSection />
    </QueryClientProvider>,
  );
const opciones = (id: string) => within(document.getElementById(id) as HTMLElement).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);

beforeEach(() => {
  config = DEEPSEEK;
  guardar.mockClear();
});

describe("AiSettingsSection: modelos por proveedor y estado de DeepSeek", () => {
  it("con DeepSeek solo ofrece su modelo y muestra el gasto acumulado y la llave", async () => {
    montar();
    expect(await screen.findByTestId("estado-deepseek")).toHaveTextContent("Gasto acumulado: 10.40 de 20 USD (37 llamadas) · llave configurada");
    expect(opciones("ia-modelo")).toEqual(["deepseek-flash"]);
    expect(screen.queryByText(/DeepSeek cerca del tope de gasto/)).not.toBeInTheDocument();
  });

  it("al cambiar de proveedor manda solo el proveedor y pasa a la lista de modelos del nuevo", async () => {
    montar();
    fireEvent.change(await screen.findByLabelText("Proveedor"), { target: { value: "claude-code" } });
    await vi.waitFor(() => expect(guardar).toHaveBeenCalledWith({ proveedor: "claude-code" }));
    await vi.waitFor(() => expect(opciones("ia-modelo")).toEqual(["claude-sonnet-5-5", "claude-opus-5-5"]));
    expect((screen.getByLabelText("Modelo") as HTMLSelectElement).value).toBe("claude-sonnet-5-5");
  });

  it("el modelo para escaneados ofrece «el mismo» y todos los modelos; vacío se guarda como null", async () => {
    montar();
    const select = (await screen.findByLabelText("Modelo para planos escaneados")) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(opciones("ia-modelo-escaneados")).toEqual(["", "claude-sonnet-5-5", "claude-opus-5-5", "deepseek-flash"]);
    fireEvent.change(select, { target: { value: "claude-opus-5-5" } });
    await vi.waitFor(() => expect(guardar).toHaveBeenCalledWith({ modeloEscaneados: "claude-opus-5-5" }));
    await vi.waitFor(() => expect(select.value).toBe("claude-opus-5-5"));
    fireEvent.change(select, { target: { value: "" } });
    await vi.waitFor(() => expect(guardar).toHaveBeenCalledWith({ modeloEscaneados: null }));
  });

  it("avisa en ámbar a menos de 2 USD del tope", async () => {
    config = { ...DEEPSEEK, deepseek: { llave: true, gastoUsd: 18.6, topeUsd: 20, llamadas: 90 } };
    montar();
    expect(await screen.findByText(/DeepSeek cerca del tope de gasto/)).toBeInTheDocument();
    expect(screen.getByText(/Quedan 1\.40 USD de 20/)).toBeInTheDocument();
  });

  it("avisa en rojo si falta la llave de DeepSeek", async () => {
    config = { ...DEEPSEEK, deepseek: { llave: false, gastoUsd: 0, topeUsd: 20, llamadas: 0 } };
    montar();
    expect(await screen.findByText(/Falta la llave de DeepSeek/)).toBeInTheDocument();
    expect(screen.getByTestId("estado-deepseek")).toHaveTextContent("sin llave");
  });
});
