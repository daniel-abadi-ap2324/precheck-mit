import type { Metadata } from "next";
import { ProjectsPage, parseProjectFilters } from "@/features/projects";

export const metadata: Metadata = { title: "Proyectos" };

export default async function Page({ searchParams }: PageProps<"/projects">) {
  const initialFilters = parseProjectFilters(await searchParams);
  return <ProjectsPage initialFilters={initialFilters} />;
}
