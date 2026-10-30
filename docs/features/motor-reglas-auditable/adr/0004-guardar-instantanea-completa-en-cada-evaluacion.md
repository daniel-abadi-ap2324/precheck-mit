---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "motor-reglas-auditable"
---

# 0004 — Guardar una instantánea completa en cada evaluación

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Tech Lead + responsable del proyecto (pasada socrática de design)

## Context

Reproducir (US-07) exige volver a ejecutar con exactamente lo mismo meses después, aunque los catálogos o el estado de las reglas cambien. La spec §8 fijó que se reproduce con el estado que tenía la regla al evaluar.

## Decision drivers

- Reproducibilidad (§1 QG-1): 100 % de coincidencia cuando no cambió nada.
- Defensa ante impugnación (skill `mupa-auditoria-revision`).

## Considered options

1. **Instantánea completa**: contenido de cada versión de regla usada, su estado de aprobación, hechos con fuente, fecha de presentación, umbral y versión del motor.
2. **Referencia por hash** al catálogo.

## Decision outcome

**Chosen:** Instantánea completa. Reproducir no depende de que el catálogo sobreviva ni de su estado actual; «qué cambiaría hoy» es un informe aparte.

## Consequences

**Positive**
- Evaluación autocontenida y demostrable.

**Negative**
- Más espacio por evaluación (§7).

**Neutral**
- Se puede deduplicar el contenido por hash dentro de la bitácora sin cambiar la semántica.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4, §6
