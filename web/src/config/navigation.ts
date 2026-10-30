import { BookCheck, Bookmark,FilePlus2, FileText, FolderKanban, History, Layers, LayoutDashboard, Map, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const mainNav: NavItem[] = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/projects", label: "Proyectos", icon: FolderKanban },
  { href: "/projects/new", label: "Nuevo PreCheck", icon: FilePlus2 },
  { href: "/map", label: "Mapa", icon: Map },
  { href: "/zoning", label: "Zonificación", icon: Layers },
  { href: "/rules", label: "Reglas", icon: BookCheck },
  { href: "/reports", label: "Informes", icon: FileText },
  { href: "/marcadores", label: "Marcadores", icon: Bookmark },
  { href: "/rondas", label: "Rondas", icon: History },
  { href: "/settings", label: "Configuración", icon: Settings },
];

/** Etiquetas de segmentos de ruta para las migas de pan. */
export const segmentLabels: Record<string, string> = {
  dashboard: "Panel",
  projects: "Proyectos",
  new: "Nuevo PreCheck",
  site: "Lote",
  plans: "Planos",
  precheck: "Revisión",
  results: "Resultados",
  report: "Informe",
  rules: "Reglas",
  zoning: "Zonificación",
  map: "Mapa",
  reports: "Informes",
  marcadores: "Marcadores",
  rondas: "Rondas",
  settings: "Configuración",
  processing: "Procesamiento",
};

export function isActive(pathname: string, href: string): boolean {
  if (href === "/projects") return pathname === "/projects" || (pathname.startsWith("/projects/") && !pathname.startsWith("/projects/new"));
  return pathname === href || pathname.startsWith(`${href}/`);
}
