"use client";

import { BookOpen } from "lucide-react";
import type { ComplianceRule } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

function Quote({ rule }: { rule: ComplianceRule }) {
  if (rule.demo || !rule.regulation.quote) {
    return <p className="rounded-md border border-dashed px-3 py-2 text-sm text-ink-muted">Regla de demostración: no está en el catálogo y no tiene cita literal.</p>;
  }
  return (
    <blockquote className="border-l-2 border-dimension pl-3 text-sm text-ink italic">
      «{rule.regulation.quote}»
    </blockquote>
  );
}

function Source({ rule }: { rule: ComplianceRule }) {
  const { norma, article, sourcePage } = rule.regulation;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-ink-muted">Norma</dt>
      <dd className="text-ink">{norma}</dd>
      <dt className="text-ink-muted">Artículo</dt>
      <dd className="text-ink">{article}</dd>
      <dt className="text-ink-muted">Página</dt>
      <dd className="tabular text-ink">{sourcePage ?? "—"}</dd>
    </dl>
  );
}

/** Norma, artículo, página y cita literal (principio «cita siempre»), con diálogo «Ver norma». */
export function RegulationBlock({ rule }: { rule: ComplianceRule }) {
  return (
    <div className="flex flex-col gap-2">
      <Source rule={rule} />
      <Quote rule={rule} />
      <Dialog>
        <DialogTrigger render={<Button variant="outline" size="sm" className="self-start" />}>
          <BookOpen aria-hidden />
          Ver norma
        </DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{rule.regulation.article}</DialogTitle>
            <DialogDescription>{rule.regulation.norma}</DialogDescription>
          </DialogHeader>
          <Quote rule={rule} />
          <p className="tabular text-xs text-ink-muted">
            Regla {rule.id} · versión {rule.version} · estado {rule.state}
            {rule.regulation.sourcePage ? ` · página ${rule.regulation.sourcePage}` : ""}
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cerrar</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
