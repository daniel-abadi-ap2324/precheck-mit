---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "motor-reglas-auditable"
---

# 0003 — Encadenar por expediente y en una cadena de reglas

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Tech Lead + responsable del proyecto (pasada socrática de design)

## Context

Hay eventos de expediente (evaluar, decidir, visto bueno, reproducir) y eventos de gobierno de reglas (proponer, aprobar, rechazar, retirar, suspender, designar) que no pertenecen a ningún expediente. La prueba de los cuatro ojos debe ser tan verificable como la de una evaluación.

## Decision drivers

- Integridad verificable (§1 QG-2).
- US-08: verificar un expediente concreto.
- Proteger quién aprobó qué (spec §6.1).

## Considered options

1. **Por expediente + cadena de reglas**, con un sello conjunto de todas las cabezas.
2. **Una cadena global única** con todos los eventos.

## Decision outcome

**Chosen:** Por expediente + cadena de reglas. Un expediente se verifica sin leer los demás, y el sello conjunto (ADR-0007) detecta que desaparezca una cadena entera.

## Consequences

**Positive**
- La verificación por expediente es local.
- Una rectificación toca una sola cadena.

**Negative**
- Hay que sellar varias cabezas en lugar de una.

**Neutral**
- La cadena de reglas es única y la leen todas las evaluaciones.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4, §5
