import type { Metadata } from "next";
import { MarcadoresPage } from "@/features/marcadores/components/marcadores-page";

export const metadata: Metadata = { title: "Marcadores" };

export default function Page() {
  return <MarcadoresPage />;
}
