import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConfigIa, EstadoIa } from "@/services/ia/cliente";

let ia: EstadoIa | null = null;
const CLAUDE_CODE: ConfigIa = {
  proveedor: "claude-code",
  modelo: "claude-sonnet-5-5",
  modelos: [{ id: "claude-sonnet-5-5", nombre: "Sonnet 5.5" }],
  modeloEscaneados: null,
  modelosEscaneados: [{ id: "claude-sonnet-5-5", nombre: "Sonnet 5.5" }],
  llaveConfigurada: false,
  origenLlave: null,
  claudeCodeDisponible: true,
  deepseek: { llave: false, gastoUsd: 0, topeUsd: 20, llamadas: 0 },
};
let config: ConfigIa = CLAUDE_CODE;
vi.mock("@/services/ia/cliente", async (original) => ({
  ...(await original<typeof import("@/services/ia/cliente")>()),
  leerConfigIa: async () => config,
  estadoRevisionIa: async () => ia,
  leerRegistroIa: async () => null,
}));
const { AiReviewPanel, destinoRevision } = await import("./ai-review-panel");

const montar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AiReviewPanel precheckId="pck-11111111-2222-4333-8444-555555555555" />
    </QueryClientProvider>,
  );
const base: EstadoIa = { status: "running", proveedor: "claude-code", modelo: "claude-fable-5-1", actualizadoEn: "2026-10-05T10:00:00Z" };

describe("AiReviewPanel: actividad y espera de turno", () => {
  it("avisa que la revisión espera turno y cuántas hay en curso", async () => {
    ia = { ...base, enEspera: true, revisionesCorriendo: 3, maxParalelo: 3 };
    montar();
    expect(await screen.findByText(/En espera de turno: hay 3 revisiones en curso \(máximo 3 a la vez\)/)).toBeInTheDocument();
  });

  it("muestra hace cuánto no hay actividad y que un silencio largo es normal", async () => {
    ia = { ...base, segundosSinActividad: 6 * 60 + 10 };
    montar();
    expect(await screen.findByTestId("actividad-ia")).toHaveTextContent(/Sin actividad hace 6 min\. Es normal/);
  });

  it("muestra el modelo de esta revisión, no el predeterminado", async () => {
    ia = { ...base, segundosSinActividad: 4 };
    montar();
    expect(await screen.findByText(/claude-fable-5-1/)).toBeInTheDocument();
  });

  it("si la política de escaneados cambió el modelo, dice cuál corrió y cuál se pidió", async () => {
    ia = { ...base, modelo: "claude-opus-5-5", modeloPedido: "deepseek-flash", enrutado: "plano escaneado", segundosSinActividad: 4 };
    montar();
    expect(await screen.findByText(/claude-opus-5-5 \(plano escaneado; se pidió deepseek-flash\)/)).toBeInTheDocument();
  });
});

describe("AiReviewPanel: el aviso nombra el proveedor y el modelo reales", () => {
  it("destinoRevision distingue DeepSeek, la API de Anthropic y Claude Code", () => {
    expect(destinoRevision("deepseek-api", "deepseek-flash")).toBe("DeepSeek (deepseek-flash)");
    expect(destinoRevision("anthropic-api", "claude-sonnet-5-5")).toBe("Anthropic (claude-sonnet-5-5) por API");
    expect(destinoRevision("claude-code", "claude-opus-5-5")).toBe("Claude Code en este equipo (claude-opus-5-5)");
  });

  it("con DeepSeek el aviso dice DeepSeek, no Anthropic", async () => {
    ia = null;
    config = { ...CLAUDE_CODE, proveedor: "deepseek-api", modelo: "deepseek-flash", modelos: [{ id: "deepseek-flash", nombre: "DeepSeek Flash" }], deepseek: { llave: true, gastoUsd: 1, topeUsd: 20, llamadas: 3 } };
    montar();
    const boton = await screen.findByRole("button", { name: "Revisar con IA" });
    // El botón existe desde el principio, deshabilitado hasta que llega la configuración.
    await vi.waitFor(() => expect(boton).toBeEnabled());
    fireEvent.click(boton);
    expect(screen.getByTestId("destino-ia")).toHaveTextContent("Se enviará el plano a DeepSeek (deepseek-flash)");
    expect(screen.getByRole("note")).not.toHaveTextContent(/Anthropic/);
    config = CLAUDE_CODE;
  });

  it("sin llave de DeepSeek no deja lanzar y dice por qué", async () => {
    ia = null;
    config = { ...CLAUDE_CODE, proveedor: "deepseek-api", modelo: "deepseek-flash", modelos: [{ id: "deepseek-flash", nombre: "DeepSeek Flash" }] };
    montar();
    expect(await screen.findByText(/Falta la llave de DeepSeek en el servidor/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revisar con IA" })).toBeDisabled();
    config = CLAUDE_CODE;
  });
});

describe("AiReviewPanel: revisión XTRA", () => {
  it("el título dice Revisión XTRA con el maestro y los empleados, y el avance de los empleados", async () => {
    config = CLAUDE_CODE;
    ia = { ...base, xtra: { empleados: 5, modeloEmpleados: "claude-sonnet-5-5", fase: "empleados", terminados: 2, fallidos: 1 } };
    montar();
    expect(await screen.findByRole("heading", { name: /Revisión XTRA \(1 maestro \+ 5 empleados\)/ })).toBeInTheDocument();
    expect(screen.getByText(/3 de 5 listos \(1 sin terminar\)/)).toBeInTheDocument();
  });

  it("al marcar la opción XTRA el título cambia y se eligen hasta 10 empleados", async () => {
    config = CLAUDE_CODE;
    ia = null;
    montar();
    const boton = await screen.findByRole("button", { name: "Revisar con IA" });
    await waitFor(() => expect(boton).toBeEnabled());
    fireEvent.click(boton);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Usar varios agentes/ }));
    expect(screen.getByRole("heading", { name: /Revisión XTRA \(1 maestro \+ 3 empleados\)/ })).toBeInTheDocument();
    const select = screen.getByLabelText(/Agentes empleados/);
    expect(select.querySelectorAll("option")).toHaveLength(10);
    expect(screen.getByLabelText("Modelo del agente maestro")).toBeInTheDocument();
  });
});
