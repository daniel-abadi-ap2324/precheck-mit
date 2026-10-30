import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api } from "@/services/api";
import { useWizardStore } from "@/stores/wizard";
import { nombreProvisional, useEnsureProject } from "./use-ensure-project";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

describe("useEnsureProject", () => {
  it("crea el proyecto sin pedir datos, con el nombre del archivo", async () => {
    useWizardStore.getState().reset();
    const crear = vi.spyOn(api, "createProject");
    const { result } = renderHook(() => useEnsureProject(), { wrapper });
    act(() => result.current.mutate("Casco Antiguo.pdf"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(crear.mock.calls[0][0]).toMatchObject({ name: "Casco Antiguo", finca: "" });
    expect(useWizardStore.getState().projectId).toBe(result.current.data);
    crear.mockRestore();
  });

  it("nombre provisional: sin extensión, o la fecha si el archivo no da un nombre", () => {
    expect(nombreProvisional("Tocumen (comercial).pdf")).toBe("Tocumen (comercial)");
    expect(nombreProvisional("a.pdf")).toMatch(/^Plano del /);
  });
});
