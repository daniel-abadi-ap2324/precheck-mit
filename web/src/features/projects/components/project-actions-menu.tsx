"use client";

import Link from "next/link";
import { ClipboardCheck, FileText, FolderOpen, MoreHorizontal } from "lucide-react";
import type { Project } from "@/types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Acciones por fila: navegación real (enlaces), no botones con onClick. */
export function ProjectActionsMenu({ project }: { project: Project }) {
  const base = `/projects/${project.id}`;
  const hasRun = Boolean(project.precheckId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${project.name}`} />}>
        <MoreHorizontal aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem render={<Link href={base} />}>
          <FolderOpen aria-hidden />
          Abrir
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasRun} render={hasRun ? <Link href={`${base}/precheck`} /> : undefined}>
          <ClipboardCheck aria-hidden />
          Revisión
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasRun} render={hasRun ? <Link href={`${base}/report`} /> : undefined}>
          <FileText aria-hidden />
          Informe
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
