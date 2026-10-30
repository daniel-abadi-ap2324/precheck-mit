"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { queryKeys } from "@/lib/query-keys";
import { api } from "@/services/api";

/** Cambia el nombre de un proyecto creado en la web: un lápiz junto al título que abre un campo (Enter guarda, Escape cancela). */
export function RenameProject({ projectId, name }: { projectId: string; name: string }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: (nuevo: string) => api.renameProject(projectId, nuevo),
    onSuccess: async (p) => {
      qc.setQueryData(queryKeys.project(projectId), p);
      await qc.invalidateQueries({ queryKey: ["projects"] });
      setEditando(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!editando) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Renombrar el proyecto"
        title="Renombrar el proyecto"
        onClick={() => {
          setTexto(name);
          setError(null);
          setEditando(true);
        }}
      >
        <Pencil aria-hidden />
      </Button>
    );
  }
  const valido = texto.trim().length >= 3 && texto.trim().length <= 120;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valido) return setError("El nombre debe tener entre 3 y 120 caracteres.");
        if (texto.trim() === name) return setEditando(false);
        guardar.mutate(texto.trim());
      }}
    >
      <Input
        aria-label="Nombre del proyecto"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEditando(false)}
        maxLength={120}
        autoFocus
        className="h-8 w-80 max-w-full"
      />
      <Button type="submit" size="sm" loading={guardar.isPending} disabled={!valido}>
        Guardar
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>
        Cancelar
      </Button>
      {error ? (
        <span role="alert" className="text-sm text-fail">
          {error}
        </span>
      ) : null}
    </form>
  );
}
