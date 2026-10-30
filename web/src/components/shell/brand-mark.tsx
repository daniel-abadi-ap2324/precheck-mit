import { brand } from "@/config/brand";
import { BrandIcon } from "./brand-icon";

/** Marca de la barra lateral: entidad en primer plano y el nombre de la herramienta debajo. */
export function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandIcon />
      {collapsed ? (
        <span className="sr-only">{brand.fullName}</span>
      ) : (
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-white">{brand.productName}</span>
          <span className="whitespace-nowrap text-2xs text-sidebar-foreground/70">{brand.tagline}</span>
        </span>
      )}
    </span>
  );
}
