import type { Metadata } from "next";
import { ReportsList } from "@/features/report/components/reports-list";

export const metadata: Metadata = { title: "Informes" };

export default function Page() {
  return <ReportsList />;
}
