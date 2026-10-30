import { CircleCheck, CircleHelp, PencilLine } from "lucide-react";
import type { RegionPlano } from "@/types";
import { ToneBadge } from "@/components/status";
import type { StatusMeta } from "@/lib/status";
import { etiquetaDeOrigen } from "@/lib/regiones";

const CONFIRMADA: StatusMeta = { label: "Confirmada", tone: "pass", icon: CircleCheck };
const EDITADA: StatusMeta = { label: "Editada a mano", tone: "info", icon: PencilLine };
const DIBUJADA: StatusMeta = { label: "Dibujada a mano", tone: "info", icon: PencilLine };
const PROPUESTA: StatusMeta = { label: "Propuesta sin revisar", tone: "manual", icon: CircleHelp };

export function metaDeRegion(r: Pick<RegionPlano, "confirmada" | "editada" | "origen">): StatusMeta {
  if (r.confirmada) return CONFIRMADA;
  if (r.editada) return EDITADA;
  return r.origen === "humano" ? DIBUJADA : PROPUESTA;
}

/** Estado de revisión de una región: icono + color + texto. */
export function EstadoRegion({ region, size = "sm" }: { region: Pick<RegionPlano, "confirmada" | "editada" | "origen">; size?: "sm" | "md" }) {
  return <ToneBadge meta={metaDeRegion(region)} size={size} />;
}

export const porcentaje = (c: number) => `${Math.round(c * 100)} %`;

/** «polígono del PDF · confianza 70 %». */
export const procedencia = (r: Pick<RegionPlano, "origen" | "confianza">) => `${etiquetaDeOrigen[r.origen]} · confianza ${porcentaje(r.confianza)}`;
