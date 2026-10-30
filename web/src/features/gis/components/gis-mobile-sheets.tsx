"use client";

import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useGisStore } from "../store";

/** Botón flotante + hoja inferior con Buscar, Capas y Filtros (móvil y tableta). */
export function GisMobileSidebar({ children }: { children: ReactNode }) {
  const open = useGisStore((s) => s.mobileSidebarOpen);
  const setOpen = useGisStore((s) => s.setMobileSidebarOpen);
  return (
    <>
      <Button variant="outline" className="absolute top-3 left-3 z-10 bg-card shadow-sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <SlidersHorizontal aria-hidden />
        Buscar y capas
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto">
          <SheetHeader className="border-b">
            <SheetTitle>Buscar, capas y filtros</SheetTitle>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Hoja inferior con la información del lote o de la zona (móvil y tableta). */
export function GisMobileInfo({ open, onClose, label = "Información del lote", children }: { open: boolean; onClose: () => void; label?: string; children: ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <SheetContent side="bottom" showCloseButton={false} aria-label={label} className="max-h-[85dvh] overflow-y-auto">
        {children}
      </SheetContent>
    </Sheet>
  );
}
