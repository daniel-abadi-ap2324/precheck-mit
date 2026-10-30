"use client";

import { Flag, UserPlus } from "lucide-react";
import { useReviewers } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useReviewActions } from "../../hooks/use-review-actions";
import { CommentDialog } from "./comment-dialog";

const ROLE_LABEL = { revisor_doyc: "Revisor DOYC", aprobador: "Aprobador", redactor: "Redactor", profesional: "Profesional" } as const;

export function ReviewActions({ precheckId, ruleId }: { precheckId: string; ruleId: string }) {
  const { flagged, comment, flag, assign } = useReviewActions(precheckId, ruleId);
  const reviewers = useReviewers();
  return (
    <div className="flex flex-wrap gap-2">
      <CommentDialog ruleId={ruleId} pending={comment.isPending} onSubmit={(text) => comment.mutateAsync(text)} />
      <Button variant="outline" size="sm" aria-pressed={flagged} disabled={flag.isPending} onClick={() => flag.mutate()} className={flagged ? "border-manual/40 bg-manual-soft text-manual" : undefined}>
        <Flag aria-hidden />
        {flagged ? "Marcada para revisión" : "Marcar para revisión"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={assign.isPending} />}>
          <UserPlus aria-hidden />
          Asignar revisor
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Revisores disponibles</DropdownMenuLabel>
            {reviewers.isLoading ? <DropdownMenuItem disabled>Cargando…</DropdownMenuItem> : null}
            {reviewers.data?.map((r) => (
              <DropdownMenuItem key={r.id} onClick={() => assign.mutate(r)}>
                <span className="flex flex-col">
                  <span>{r.name}</span>
                  <span className="text-xs text-ink-muted">{ROLE_LABEL[r.role]}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
