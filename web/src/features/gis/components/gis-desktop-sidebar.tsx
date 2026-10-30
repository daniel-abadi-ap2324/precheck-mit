"use client";

import type { ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGisStore } from "../store";

/** Panel lateral colapsable de 300 px (escritorio). El contenido se desplaza sin estirar la página. */
export function GisDesktopSidebar({ children }: { children: ReactNode }) {
  const collapsed = useGisStore((s) => s.sidebarCollapsed);
  const setCollapsed = useGisStore((s) => s.setSidebarCollapsed);
  if (collapsed) {
    return (
      <div className="flex w-11 shrink-0 flex-col items-center border-r bg-card py-2">
        <Button variant="ghost" size="icon-sm" aria-label="Mostrar panel de búsqueda y capas" aria-expanded={false} aria-controls="gis-sidebar" onClick={() => setCollapsed(false)}>
          <PanelLeftOpen aria-hidden />
        </Button>
      </div>
    );
  }
  return (
    <aside id="gis-sidebar" aria-label="Búsqueda, capas y filtros" className="relative w-panel-sm shrink-0 border-r bg-card">
      <div className="absolute inset-0 flex flex-col">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <p className="text-sm font-medium">Mapa</p>
          <Button variant="ghost" size="icon-sm" aria-label="Ocultar panel de búsqueda y capas" aria-expanded aria-controls="gis-sidebar" onClick={() => setCollapsed(true)}>
            <PanelLeftClose aria-hidden />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </aside>
  );
}
