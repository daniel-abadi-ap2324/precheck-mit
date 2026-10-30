import { PageHeader } from "@/components/common";
import { ProfileSection } from "./profile-section";
import { PreferencesSection } from "./preferences-section";
import { DataSourceSection } from "./data-source-section";
import { AiSettingsSection } from "@/features/ia/components/ai-settings-section";
import { IdentitySection } from "./identity-section";
import { HelpSection } from "./help-section";

export function SettingsView() {
  return (
    <div className="flex max-w-4xl flex-col gap-5 p-4 md:p-6">
      <PageHeader title="Configuración" description="Perfil, preferencias, fuente de datos, revisión con IA, identidad visual y ayuda." />
      <ProfileSection />
      <PreferencesSection />
      <DataSourceSection />
      <AiSettingsSection />
      <IdentitySection />
      <HelpSection />
    </div>
  );
}
