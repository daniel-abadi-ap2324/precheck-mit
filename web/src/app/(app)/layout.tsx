import { AppFooter, AppHeader, AppSidebar, DemoBanner } from "@/components/shell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2">
        Saltar al contenido
      </a>
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <DemoBanner />
        <main id="contenido" className="flex min-h-0 flex-1 flex-col">
          {children}
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
