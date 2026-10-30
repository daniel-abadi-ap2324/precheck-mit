import type { Metadata } from "next";
import { RulesView } from "@/features/rules/components/rules-view";

export const metadata: Metadata = { title: "Reglas" };

export default async function RulesPage({ searchParams }: PageProps<"/rules">) {
  const { zoning } = await searchParams;
  return <RulesView initialZoning={typeof zoning === "string" && zoning ? zoning : undefined} />;
}
