import { FactList } from "@/components/common";
import { SettingsSection } from "./settings-section";

export function DataSourceSection() {
  const mode = process.env.NEXT_PUBLIC_API_MODE === "http" ? "http" : "mock";
  return (
    <SettingsSection id="fuente-datos" title="Fuente de datos">
      <FactList
        rows={[
          { label: "NEXT_PUBLIC_API_MODE", value: <code className="rounded bg-muted px-1.5 py-0.5 text-compact">{mode}</code> },
          { label: "Origen", value: mode === "mock" ? "Datos de demostración" : "Servidor de la DOYC" },
        ]}
      />
      <p className="mt-3 text-xs text-muted-foreground">
        Solo lectura. Se define al compilar con la variable de entorno NEXT_PUBLIC_API_MODE (mock | http). Con «mock» ningún resultado es oficial: parcelas,
        proyectos y resultados son de demostración.
      </p>
    </SettingsSection>
  );
}
