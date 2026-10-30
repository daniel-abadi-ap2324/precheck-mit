import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/services/api";
import { renderWithProviders } from "@/test/render";
import { ReportPage } from "./components/report-page";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_MOCK_LATENCY = "0";
});
vi.mock("next/navigation", async () => (await import("../results/test/navigation-mock")).navigationModule);

const TIMEOUT = { timeout: 4000 };

describe("ReportPage: estados de vacío y error", () => {
  afterEach(() => vi.restoreAllMocks());

  it("un proyecto sin PreCheck muestra el estado vacío con el regreso al proyecto", async () => {
    const original = api.getProject.bind(api);
    vi.spyOn(api, "getProject").mockImplementation(async (id) => ({ ...(await original(id)), precheckId: undefined }));
    renderWithProviders(<ReportPage projectId="prj-betania-01" />);

    expect(await screen.findByText("Este proyecto todavía no tiene informe", undefined, TIMEOUT)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al proyecto" })).toHaveAttribute("href", "/projects/prj-betania-01");
    expect(screen.queryByRole("navigation", { name: "Navegación del informe" })).not.toBeInTheDocument();
  });

  it("si falla la carga del proyecto muestra el error y «Reintentar» vuelve a pedirlo", async () => {
    const user = userEvent.setup();
    const original = api.getProject.bind(api);
    const spy = vi
      .spyOn(api, "getProject")
      .mockRejectedValueOnce(new ApiError("proyecto.no_disponible", "No se pudo cargar el proyecto."))
      .mockImplementation(original);
    renderWithProviders(<ReportPage projectId="prj-betania-01" />);

    const alert = await screen.findByRole("alert", undefined, TIMEOUT);
    expect(alert).toHaveTextContent("No se pudo cargar el proyecto.");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("navigation", { name: "Navegación del informe" }, TIMEOUT)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
