"use client";

import { useSyncExternalStore } from "react";
import { brand } from "@/config/brand";
import { SettingsSection } from "./settings-section";

const TOKENS: { name: string; use: string }[] = [
  { name: "--mp-brand", use: "Acción primaria (reemplazable por el azul institucional)" },
  { name: "--mp-ink", use: "Texto principal y barra lateral" },
  { name: "--mp-paper", use: "Fondo de la aplicación" },
  { name: "--mp-sheet", use: "Paneles y tablas" },
  { name: "--mp-line", use: "Bordes" },
  { name: "--mp-plan-grid", use: "Retícula del visor y del mapa" },
  { name: "--mp-dimension", use: "Cotas y resaltado de geometría" },
  { name: "--mp-pass", use: "Cumple" },
  { name: "--mp-fail", use: "No cumple" },
  { name: "--mp-warning", use: "Observación" },
  { name: "--mp-manual", use: "Requiere revisión" },
  { name: "--mp-processing", use: "Procesando" },
];

const noop = () => () => {};

function TokenValue({ name }: { name: string }) {
  const value = useSyncExternalStore(noop, () => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), () => "");
  return <span className="tabular text-muted-foreground uppercase">{value || "—"}</span>;
}

export function IdentitySection() {
  return (
    <SettingsSection
      id="identidad"
      title="Identidad visual"
      description={`Para adoptar la línea gráfica de la Alcaldía se editan dos archivos: src/styles/tokens.css (colores) y src/config/brand.ts (nombre «${brand.productName}», entidad y textos). Ningún componente usa colores literales.`}
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {TOKENS.map((t) => (
          <li key={t.name} className="flex items-center gap-3 rounded-md border p-2 text-sm">
            <span aria-hidden className="size-8 shrink-0 rounded border border-ink/15" style={{ backgroundColor: `var(${t.name})` }} />
            <span className="min-w-0">
              <code className="block text-compact font-medium">{t.name}</code>
              <span className="block text-xs text-muted-foreground">{t.use}</span>
            </span>
            <span className="ml-auto text-xs">
              <TokenValue name={t.name} />
            </span>
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}
