import type { Metadata } from "next";
import { RondasPage } from "@/features/rondas/components/rondas-page";

export const metadata: Metadata = { title: "Rondas" };

export default function Page() {
  return <RondasPage />;
}
