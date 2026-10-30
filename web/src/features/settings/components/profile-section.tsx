"use client";

import { useSessionStore } from "@/stores/session";
import type { Reviewer } from "@/types";
import { FactList } from "@/components/common";
import { SettingsSection } from "./settings-section";

const ROLE_LABELS: Record<Reviewer["role"], string> = {
  revisor_doyc: "Revisor de la DOYC",
  aprobador: "Revisor aprobador",
  redactor: "Redactor de reglas",
  profesional: "Profesional idóneo",
};

export function ProfileSection() {
  const user = useSessionStore((s) => s.session?.user);
  return (
    <SettingsSection id="perfil" title="Perfil" description="Datos de la sesión de demostración. En producción provienen de la cuenta institucional y no se editan aquí.">
      {user ? (
        <FactList
          rows={[
            { label: "Nombre", value: user.name },
            { label: "Correo", value: user.email },
            { label: "Rol", value: ROLE_LABELS[user.role] },
          ]}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No hay una sesión activa.</p>
      )}
    </SettingsSection>
  );
}
