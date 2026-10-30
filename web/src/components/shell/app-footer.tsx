import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/** Pie institucional como en los productos digitales de la Alcaldía: línea divisoria con márgenes y texto centrado. */
export function AppFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("bg-card px-4 pb-6", className)}>
      <div className="mx-auto max-w-6xl border-t border-line pt-6 text-center text-sm text-muted-foreground">{brand.copyright}</div>
    </footer>
  );
}
