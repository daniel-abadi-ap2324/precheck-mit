import type { Metadata } from "next";
import { DashboardPage } from "@/features/dashboard";

export const metadata: Metadata = { title: "Panel" };

export default function Page() {
  return <DashboardPage />;
}
