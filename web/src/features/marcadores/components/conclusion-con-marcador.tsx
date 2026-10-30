"use client";

import { ConclusionDictamen } from "@/components/expediente";
import type { DictamenInfo, Project } from "@/types";
import { fotoDeConclusion } from "../lib/marcadores";
import { GuardarMarcador } from "./guardar-marcador";
import { MarcadorProvider } from "./marcador-contexto";

/** Conclusión del dictamen en el resumen del proyecto, con «Guardar» para marcarla como interesante o equivocada. */
export function ConclusionConMarcador({ project, dictamen }: { project: Project; dictamen: DictamenInfo }) {
  return (
    <MarcadorProvider value={{ projectId: project.id, precheckId: project.precheckId ?? null, proyecto: project.name }}>
      <ConclusionDictamen dictamen={dictamen} accion={<GuardarMarcador ruleId={null} foto={(nombre) => fotoDeConclusion(nombre, dictamen.conclusion ?? "")} />} />
    </MarcadorProvider>
  );
}
