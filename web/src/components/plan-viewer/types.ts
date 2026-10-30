import type { ReactNode } from "react";
import type { GeometryReference } from "@/types";

/** Visibilidad de capas del visor (compatible con `PlanLayers` del workspace). */
export interface PlanLayerVisibility {
  boundary: boolean;
  building: boolean;
  measurements: boolean;
  annotations: boolean;
  grid: boolean;
}

export type PlanLayerKey = keyof PlanLayerVisibility;

export type PlanViewerTool = "select" | "pan" | "measure";

export interface PlanRenderContext {
  layers: PlanLayerVisibility;
  /** Píxeles por metro en el zoom actual (para grosores y textos de tamaño constante). */
  scale: number;
}

/**
 * Fuente de una lámina. Hoy la implementa un plano SVG de demostración;
 * un visor PDF/CAD real solo tiene que cumplir esta interfaz.
 * Coordenadas en metros del terreno, origen arriba a la izquierda, y hacia abajo.
 */
export interface PlanSource {
  sheetId: string;
  name: string;
  widthM: number;
  heightM: number;
  render: (ctx: PlanRenderContext) => ReactNode;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type Highlight = GeometryReference;
