---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "motor-reglas-auditable"
---

# 0005 — Derivar el estado de las reglas de la cadena de reglas

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Tech Lead + responsable del proyecto (pasada socrática de design)

## Context

Hoy el estado vive en el campo `estado_revision` del JSON y el motor descarta los borradores (`motor.py:215`). El principio 4 prohíbe editar reglas en sitio, y la aprobación de cuatro ojos debe quedar en la bitácora.

## Decision drivers

- Principio 4: nada se edita en sitio.
- AC-06: un borrador da REQUIERE_REVISION con indicativo.
- AC-12: una versión aprobada es inmutable.

## Considered options

1. **Estado derivado de la cadena**: el catálogo solo tiene contenido; el estado se calcula de los eventos.
2. **Campo en el JSON** editado junto con un evento paralelo.

## Decision outcome

**Chosen:** Estado derivado de la cadena. Las reglas de selección son: rige la versión aprobada más reciente cuya vigencia cubre la fecha de presentación; un borrador solo agrega su indicativo; no se admiten dos aprobadas con vigencias solapadas; una retirada o sin aprobada da REQUIERE_REVISION; una rechazada es un estado final sin indicativo.

## Consequences

**Positive**
- Una sola fuente de verdad.
- El contenido de una versión se identifica por su hash.

**Negative**
- `estado_revision` del JSON pasa a ser solo informativo; hay que migrar las pruebas que lo usan.

**Neutral**
- El `--modo-prueba` actual deja de ser necesario para ver los borradores.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4
