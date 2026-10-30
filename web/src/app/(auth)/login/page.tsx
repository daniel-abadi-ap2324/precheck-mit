import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandIcon } from "@/components/shell";
import { LoginForm } from "@/features/auth/login-form";
import { LoginBackdrop } from "@/features/auth/login-backdrop";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh bg-card lg:grid-cols-[minmax(var(--spacing-panel-lg),1fr)_1.2fr]">
      <div className="flex flex-col justify-between bg-card px-6 py-8 sm:px-12">
        <div className="flex items-center gap-2.5 self-start">
          <BrandIcon tone="line" className="size-10" />
          <span className="text-sm font-semibold text-muted-foreground">{brand.signature}</span>
        </div>
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-3xl font-extrabold tracking-tight text-brand">{brand.productName}</h1>
          <p className="mt-1 text-lg font-semibold">{brand.tagline}</p>
          <p className="mt-3 mb-6 text-sm text-muted-foreground">{brand.loginIntro}</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <div className="flex flex-col gap-4 text-xs text-muted-foreground">
          <p>{brand.preliminaryNotice}</p>
          <p className="border-t border-line pt-4 text-center text-sm">{brand.copyright}</p>
        </div>
      </div>
      <LoginBackdrop />
    </div>
  );
}
