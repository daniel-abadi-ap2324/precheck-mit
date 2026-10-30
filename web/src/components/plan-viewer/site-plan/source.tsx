import type { PlanSource } from "../types";
import { PlanGrid } from "./grid";
import { SiteContext } from "./site-context";
import { Building } from "./building";
import { SheetAnnotations } from "./annotations";

const WIDTH = 40;
const HEIGHT = 54;

/**
 * Lámina de demostración A-101 «Planta de conjunto» (40 × 54 m).
 * Se reemplaza por un visor PDF/CAD que cumpla `PlanSource`.
 */
export const sitePlanA101: PlanSource = {
  sheetId: "A-101",
  name: "A-101 · Planta de conjunto",
  widthM: WIDTH,
  heightM: HEIGHT,
  render: ({ layers, scale }) => (
    <g data-sheet="A-101">
      <rect width={WIDTH} height={HEIGHT} fill="var(--mp-plan-paper)" />
      {layers.grid ? <PlanGrid width={WIDTH} height={HEIGHT} scale={scale} /> : null}
      <SiteContext scale={scale} layers={layers} />
      {layers.building ? <Building scale={scale} /> : null}
      <SheetAnnotations scale={scale} layers={layers} />
    </g>
  ),
};
