"use client";

import { Switch } from "@/components/ui/switch";
import { useUiStore } from "@/stores/ui";
import { SettingsSection } from "./settings-section";

export function PreferencesSection() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  return (
    <SettingsSection id="preferencias" title="Preferencias" description="Se guardan en este navegador.">
      <label className="flex cursor-pointer items-start justify-between gap-4 text-sm">
        <span>
          <span className="block font-medium">Barra lateral contraída</span>
          <span className="block text-muted-foreground">Muestra solo los iconos de navegación para ganar espacio en la revisión y el mapa.</span>
        </span>
        <Switch checked={collapsed} onCheckedChange={() => toggle()} />
      </label>
    </SettingsSection>
  );
}
