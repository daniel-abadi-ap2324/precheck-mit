import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { complianceMeta, projectStatusMeta } from "@/lib/status";
import type { ComplianceStatus } from "@/types";
import { ComplianceBadge, StatusBadge } from "./status-badge";

const STATUSES = Object.keys(complianceMeta) as ComplianceStatus[];

describe("ComplianceBadge", () => {
  it.each(STATUSES)("%s: icono decorativo (aria-hidden) + texto visible (nunca solo color)", (status) => {
    const { container } = render(<ComplianceBadge status={status} />);
    const badge = container.firstElementChild as HTMLElement;
    const icon = badge.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(badge).toHaveTextContent(complianceMeta[status].label);
    expect(screen.getByText(complianceMeta[status].label)).toBeVisible();
    expect(badge).not.toHaveTextContent(/no oficial/);
  });

  it("official={false} añade el sufijo «no oficial» para lectores de pantalla", () => {
    const { container } = render(<ComplianceBadge status="PASS" official={false} />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge).toHaveTextContent(/Cumple, resultado indicativo, no oficial/);
    expect(screen.getByText(/no oficial/)).toHaveClass("sr-only");
  });
});

describe("StatusBadge de proyecto", () => {
  it("«Revisión cerrada» no usa el lenguaje visual de «Cumple» (ni tono pass ni su icono)", () => {
    expect(projectStatusMeta.COMPLETED.tone).not.toBe("pass");
    expect(projectStatusMeta.COMPLETED.icon).not.toBe(complianceMeta.PASS.icon);
    const { container } = render(<StatusBadge status="COMPLETED" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge).toHaveTextContent("Revisión cerrada");
    expect(badge.className).not.toMatch(/\btext-pass\b|\bbg-pass-soft\b/);
  });
});
