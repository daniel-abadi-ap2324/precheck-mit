"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";

/** Quita un proyecto creado en la web de la lista (los planos y PreCheck ya ejecutados quedan en el servidor). */
export function DeleteProject({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  const borrar = useMutation({
    mutationFn: () => api.deleteProject(projectId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
      router.push("/projects");
    },
  });
  return (
    <section aria-label="Eliminar proyecto" className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      {confirmando ? (
        <>
          <p className="text-sm">¿Quitar «{name}» de la lista de proyectos? No se puede deshacer desde la web.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" loading={borrar.isPending} onClick={() => borrar.mutate()}>
              Sí, eliminar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
          </div>
        </>
      ) : (
        <Button size="sm" variant="ghost" className="self-start" onClick={() => setConfirmando(true)}>
          <Trash2 aria-hidden /> Eliminar proyecto
        </Button>
      )}
      {borrar.error ? (
        <p role="alert" className="text-sm text-fail">
          {borrar.error.message}
        </p>
      ) : null}
    </section>
  );
}
