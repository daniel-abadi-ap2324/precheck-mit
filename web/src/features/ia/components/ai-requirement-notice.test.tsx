import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConfigIa } from "@/services/ia/cliente";

const base: ConfigIa = {
  proveedor: "claude-code",
  modelo: "claude-sonnet-5-5",
  modelos: [],
  llaveConfigurada: false,
  origenLlave: null,
  claudeCodeDisponible: true,
  deepseek: { llave: false, gastoUsd: 0, topeUsd: 20, llamadas: 0 },
};
let config: ConfigIa = base;
vi.mock("@/services/ia/cliente", async (original) => ({
  ...(await original<typeof import("@/services/ia/cliente")>()),
  leerConfigIa: async () => config,
}));
const { AiRequirementNotice, iaDisponible } = await import("./ai-requirement-notice");

const montar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AiRequirementNotice que="La revisión con IA" />
    </QueryClientProvider>,
  );

describe("iaDisponible", () => {
  it("cada proveedor pide lo suyo: Claude Code instalado, o una llave", () => {
    expect(iaDisponible({ ...base, proveedor: "claude-code" })).toBe(true);
    expect(iaDisponible({ ...base, proveedor: "claude-code", claudeCodeDisponible: false })).toBe(false);
    expect(iaDisponible({ ...base, proveedor: "anthropic-api" })).toBe(false);
    expect(iaDisponible({ ...base, proveedor: "anthropic-api", llaveConfigurada: true })).toBe(true);
    expect(iaDisponible({ ...base, proveedor: "deepseek-api" })).toBe(false);
    expect(iaDisponible({ ...base, proveedor: "deepseek-api", deepseek: { ...base.deepseek!, llave: true } })).toBe(true);
    expect(iaDisponible({ ...base, proveedor: "ninguno" })).toBe(false);
  });
});

describe("AiRequirementNotice", () => {
  it("sin IA disponible explica que hace falta una llave de API o una sesión de Claude, con enlace a Configuración", async () => {
    config = { ...base, claudeCodeDisponible: false };
    montar();
    expect(await screen.findByText("La revisión con IA necesita la IA")).toBeInTheDocument();
    expect(screen.getByText(/llave de API/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conectar la IA en Configuración" })).toHaveAttribute("href", "/settings#revision-ia");
  });

  it("con la IA disponible no muestra nada", async () => {
    config = base;
    const { container } = montar();
    await new Promise((r) => setTimeout(r, 30));
    expect(container).toBeEmptyDOMElement();
  });
});
