"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { segmentLabels } from "@/config/navigation";
import { useProject } from "@/hooks/use-api";

function useCrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const projectId = parts[0] === "projects" && parts[1] && parts[1] !== "new" ? parts[1] : "";
  const project = useProject(projectId);
  return parts.map((part, i) => ({
    href: `/${parts.slice(0, i + 1).join("/")}`,
    label: part === projectId ? (project.data?.name ?? "Proyecto") : (segmentLabels[part] ?? part),
  }));
}

export function Breadcrumbs() {
  const crumbs = useCrumbs();
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((c, i) => (
          <Fragment key={c.href}>
            {i > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem className="min-w-0">
              {i === crumbs.length - 1 ? (
                <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink render={<Link href={c.href} />} className="truncate">
                  {c.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
