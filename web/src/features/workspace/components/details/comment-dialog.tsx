"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MessageSquarePlus } from "lucide-react";
import { describedBy, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  text: z.string().trim().min(3, "Escriba al menos 3 caracteres.").max(1000, "Máximo 1000 caracteres."),
});
type Values = z.infer<typeof schema>;

interface Props {
  ruleId: string;
  pending: boolean;
  onSubmit: (text: string) => Promise<unknown>;
}

export function CommentDialog({ ruleId, pending, onSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { text: "" } });
  const error = form.formState.errors.text;
  const submit = form.handleSubmit(async ({ text }) => {
    await onSubmit(text);
    form.reset();
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <MessageSquarePlus aria-hidden />
        Agregar comentario
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Agregar comentario</DialogTitle>
            <DialogDescription className="tabular">Sobre la regla {ruleId}</DialogDescription>
          </DialogHeader>
          <FormField id="comment-text" label="Comentario" error={error?.message}>
            <Textarea id="comment-text" rows={4} aria-invalid={Boolean(error)} aria-describedby={describedBy("comment-text", { error })} {...form.register("text")} />
          </FormField>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" loading={pending}>
              {pending ? "Guardando…" : "Guardar comentario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
