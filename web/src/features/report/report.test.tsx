import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { ReportPage } from "./components/report-page";
import { ReportsList } from "./components/reports-list";
import { sectionHeadingId } from "./lib/sections";

vi.mock("next/navigation", async () => (await import("../results/test/navigation-mock")).navigationModule);

const TIMEOUT = { timeout: 4000 };

async function renderReport() {
  const user = userEvent.setup();
  renderWithProviders(<ReportPage projectId="prj-betania-01" />);
  await screen.findByRole("navigation", { name: "Navegación del informe" }, TIMEOUT);
  return user;
}

describe("Report navigation", () => {
  it("el botón de descarga dice qué formato entrega", async () => {
    await renderReport();
    expect(screen.getByRole("button", { name: "Descargar informe (HTML)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Descargar PDF/ })).not.toBeInTheDocument();
  });

  it("cada enlace del índice apunta a una sección con su encabezado", async () => {
    await renderReport();
    const toc = screen.getByRole("navigation", { name: "Navegación del informe" });
    const links = within(toc).getAllByRole("link");
    expect(links.length).toBe(13);
    for (const link of links) {
      const id = link.getAttribute("href")?.replace(/^#/, "") ?? "";
      const section = document.getElementById(id);
      expect(section, id).not.toBeNull();
      const heading = document.getElementById(sectionHeadingId(id));
      expect(heading, id).not.toBeNull();
      expect(section).toHaveAttribute("aria-labelledby", sectionHeadingId(id));
      expect(heading?.tagName).toMatch(/^H[12]$/);
    }
    expect(links[0]).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("heading", { level: 2, name: "Alcance de esta verificación" })).toBeInTheDocument();
  });

  it("muestra la nota preliminar en la primera sección y nunca un «cumple» global", async () => {
    await renderReport();
    const header = document.getElementById("encabezado") as HTMLElement;
    expect(within(header).getByRole("note")).toHaveTextContent(/preliminares y están sujetos a revisión/);
    expect(within(header).getByText("pendiente de revisión humana")).toBeInTheDocument();
    expect(screen.getByText(/Índice preliminar de cumplimiento/)).toBeInTheDocument();
    expect(screen.queryByText(/^Aprobado$/i)).not.toBeInTheDocument();
  });

  it("la versión del profesional oculta los detalles indicativos «no oficial» y lleva la marca de vista previa", async () => {
    const user = await renderReport();
    expect(screen.getAllByText("no oficial").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Reglas que no cumplen" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Versión del profesional" }));

    expect(screen.queryByText(/no oficial/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Reglas que no cumplen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Requieren revisión" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Vista previa — no emitida").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/solo se emite con el expediente revisado/).length).toBeGreaterThan(0);
    const toc = screen.getByRole("navigation", { name: "Navegación del informe" });
    expect(within(toc).getAllByRole("link")).toHaveLength(10);
    const observations = document.getElementById("observaciones-redactadas") as HTMLElement;
    expect(within(observations).getAllByRole("listitem")).toHaveLength(11);
  });
});

describe("Reports list", () => {
  it("lista un informe por proyecto con PreCheck", async () => {
    renderWithProviders(<ReportsList />);
    const link = await screen.findByRole("link", { name: /Abrir informe: Residencia Betania 01/ }, TIMEOUT);
    expect(link).toHaveAttribute("href", "/projects/prj-betania-01/report");
  });
});
