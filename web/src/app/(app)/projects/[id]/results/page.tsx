import type { Metadata } from "next";
import { ResultsPage } from "@/features/results/components/results-page";

export const metadata: Metadata = { title: "Resultados" };

export default async function Page({ params }: PageProps<"/projects/[id]/results">) {
  const { id } = await params;
  return <ResultsPage projectId={id} />;
}
