"use client";

import Link from "next/link";
import { CircleHelp, Menu } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useUiStore } from "@/stores/ui";
import { useSessionStore } from "@/stores/session";
import { useIsClient } from "@/hooks/use-is-client";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "./breadcrumbs";
import { ProjectSelector } from "./project-selector";
import { NotificationsMenu } from "./notifications-menu";
import { SidebarContent } from "./app-sidebar";

export function AppHeader() {
  const open = useUiStore((s) => s.mobileNavOpen);
  const setOpen = useUiStore((s) => s.setMobileNavOpen);
  const sessionUser = useSessionStore((s) => s.session?.user);
  const user = useIsClient() ? sessionUser : undefined;
  const initials = user?.name.split(" ").slice(-2).map((w) => w[0]).join("") ?? "—";

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b bg-card px-3 md:px-4">
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú" onClick={() => setOpen(true)}>
        <Menu className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 border-0 p-0">
          <SheetTitle className="sr-only">Menú principal</SheetTitle>
          <SidebarContent collapsed={false} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="hidden min-w-0 flex-1 sm:block">
        <Breadcrumbs />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <div className="hidden lg:block">
          <ProjectSelector />
        </div>
        <NotificationsMenu />
        <Link href="/settings#ayuda" className={cn(buttonVariants({ variant: "ghost", size: "icon" }))} aria-label="Ayuda">
          <CircleHelp className="size-[18px]" />
        </Link>
        <Link href="/settings" aria-label={`Perfil de ${user?.name ?? "usuario"}`} className="ml-1 grid size-8 place-items-center rounded-full bg-brand text-xs font-semibold text-white">
          {initials}
        </Link>
      </div>
    </header>
  );
}
