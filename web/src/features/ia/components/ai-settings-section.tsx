"use client";

import { useState } from "react";
import { FactList, Callout } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SettingsSection } from "@/features/settings/components/settings-section";
import type { ConfigIa, ProveedorIa } from "@/services/ia/cliente";
import { useConfigIa, useGuardarConfigIa } from "../hooks";

const PROVEEDORES: { id: ProveedorIa; nombre: string }[] = [
  { id: "claude-code", nombre: "Claude Code en este equipo (desarrollo)" },
  { id: "anthropic-api", nombre: "API de Anthropic con llave" },
  { id: "deepseek-api", nombre: "API de DeepSeek (llave en el servidor; en prueba)" },
  { id: "ninguno", nombre: "Apagada" },
];

/** A menos de esto del tope, DeepSeek corta a mitad de una revisión (cada una puede gastar hasta 0.60 USD). */
const MARGEN_TOPE_USD = 2;

/** «Gasto acumulado: 10.40 de 20 USD · llave configurada». */
export function textoDeepSeek(d: ConfigIa["deepseek"]): string {
  return `Gasto acumulado: ${d.gastoUsd.toFixed(2)} de ${d.topeUsd} USD (${d.llamadas} llamadas) · ${d.llave ? "llave configurada" : "sin llave"}`;
}

/** Avisos de DeepSeek cuando es el proveedor elegido: sin llave no arranca y cerca del tope se corta. */
function AvisosDeepSeek({ d }: { d: ConfigIa["deepseek"] }) {
  const restante = d.topeUsd - d.gastoUsd;
  return (
    <>
      {!d.llave ? (
        <Callout tone="fail" title="Falta la llave de DeepSeek">
          Defina DEEPSEEK_API_KEY en el servidor o en ~/.config/precheck/deepseek.env. Sin ella la revisión con IA no arranca.
        </Callout>
      ) : null}
      {restante <= 0 ? (
        <Callout tone="fail" title="Tope de gasto de DeepSeek alcanzado">
          Se gastaron {d.gastoUsd.toFixed(2)} de {d.topeUsd} USD: no se lanzan más revisiones hasta subir el tope (PRECHECK_DEEPSEEK_TOPE_USD).
        </Callout>
      ) : restante < MARGEN_TOPE_USD ? (
        <Callout tone="warning" title="DeepSeek cerca del tope de gasto">
          Quedan {restante.toFixed(2)} USD de {d.topeUsd}: una revisión puede quedar cortada a medias.
        </Callout>
      ) : null}
    </>
  );
}

/** Proveedor y modelo de la revisión con IA, y la llave de la API (se escribe, nunca se muestra). */
export function AiSettingsSection() {
  const config = useConfigIa();
  const guardar = useGuardarConfigIa();
  const [llave, setLlave] = useState("");
  const c = config.data;

  return (
    <SettingsSection
      id="revision-ia"
      title="Revisión con IA"
      description="El motor de reglas decide lo que puede; la IA (agente revisor-planos) decide las reglas que quedan en revisión. El resultado sigue siendo preliminar."
    >
      {config.error ? <Callout tone="fail">{config.error.message}</Callout> : null}
      {c ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ia-proveedor">Proveedor</Label>
              {/* Solo el proveedor: el servidor pasa al modelo por defecto del nuevo y devuelve su lista de modelos. */}
              <NativeSelect id="ia-proveedor" value={c.proveedor} onChange={(e) => guardar.mutate({ proveedor: e.target.value as ProveedorIa })} disabled={guardar.isPending}>
                {PROVEEDORES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ia-modelo">Modelo</Label>
              <NativeSelect id="ia-modelo" value={c.modelo} onChange={(e) => guardar.mutate({ modelo: e.target.value })} disabled={guardar.isPending || c.proveedor === "ninguno"}>
                {c.modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="ia-modelo-escaneados">Modelo para planos escaneados</Label>
              {/* Vacío = el mismo modelo de la revisión. Un modelo de otro proveedor corre con el proveedor que lo sirva. */}
              <NativeSelect
                id="ia-modelo-escaneados"
                value={c.modeloEscaneados ?? ""}
                onChange={(e) => guardar.mutate({ modeloEscaneados: e.target.value || null })}
                disabled={guardar.isPending || c.proveedor === "ninguno"}
              >
                <option value="">El mismo de la revisión</option>
                {c.modelosEscaneados.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-2xs text-muted-foreground">
                Un plano con más de la mitad de las hojas sin capa de texto se revisa con este modelo; el estado de la revisión dice cuál se pidió y cuál corrió.
              </p>
            </div>
          </div>
          <FactList
            rows={[
              { label: "Claude Code", value: c.claudeCodeDisponible ? "Disponible" : "No encontrado" },
              { label: "Llave de Anthropic", value: c.llaveConfigurada ? (c.origenLlave === "entorno" ? "Configurada (variable ANTHROPIC_API_KEY)" : "Configurada") : "Sin configurar" },
              { label: "DeepSeek", value: <span data-testid="estado-deepseek">{textoDeepSeek(c.deepseek)}</span> },
            ]}
          />
          {c.proveedor === "deepseek-api" ? <AvisosDeepSeek d={c.deepseek} /> : null}
          <form
            className="flex flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              guardar.mutate({ llave: llave.trim() }, { onSuccess: () => setLlave("") });
            }}
          >
            <Label htmlFor="ia-llave">Llave de la API de Anthropic</Label>
            <div className="flex flex-wrap gap-2">
              <Input id="ia-llave" type="password" autoComplete="off" value={llave} onChange={(e) => setLlave(e.target.value)} placeholder="sk-ant-…" className="h-8 w-72" />
              <Button type="submit" size="sm" disabled={!llave.trim()} loading={guardar.isPending}>
                Guardar llave
              </Button>
              {c.origenLlave === "web" ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => guardar.mutate({ llave: null })}>
                  Borrar llave
                </Button>
              ) : null}
            </div>
            <p className="text-2xs text-muted-foreground">
              La llave queda en este equipo (web/.data/ia.secreto.json, sin cifrar y fuera del repositorio) y nunca se muestra ni se envía al navegador. También se puede
              definir ANTHROPIC_API_KEY en web/.env.local.
            </p>
          </form>
          {guardar.error ? <Callout tone="fail">{guardar.error.message}</Callout> : null}
        </div>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Consultando la configuración…
        </p>
      )}
    </SettingsSection>
  );
}
