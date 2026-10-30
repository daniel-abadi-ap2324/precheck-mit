"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/** MapLibre necesita window: se carga solo en el cliente. */
export const MapViewer = dynamic(() => import("./map-viewer").then((m) => m.MapViewer), {
  ssr: false,
  loading: () => <Skeleton className="size-full min-h-map-sm" />,
});
export type { MapDrawing, MapFocus, MapViewerProps, MapLayerKey, MapViewport } from "./map-viewer";
