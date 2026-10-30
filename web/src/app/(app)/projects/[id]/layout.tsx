import { ProjectHeader } from "@/components/project";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  const { id } = await params;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProjectHeader projectId={id} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
