import type { Metadata } from "next";
import { PageHeader } from "@/components/common";
import { NewPreCheckWizard } from "@/features/wizard";

export const metadata: Metadata = { title: "Nuevo PreCheck" };

export default function NewPreCheckPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
      <PageHeader title="Nuevo PreCheck" description="Cargue el plano en PDF: el sistema lo lee y solo le pregunta lo que no pudo comprobar." />
      <NewPreCheckWizard />
    </div>
  );
}
