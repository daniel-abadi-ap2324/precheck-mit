import Link, { type LinkProps } from "next/link";
import type { ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = LinkProps & VariantProps<typeof buttonVariants> & { className?: string; children: ReactNode; "aria-label"?: string };

/** Enlace con aspecto de botón (navegación real, no un botón con onClick). */
export function LinkButton({ variant, size, className, children, ...rest }: Props) {
  return (
    <Link className={cn(buttonVariants({ variant, size }), className)} {...rest}>
      {children}
    </Link>
  );
}
