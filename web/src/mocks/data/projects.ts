import type { Notification, Plan, Project, Reviewer } from "@/types";

export const reviewers: Reviewer[] = [
  { id: "P-0002", name: "Arq. Ejemplo Uno", role: "revisor_doyc" },
  { id: "P-0003", name: "Ing. Ejemplo Dos", role: "revisor_doyc" },
  { id: "P-0004", name: "Arq. Ejemplo Tres", role: "aprobador" },
];

export const currentUser = { ...reviewers[0], email: "lucia.barrios@example.test" };

export const projects: Project[] = [
  { id: "prj-betania-01", name: "Residencia Betania 01", propertyId: "PAR-081400", parcelId: "PAR-081400", finca: "083076", address: "Lote de demostración 1, Betania", corregimiento: "Betania", projectType: "Residencial multifamiliar", applicant: "Arq. Test Usuario", zoningCode: "RM-2", status: "REVIEW_REQUIRED", precheckId: "pc-betania-01", updatedAt: "2026-09-26T14:02:41Z", complianceIndex: 73 },
  { id: "prj-betania-08", name: "Torre Betania 08", propertyId: "PAR-081407", parcelId: "PAR-081407", finca: "083052", address: "Lote de demostración 8, Betania", corregimiento: "Betania", projectType: "Uso mixto", applicant: "Constructora Ejemplo S.A.", zoningCode: "RM-2", status: "PROCESSING", updatedAt: "2026-09-27T09:15:00Z" },
  { id: "prj-betania-13", name: "Edificio Betania 13", propertyId: "PAR-081412", parcelId: "PAR-081412", finca: "083830", address: "Lote de demostración 13, Betania", corregimiento: "Betania", projectType: "Residencial multifamiliar", applicant: "Ing. Test Ejemplo", zoningCode: "RM-2", status: "COMPLETED", updatedAt: "2026-09-24T16:40:00Z", complianceIndex: 91 },
  { id: "prj-betania-21", name: "Local comercial Betania 21", propertyId: "PAR-081420", parcelId: "PAR-081420", finca: "083896", address: "Lote de demostración 21, Betania", corregimiento: "Betania", projectType: "Comercial", applicant: "Comercios Demo S.A.", zoningCode: "RM-2", status: "DRAFT", updatedAt: "2026-09-25T11:05:00Z" },
  { id: "prj-betania-26", name: "Residencial Betania 26", propertyId: "PAR-081425", parcelId: "PAR-081425", finca: "083848", address: "Lote de demostración 26, Betania", corregimiento: "Betania", projectType: "Residencial multifamiliar", applicant: "Arq. Prueba Demo", zoningCode: "RM-2", status: "FAILED", updatedAt: "2026-09-23T08:30:00Z" },
  { id: "prj-betania-32", name: "Condominio Betania 32", propertyId: "PAR-081431", parcelId: "PAR-081431", finca: "083189", address: "Lote de demostración 32, Betania", corregimiento: "Betania", projectType: "Residencial multifamiliar", applicant: "Desarrollos Test S.A.", zoningCode: "RM-2", status: "COMPLETED", updatedAt: "2026-09-20T13:12:00Z", complianceIndex: 86 },
];

export const plans: Plan[] = [
  { id: "plan-a101", projectId: "prj-betania-01", fileName: "A-101_planta-de-conjunto.pdf", format: "PDF", sizeBytes: 4_812_331, status: "ready", progress: 100, sheets: [{ id: "A-101", name: "A-101 · Planta de conjunto", widthM: 40, heightM: 54 }] },
  { id: "plan-a201", projectId: "prj-betania-01", fileName: "A-201_plantas-arquitectonicas.dwg", format: "DWG", sizeBytes: 12_304_118, status: "ready", progress: 100, sheets: [] },
  { id: "plan-ifc", projectId: "prj-betania-01", fileName: "modelo-betania-01.ifc", format: "IFC", sizeBytes: 38_912_004, status: "ready", progress: 100, sheets: [] },
];

export const notifications: Notification[] = [
  { id: "n1", title: "PreCheck terminado", body: "Residencia Betania 01: 7 reglas no cumplen y 3 requieren revisión.", createdAt: "2026-09-26T14:02:41Z", read: false, href: "/projects/prj-betania-01/precheck" },
  { id: "n2", title: "Asignación", body: "Le asignaron Torre Betania 08.", createdAt: "2026-09-27T09:16:00Z", read: false, href: "/projects/prj-betania-08" },
  { id: "n3", title: "Regla retirada", body: "Una versión de regla usada en Edificio Betania 13 fue retirada.", createdAt: "2026-09-25T10:00:00Z", read: true, href: "/rules" },
];
