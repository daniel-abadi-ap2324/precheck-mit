---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "motor-reglas-auditable"
---

# 0007 — Anclar las cabezas con un sello diario vía puerto

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Tech Lead + responsable del proyecto (pasada socrática de design)

## Context

Una cadena de hashes prueba el orden, pero no protege de quien la reescribe completa y la recalcula (análisis de fallas de la spec). La spec exige detectar la alteración de lo anterior al último anclaje.

## Decision drivers

- Integridad verificable (§1 QG-2) y AC-19b.
- Sin dependencia de red en la v1.

## Considered options

1. **Sello diario vía puerto**: hash de todas las cabezas, registrado y exportado por un `DestinoAnclaje`; la v1 escribe un archivo en un destino de otra unidad.
2. **Autoridad de sellado de tiempo (RFC 3161)** desde la v1.

## Decision outcome

**Chosen:** Sello diario vía puerto. Cumple el AC con lo mínimo y deja cambiar el destino sin tocar el dominio.

## Consequences

**Positive**
- Se detecta una reescritura completa contra el último sello.

**Negative**
- Queda la ventana entre sellos, declarada como riesgo aceptado.

**Neutral**
- El destino exacto sigue abierto (spec §8).

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4, §7
