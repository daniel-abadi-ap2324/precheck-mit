import type { Metadata } from "next";
import { GisView } from "@/features/gis/components/gis-view";

export const metadata: Metadata = { title: "Mapa" };

export default async function MapPage({ searchParams }: PageProps<"/map">) {
  const { parcel } = await searchParams;
  return <GisView initialParcelId={typeof parcel === "string" && parcel ? parcel : null} />;
}
