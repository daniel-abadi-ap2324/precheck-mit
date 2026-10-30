import type { Metadata } from "next";
import { ProjectSite } from "@/features/projects";

export const metadata: Metadata = { title: "Lote y zonificación" };

export default async function Page({ params }: PageProps<"/projects/[id]/site">) {
  const { id } = await params;
  return <ProjectSite projectId={id} />;
}
