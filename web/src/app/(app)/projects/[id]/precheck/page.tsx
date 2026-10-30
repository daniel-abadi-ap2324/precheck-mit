import { Suspense } from "react";
import type { Metadata } from "next";
import { PreCheckWorkspace, WorkspaceSkeleton } from "@/features/workspace";

export const metadata: Metadata = { title: "Revisión del PreCheck" };

export default async function PreCheckPage({ params }: PageProps<"/projects/[id]/precheck">) {
  const { id } = await params;
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <PreCheckWorkspace projectId={id} />
    </Suspense>
  );
}
