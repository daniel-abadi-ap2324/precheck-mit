import type { PlanFormat, ProjectStatus } from "@/types";
import { esIdValido } from "@/server/planos/almacen";
import { esIdPreCheck } from "@/server/prechecks/almacen";
import { actualizarProyecto, eliminarProyecto, esIdProyectoWeb, leerProyecto, nombreValido, type CambiosProyecto } from "@/server/proyectos/almacen";
import { error, sinSesion } from "@/server/planos/respuestas";

const sinCache = { "Cache-Control": "private, no-store" };
const noEncontrado = () => error(404, "proyecto.inexistente", "El proyecto no existe.");
const ESTADOS: ProjectStatus[] = ["DRAFT", "PROCESSING", "REVIEW_REQUIRED", "COMPLETED", "FAILED"];
const FORMATOS = ["PDF", "DWG", "DXF", "IFC"];

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  const p = esIdProyectoWeb(id) ? await leerProyecto(id) : null;
  return p ? Response.json(p, { headers: sinCache }) : noEncontrado();
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  if (!esIdProyectoWeb(id) || !(await eliminarProyecto(id))) return noEncontrado();
  return new Response(null, { status: 204 });
}

/**
 * Cambios del proyecto: { name?, status?, precheckId?, complianceIndex?, agregarPlan?: {id, fileName, format, sizeBytes},
 * quitarPlan?: id }. Solo esos campos: los datos del asistente no se reescriben desde aquí.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  if (!esIdProyectoWeb(id)) return noEncontrado();
  const c = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!c || typeof c !== "object" || Array.isArray(c)) return error(400, "proyecto.cambios_invalidos", "El cuerpo debe ser un objeto JSON.");
  const cambios: CambiosProyecto = {};
  if ("name" in c) {
    if (!nombreValido(c.name)) return error(400, "proyecto.nombre_invalido", "El nombre debe tener entre 3 y 120 caracteres, en una sola línea.");
    cambios.name = c.name.trim();
  }
  if ("status" in c) {
    if (!ESTADOS.includes(c.status as ProjectStatus)) return error(400, "proyecto.cambios_invalidos", "Estado no válido.");
    cambios.status = c.status as ProjectStatus;
  }
  if ("precheckId" in c) {
    if (typeof c.precheckId !== "string" || !esIdPreCheck(c.precheckId)) return error(400, "proyecto.cambios_invalidos", "PreCheck no válido.");
    cambios.precheckId = c.precheckId;
  }
  if ("complianceIndex" in c) {
    const n = Number(c.complianceIndex);
    if (!Number.isFinite(n) || n < 0 || n > 100) return error(400, "proyecto.cambios_invalidos", "Índice no válido.");
    cambios.complianceIndex = Math.round(n);
  }
  if ("agregarPlan" in c) {
    const p = (c.agregarPlan ?? {}) as Record<string, unknown>;
    if (typeof p.id !== "string" || !/^plan-[A-Za-z0-9-]{1,60}$/.test(p.id) || !FORMATOS.includes(p.format as string)) {
      return error(400, "proyecto.cambios_invalidos", "Plano no válido.");
    }
    if (p.format === "PDF" && !esIdValido(p.id)) return error(400, "proyecto.cambios_invalidos", "Plano no válido.");
    cambios.agregarPlan = {
      id: p.id,
      fileName: typeof p.fileName === "string" ? p.fileName.slice(0, 200) : p.id,
      format: p.format as PlanFormat,
      sizeBytes: Number.isFinite(Number(p.sizeBytes)) ? Number(p.sizeBytes) : 0,
    };
  }
  if ("quitarPlan" in c) {
    if (typeof c.quitarPlan !== "string") return error(400, "proyecto.cambios_invalidos", "Plano no válido.");
    cambios.quitarPlan = c.quitarPlan;
  }
  const p = await actualizarProyecto(id, cambios);
  return p ? Response.json(p, { headers: sinCache }) : noEncontrado();
}
