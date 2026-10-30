import type { Metadata } from "next";
import { ProcessingScreen } from "@/features/wizard";

export const metadata: Metadata = { title: "Procesando PreCheck" };

export default async function ProcessingPage({ params, searchParams }: PageProps<"/projects/[id]/processing">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const run = typeof query.run === "string" && query.run ? query.run : null;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-8">
      <ProcessingScreen projectId={id} run={run} />
    </div>
  );
}
