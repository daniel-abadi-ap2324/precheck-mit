---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "motor-reglas-auditable"
---

# 0008 — Suspender normas con un evento separado de la vigencia

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Tech Lead + responsable del proyecto (pasada socrática de design)

## Context

La demanda de nulidad del PLOT exige poder suspender una norma completa. AC-12 prohíbe tocar la vigencia de una versión aprobada.

## Decision drivers

- AC-20: suspensión en bloque sin reescribir resultados.
- AC-12: inmutabilidad de las versiones aprobadas.

## Considered options

1. **Evento de suspensión reversible**: por norma, con alcance a sus derivadas; un aprobador lo propone y otro lo confirma; se levanta con otro evento de cuatro ojos; rige para toda evaluación posterior.
2. **Suspensión no reversible**: el evento suspende de forma definitiva y, si la CSJ desestima la demanda, se aprueban versiones nuevas.

## Decision outcome

**Chosen:** Evento de suspensión reversible, que no toca la vigencia (AC-12). La variante no reversible obligaría a crear y aprobar de nuevo unas 650 versiones si la CSJ desestima la demanda.

## Consequences

**Positive**
- Se suspende y se levanta en una sola acción auditada.
- Los resultados previos se marcan como afectados sin modificarlos.

**Negative**
- Suspender exige dos aprobadores disponibles, lo que puede retrasar la reacción ante una nulidad.

**Neutral**
- La lista de normas derivadas vive en la configuración de normas.
- Como la aprobación y el retiro, la suspensión afecta el estado de una versión a la fecha de evaluación; la versión se sigue eligiendo por fecha de presentación (AC-02).

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4
