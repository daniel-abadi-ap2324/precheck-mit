"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsLeft, ChevronsRight, LifeBuoy, LogOut } from "lucide-react";
import { mainNav, isActive, type NavItem } from "@/config/navigation";
import { useUiStore } from "@/stores/ui";
import { useSessionStore } from "@/stores/session";
import { useIsClient } from "@/hooks/use-is-client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";

function NavLink({ item, collapsed, active, onNavigate }: { item: NavItem; collapsed: boolean; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-white",
        active && "bg-sidebar-accent font-medium text-white shadow-[inset_2px_0_0_var(--mp-brand)]",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon aria-hidden className="size-[18px] shrink-0" />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

/** Contenido de la barra lateral; se usa fija en escritorio y dentro de un Sheet en móvil. */
export function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const signOut = useSessionStore((s) => s.signOut);
  const sessionUser = useSessionStore((s) => s.session?.user);
  const user = useIsClient() ? sessionUser : undefined;
  const initials = user?.name.split(" ").slice(-2).map((w) => w[0]).join("") ?? "—";

  return (
    <div className="flex h-full flex-col gap-2 bg-sidebar p-3 text-sidebar-foreground">
      <Link href="/dashboard" onClick={onNavigate} className={cn("mb-2 flex min-h-10 items-center rounded-md px-1 py-1", collapsed && "justify-center")}>
        <BrandMark collapsed={collapsed} />
      </Link>
      <nav aria-label="Principal" className="flex flex-1 flex-col gap-0.5">
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="flex flex-col gap-0.5 border-t border-sidebar-border pt-2">
        <NavLink item={{ href: "/settings#ayuda", label: "Ayuda", icon: LifeBuoy }} collapsed={collapsed} active={false} onNavigate={onNavigate} />
        <div className={cn("flex items-center gap-2.5 rounded-md px-2 py-2", collapsed && "justify-center px-0")}>
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-sidebar-accent text-xs font-semibold text-white">
            {initials}
          </span>
          {collapsed ? null : (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm text-white">{user?.name ?? "Sin sesión"}</span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            signOut();
            router.push("/login");
          }}
          className={cn("flex h-9 items-center gap-3 rounded-md px-2.5 text-sm text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-white", collapsed && "justify-center px-0")}
        >
          <LogOut aria-hidden className="size-[18px]" />
          {collapsed ? <span className="sr-only">Cerrar sesión</span> : "Cerrar sesión"}
        </button>
      </div>
    </div>
  );
}

export function AppSidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  return (
    <aside
      className={cn("relative hidden shrink-0 border-r border-sidebar-border transition-[width] duration-200 md:block", collapsed ? "w-sidebar-collapsed" : "w-sidebar")}
      aria-label="Barra lateral"
    >
      <div className="sticky top-0 h-dvh">
        <SidebarContent collapsed={collapsed} />
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
        aria-expanded={!collapsed}
        className="absolute top-5 -right-3 z-10 grid size-6 place-items-center rounded-full border bg-card text-foreground shadow-sm hover:bg-muted"
      >
        {collapsed ? <ChevronsRight className="size-3.5" /> : <ChevronsLeft className="size-3.5" />}
      </button>
    </aside>
  );
}
