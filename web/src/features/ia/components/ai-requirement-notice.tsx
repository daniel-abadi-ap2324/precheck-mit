"use client";

import Link from "next/link";
import { CalloutBlock } from "@/components/common";
import type { ConfigIa } from "@/services/ia/cliente";
import { useConfigIa } from "../hooks";

/**
 * ¿Hay con qué llamar a la IA? Solo cuenta el proveedor elegido: con Claude Code se comprueba que esté instalado
 * (si hay sesión iniciada solo se sabe al lanzar); con una API, que haya llave.
 */
export function iaDisponible(config: ConfigIa): boolean {
  switch (config.proveedor) {
    case "claude-code":
      return config.claudeCodeDisponible !== false;
    case "anthropic-api":
      return config.llaveConfigurada;
    case "deepseek-api":
      return config.deepseek?.llave !== false;
    default:
      return false;
  }
}

/**
 * Aviso de que una función necesita la IA: requiere conectar una llave de API o una sesión de Claude. No aparece
 * mientras la IA esté disponible, y nunca bloquea el resto de la aplicación.
 */
export function AiRequirementNotice({ que, className }: { que: string; className?: string }) {
  const config = useConfigIa();
  if (!config.data || iaDisponible(config.data)) return null;
  return (
    <CalloutBlock tone="info" title={`${que} necesita la IA`} className={className}>
      <p>
        Esta función solo funciona si conecta una <strong>llave de API</strong> (Anthropic o DeepSeek) o una <strong>sesión de Claude</strong> (Claude Code
        instalado y con la sesión iniciada con <code className="rounded bg-muted px-1">claude /login</code>). Sin ellas, el motor de reglas y el resto de la
        aplicación funcionan igual.
      </p>
      <p>
        <Link href="/settings#revision-ia" className="font-medium underline underline-offset-2">
          Conectar la IA en Configuración
        </Link>
      </p>
    </CalloutBlock>
  );
}
