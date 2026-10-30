import type { Highlight } from "./types";

const KIND_LABEL: Record<Highlight["kind"], string> = {
  boundary: "lindero",
  building: "huella de edificación",
  measurement: "cota",
  area: "área",
  point: "punto",
};

/** Descripción textual del resaltado para lectores de pantalla. */
export function describeHighlights(highlights: Highlight[]): string {
  return highlights.map((h) => (h.label ? `${KIND_LABEL[h.kind]} «${h.label}»` : KIND_LABEL[h.kind])).join("; ");
}
