---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "motor-reglas-auditable"
---

# 0002 — Guardar la bitácora en SQLite de solo anexar tras un puerto

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Tech Lead + responsable del proyecto (pasada socrática de design)

## Context

La bitácora debe ser inalterable, atómica al anexar y reproducible. El núcleo usa solo la biblioteca estándar y la v1 es CLI, sin servidor. La skill `mupa-auditoria-revision` propone PostgreSQL como destino final.

## Decision drivers

- Integridad verificable (§1 QG-2).
- Sin dependencias fuera de la biblioteca estándar en el núcleo (§2).
- Migración futura a la API (spec §3).

## Considered options

1. **SQLite tras un puerto**: biblioteca estándar, transacciones y triggers que prohíben UPDATE y DELETE.
2. **Archivos JSONL tras un puerto**: legibles, alineados con `verificar_cadena.py`, sin atomicidad.

## Decision outcome

**Chosen:** SQLite tras un puerto `RepositorioBitacora`. Da atomicidad y bloqueo de modificaciones sin infraestructura, y el puerto aísla la migración.

## Consequences

**Positive**
- Escrituras atómicas; ningún UPDATE ni DELETE posible por la vía normal.
- Un solo archivo, fácil de respaldar.

**Negative**
- Un escritor a la vez.
- Quien tenga acceso al archivo puede reescribirlo: se mitiga con el sello (ADR-0007).

**Neutral**
- La exportación a JSON conserva la compatibilidad con `verificar_cadena.py`.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4, §7
