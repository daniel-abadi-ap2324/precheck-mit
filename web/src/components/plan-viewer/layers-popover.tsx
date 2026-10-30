"use client";

import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import type { PlanLayerKey, PlanLayerVisibility } from "./types";

const LAYER_LABELS: Record<PlanLayerKey, string> = {
  boundary: "Lindero del lote",
  building: "Edificación",
  measurements: "Cotas",
  annotations: "Rótulos y anotaciones",
  grid: "Retícula",
};

interface Props {
  layers: PlanLayerVisibility;
  onToggle: (key: PlanLayerKey) => void;
}

export function LayersPopover({ layers, onToggle }: Props) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="sm" aria-label="Capas del plano" className="text-ink" />}>
        <Layers aria-hidden />
        <span className="hidden sm:inline">Capas</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <PopoverTitle className="text-sm font-medium">Capas visibles</PopoverTitle>
        <ul className="flex flex-col gap-1">
          {(Object.keys(LAYER_LABELS) as PlanLayerKey[]).map((key) => (
            <li key={key}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted">
                <Checkbox checked={layers[key]} onCheckedChange={() => onToggle(key)} />
                {LAYER_LABELS[key]}
              </label>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
