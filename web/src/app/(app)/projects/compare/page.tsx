import type { Metadata } from "next";
import { PageHeader } from "@/components/common";
import { CompararPagina } from "@/features/compare/components/comparar-pagina";

export const metadata: Metadata = { title: "Comparar modelos" };

export default async function Page({ searchParams }: PageProps<"/projects/compare">) {
  const { ids } = await searchParams;
  const inicial = (typeof ids === "string" ? ids.split(",") : []).filter((i) => /^prj-web-[0-9a-f]{12}$/.test(i)).slice(0, 9);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Comparar modelos"
        description="Qué concluyó cada modelo de IA al revisar el mismo plano y, si quiere el detalle, sus resultados lado a lado."
      />
      <CompararPagina inicial={inicial} />
    </div>
  );
}
