import type { Metadata } from "next";
import { SettingsView } from "@/features/settings/components/settings-view";

export const metadata: Metadata = { title: "Configuración" };

export default function SettingsPage() {
  return <SettingsView />;
}
