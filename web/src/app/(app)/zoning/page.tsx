import type { Metadata } from "next";
import { ZoningView } from "@/features/zoning/components/zoning-view";

export const metadata: Metadata = { title: "Zonificación" };

export default function ZoningPage() {
  return <ZoningView />;
}
