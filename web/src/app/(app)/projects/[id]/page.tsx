import { ProjectOverview } from "@/features/projects";

export default async function Page({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  return <ProjectOverview projectId={id} />;
}
