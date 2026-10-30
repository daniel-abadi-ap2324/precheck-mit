import type { Metadata } from "next";
import { ProjectPlans } from "@/features/projects";

export const metadata: Metadata = { title: "Planos" };

export default async function Page({ params }: PageProps<"/projects/[id]/plans">) {
  const { id } = await params;
  return <ProjectPlans projectId={id} />;
}
