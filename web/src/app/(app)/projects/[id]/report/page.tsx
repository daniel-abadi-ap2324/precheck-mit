import type { Metadata } from "next";
import { ReportPage } from "@/features/report/components/report-page";

export const metadata: Metadata = { title: "Informe" };

export default async function Page({ params }: PageProps<"/projects/[id]/report">) {
  const { id } = await params;
  return <ReportPage projectId={id} />;
}
