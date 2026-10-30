import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { ProjectHeader } from "./project-header";

let pathname = "/projects/prj-betania-01";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }));

describe("ProjectHeader", () => {
  it("fuera de la revisión ofrece «Revisar regla por regla»", async () => {
    pathname = "/projects/prj-betania-01";
    renderWithProviders(<ProjectHeader projectId="prj-betania-01" />);
    expect(await screen.findByRole("link", { name: "Revisar regla por regla" })).toHaveAttribute("href", "/projects/prj-betania-01/precheck");
  });

  it("dentro de la revisión no repite el acceso a la misma pantalla", async () => {
    pathname = "/projects/prj-betania-01/precheck";
    renderWithProviders(<ProjectHeader projectId="prj-betania-01" />);
    await screen.findByText("Residencia Betania 01");
    expect(screen.queryByRole("link", { name: "Revisar regla por regla" })).not.toBeInTheDocument();
    expect(screen.queryByText("Abrir revisión")).not.toBeInTheDocument();
  });
});
