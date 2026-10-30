import { execFile } from "node:child_process";
import { claudeCodeDisponible } from "@/server/ia/config";
import type { LectorOcr } from "@/lib/lector-ocr";

export interface DisponibilidadOcr {
  disponible: boolean;
  /** Por qué no se puede usar y qué hace falta; solo si `disponible` es false. */
  motivo?: string;
}

const OLLAMA = process.env.PRECHECK_OLLAMA_URL ?? "http://127.0.0.1:11434";
/** Mismo nombre de modelo que precheck/planos/lector_glm.py. */
const MODELO_GLM = "glm-ocr";

const tesseractInstalado = () =>
  new Promise<boolean>((fin) => {
    execFile("tesseract", ["--version"], { timeout: 10_000, windowsHide: true }, (err) => fin(!err));
  });

async function glmListo(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2500) });
    const { models } = (await res.json()) as { models?: { name?: string }[] };
    return (models ?? []).some((m) => (m.name ?? "").split(":")[0] === MODELO_GLM);
  } catch {
    return false;
  }
}

/**
 * Qué lectores de hojas escaneadas se pueden usar en este equipo, con el motivo de los que no. Se comprueba al
 * pedirlo (Tesseract, Ollama con el modelo, Claude Code) para no ofrecer una opción que fallaría en silencio.
 */
export async function disponibilidadOcr(): Promise<Record<LectorOcr, DisponibilidadOcr>> {
  const [tesseract, glm, claude] = await Promise.all([tesseractInstalado(), glmListo(), claudeCodeDisponible()]);
  return {
    rapido: tesseract ? { disponible: true } : { disponible: false, motivo: "Instale Tesseract y póngalo en el PATH (ver el README); sin él no se pueden leer hojas escaneadas." },
    glm: glm ? { disponible: true } : { disponible: false, motivo: `Necesita Ollama en marcha con el modelo ${MODELO_GLM} (ollama pull ${MODELO_GLM}).` },
    claude: claude
      ? { disponible: true }
      : { disponible: false, motivo: "Necesita Claude Code instalado y con la sesión iniciada (claude /login). No funciona solo con una llave de API." },
  };
}
