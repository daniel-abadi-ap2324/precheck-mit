"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Proyecto y PreCheck abiertos, para que «Guardar» funcione en cualquier diseño del espacio de trabajo sin pasar props. */
export interface ContextoMarcador {
  projectId: string;
  precheckId: string | null;
  proyecto: string;
}

const Contexto = createContext<ContextoMarcador | null>(null);

export function MarcadorProvider({ value, children }: { value: ContextoMarcador | null; children: ReactNode }) {
  return <Contexto.Provider value={value}>{children}</Contexto.Provider>;
}

/** null fuera de un proyecto (p. ej. en el informe): ahí no se ofrece guardar. */
export const useContextoMarcador = () => useContext(Contexto);
