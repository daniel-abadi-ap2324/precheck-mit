/** Qué lector relee el recuadro de datos de las hojas escaneadas (las vectoriales traen el texto y no usan OCR). */
export const LECTORES_OCR = ["glm", "rapido", "claude"] as const;
export type LectorOcr = (typeof LECTORES_OCR)[number];

/** El que no exige nada más que Tesseract: GLM-OCR pide Ollama y Claude pide Claude Code. */
export const LECTOR_OCR_POR_DEFECTO: LectorOcr = "rapido";

export const DESCRIPCION_OCR: Record<LectorOcr, { titulo: string; detalle: string }> = {
  glm: { titulo: "GLM-OCR", detalle: "El más exacto. Corre en esta computadora con Ollama (el plano no sale de ella), pero tarda unos 8 minutos por plano escaneado." },
  rapido: { titulo: "Rápido", detalle: "Tesseract y RapidOCR: de uno a tres minutos por plano escaneado, pero se equivoca más en los números; le pedirá confirmar más datos." },
  claude: { titulo: "Claude", detalle: "Sonnet relee el recuadro con Claude Code: unos 15 segundos, gasta cuota de la cuenta y envía el recorte a Anthropic." },
};

export const esLectorOcr = (v: unknown): v is LectorOcr => typeof v === "string" && (LECTORES_OCR as readonly string[]).includes(v);

/** Variables de entorno del lector de planos (precheck/planos: lector_glm y lector_claude) para cada opción. */
export function entornoOcr(lector: LectorOcr | undefined): Record<string, string> {
  switch (lector ?? LECTOR_OCR_POR_DEFECTO) {
    case "glm":
      return { PRECHECK_OCR_GLM: "1", PRECHECK_OCR_CLAUDE: "0" };
    case "claude":
      return { PRECHECK_OCR_GLM: "0", PRECHECK_OCR_CLAUDE: "1" };
    case "rapido":
      return { PRECHECK_OCR_GLM: "0", PRECHECK_OCR_CLAUDE: "0" };
  }
}
