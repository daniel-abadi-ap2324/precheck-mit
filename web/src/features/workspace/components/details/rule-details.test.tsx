import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { fakeItem } from "@/test/rule-result-fixtures";
import type { DecisionRegla, RevisionPreCheck } from "@/types";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_MOCK_LATENCY = "0";
});

// Solo se simula el servidor de la revisión: esPreCheckReal y lo demás del cliente son los reales.
const servidor = vi.hoisted(() => ({ leerRevision: vi.fn(), guardarRevision: vi.fn() }));
vi.mock("@/services/prechecks/cliente", async (original) => ({ ...(await original<typeof import("@/services/prechecks/cliente")>()), ...servidor }));

const { RuleDetails } = await import("./rule-details");

const PCK = "pck-11111111-2222-4333-8444-555555555555";
const DECISION: DecisionRegla = { decision: "NO_CUMPLE", justificacion: "No hay curvas de nivel en la localización.", evidencia: [{ pagina: 1, detalle: "localización" }] };
const conDictamen = () => fakeItem("A110-AIV-CURVAS", "FAIL", { rule: { state: "borrador" }, result: { official: false, dictamen: DECISION } });
const EXPEDIENTE = { projectId: PCK, info: { documento: null, paginas: 2, normaAplicable: null, fechaPresentacion: null, umbral: null, noAplican: 0, avisos: [], lote: [], proyecto: [], miniaturas: [1] } };

describe("RuleDetails", () => {
  it("marca «no oficial» un resultado oficial de una regla en borrador", () => {
    renderWithProviders(<RuleDetails item={fakeItem("R1", "FAIL", { rule: { state: "borrador" }, result: { official: true } })} precheckId="pc-1" />);
    expect(screen.getByText("no oficial")).toBeVisible();
  });

  it("no marca «no oficial» un resultado oficial de una regla aprobada", () => {
    renderWithProviders(<RuleDetails item={fakeItem("R1", "FAIL")} precheckId="pc-1" />);
    expect(screen.queryByText(/no oficial/)).not.toBeInTheDocument();
  });
});

describe("RuleDetails · Revisión DOYC en un PreCheck real", () => {
  beforeEach(() => {
    servidor.leerRevision.mockReset().mockResolvedValue({ version: 1, decisiones: {} } satisfies RevisionPreCheck);
    servidor.guardarRevision.mockReset();
  });

  it("con dictamen de la IA: el revisor la confirma con una nota y queda el estado guardado", async () => {
    const guardada: RevisionPreCheck = { version: 1, decisiones: { "A110-AIV-CURVAS": { accion: "confirmar", nota: "revisé la lámina A-001", fecha: "2026-10-13T15:00:00.000Z" } } };
    servidor.guardarRevision.mockResolvedValue(guardada);
    renderWithProviders(<RuleDetails item={conDictamen()} precheckId={PCK} soloLectura expediente={EXPEDIENTE} />);

    const bloque = await screen.findByTestId("revision-doyc");
    expect(screen.getByRole("heading", { name: "Revisión DOYC" })).toBeInTheDocument();
    expect(within(bloque).getByTestId("estado-revision")).toHaveTextContent(/Pendiente/);
    expect(screen.queryByText(/solo lectura/)).not.toBeInTheDocument();
    expect(screen.queryByText(/las marcas/)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(within(bloque).getByLabelText("Nota (opcional)"), "revisé la lámina A-001");
    await user.click(within(bloque).getByRole("button", { name: "Confirmo la decisión de la IA" }));

    expect(servidor.guardarRevision).toHaveBeenCalledWith(PCK, "A110-AIV-CURVAS", "confirmar", "revisé la lámina A-001");
    await waitFor(() => expect(screen.getByTestId("estado-revision")).toHaveTextContent("Confirmada por el revisor"));
    expect(screen.getByTestId("estado-revision")).toHaveTextContent("Nota: revisé la lámina A-001");
    expect(screen.getByRole("button", { name: "Confirmo la decisión de la IA" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "No estoy de acuerdo" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Dejar pendiente/ })).toBeInTheDocument();
  });

  it("muestra lo guardado (contradicha) y permite cambiarlo", async () => {
    servidor.leerRevision.mockResolvedValue({ version: 1, decisiones: { "A110-AIV-CURVAS": { accion: "contradecir", nota: "las curvas están en A-002", fecha: "2026-10-13T15:00:00.000Z" } } });
    servidor.guardarRevision.mockResolvedValue({ version: 1, decisiones: { "A110-AIV-CURVAS": { accion: "confirmar", nota: "las curvas están en A-002", fecha: "2026-10-13T16:00:00.000Z" } } });
    renderWithProviders(<RuleDetails item={conDictamen()} precheckId={PCK} soloLectura expediente={EXPEDIENTE} />);

    await waitFor(() => expect(screen.getByTestId("estado-revision")).toHaveTextContent("Contradicha por el revisor"));
    expect(screen.getByTestId("estado-revision")).toHaveTextContent("Nota: las curvas están en A-002");
    expect(screen.getByLabelText("Nota (opcional)")).toHaveValue("las curvas están en A-002");
    await userEvent.setup().click(screen.getByRole("button", { name: "Confirmo la decisión de la IA" }));
    expect(servidor.guardarRevision).toHaveBeenCalledWith(PCK, "A110-AIV-CURVAS", "confirmar", "las curvas están en A-002");
    await waitFor(() => expect(screen.getByTestId("estado-revision")).toHaveTextContent("Confirmada por el revisor"));
  });

  it("sin dictamen (la decidió el motor): explica cómo cambiarla y no ofrece botones", () => {
    renderWithProviders(<RuleDetails item={fakeItem("R-1", "FAIL")} precheckId={PCK} soloLectura expediente={EXPEDIENTE} />);
    expect(screen.getByText(/La decidió el motor con los datos del plano; para cambiarla corrija el dato en el lector y vuelva a evaluar/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmo la decisión de la IA" })).not.toBeInTheDocument();
    expect(servidor.leerRevision).not.toHaveBeenCalled();
  });

  it("un expediente del agente (exp-…) sigue de solo lectura y no pide la revisión", () => {
    renderWithProviders(<RuleDetails item={conDictamen()} precheckId="exp-pueblo" soloLectura expediente={{ ...EXPEDIENTE, projectId: "exp-pueblo" }} />);
    expect(screen.getByText(/Expediente de solo lectura/)).toBeInTheDocument();
    expect(screen.queryByText(/las marcas/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmo la decisión de la IA" })).not.toBeInTheDocument();
    expect(servidor.leerRevision).not.toHaveBeenCalled();
  });
});
