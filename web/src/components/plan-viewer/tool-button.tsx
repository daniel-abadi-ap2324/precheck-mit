"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ToolButtonProps {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  /** Herramientas y conmutadores exponen su estado con aria-pressed. */
  pressed?: boolean;
  disabled?: boolean;
  hint?: string;
  shortcut?: string;
}

/** Botón icónico de la barra del visor, con tooltip y nombre accesible. */
export function ToolButton({ label, icon: Icon, onClick, pressed, disabled, hint, shortcut }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={pressed}
            disabled={disabled}
            focusableWhenDisabled={disabled}
            onClick={onClick}
            className={cn("text-ink", pressed && "bg-brand-soft text-brand hover:bg-brand-soft")}
          />
        }
      >
        <Icon aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {hint ?? label}
        {shortcut ? <span className="ml-1 opacity-70">({shortcut})</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}
