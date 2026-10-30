"use client";

import { rutaInterna } from "@/lib/safe-url";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { LogIn } from "lucide-react";
import { describedBy, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/services/api";
import { useSessionStore } from "@/stores/session";

const schema = z.object({
  email: z.string().trim().email("Escriba un correo válido."),
  password: z.string().min(4, "La contraseña tiene al menos 4 caracteres."),
});
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const signIn = useSessionStore((s) => s.signIn);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "lucia.barrios@example.test", password: "demo" } });
  const login = useMutation({
    mutationFn: (v: Values) => api.login(v.email, v.password),
    onSuccess: (session) => {
      signIn(session);
      router.push(rutaInterna(next) ?? "/dashboard");
    },
  });
  const { errors } = form.formState;

  return (
    <form onSubmit={form.handleSubmit((v) => login.mutate(v))} className="flex flex-col gap-4" noValidate>
      <FormField id="email" label="Correo" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="username" aria-invalid={Boolean(errors.email)} aria-describedby={describedBy("email", { error: errors.email })} {...form.register("email")} />
      </FormField>
      <FormField id="password" label="Contraseña" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={Boolean(errors.password)} aria-describedby={describedBy("password", { error: errors.password })} {...form.register("password")} />
      </FormField>
      {login.error ? (
        <p role="alert" className="rounded-md border border-fail/30 bg-fail-soft px-3 py-2 text-sm text-fail">
          {login.error instanceof ApiError ? login.error.message : "No se pudo iniciar sesión."}
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={login.isPending} className="mt-1">
        {login.isPending ? null : <LogIn aria-hidden />}
        {login.isPending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
