---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Security Lead"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "motor-reglas-auditable"
supersedes: []
amends: ["0003"]
---

# 0010 — Calcular el hash sobre el sobre completo del evento, incluido `cadena_id`

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Tech Lead + Security Lead (tarea «sellar y verificar», commit `e21278b`)

## Context

ADR-0003 encadena los eventos por expediente y en una cadena de reglas. Si el hash cubriera solo el `payload`, alguien con acceso al archivo podría hacer tres cosas sin romper la cadena:

- cambiar el `actor` o el `rol` de un evento, es decir, quién aprobó;
- cambiar su fecha;
- mover el evento a otra cadena con el mismo hash previo.

## Decision drivers

- QG-2: detectar el 100 % de las alteraciones previas al último anclaje.
- La atribución (quién hizo qué) es parte de lo que se audita, no un metadato.

## Considered options

1. **Hash del sobre canónico completo:** `cadena_id`, `tipo`, `actor`, `rol`, `ocurrido_en` y `payload`, encadenado con el hash previo.
2. Hash solo del `payload`, con las columnas del sobre protegidas por la base.
3. Un hash global único para todas las cadenas.

## Decision outcome

**Chosen:** opción 1. `hash = SHA-256(hash_previo + canonico(sobre))`, con JSON canónico (claves ordenadas, UTF-8, sin espacios; `precheck/auditoria/canonico.py`, `precheck/auditoria/cadena.py:sobre`). `verificar` recalcula el sobre de cada evento, así que un cambio de actor, rol, fecha o cadena señala el primer `seq` roto.

## Consequences

**Positive**
- No se puede reatribuir, fechar de nuevo ni trasladar un evento sin que `verificar` lo detecte.
- Las cadenas siguen siendo independientes (ADR-0003). El sello (ADR-0007) ancla la cabeza de cada una.

**Negative**
- El formato del sobre queda congelado. Agregar un campo al sobre cambia todos los hashes y exige una versión nueva del formato de la bitácora.

**Neutral**
- El contenido de las reglas (`contenido_regla`) se direcciona por su propio hash (`hash_contenido`) y entra en `verificar` y en el sello (revisión M2).

## Links

- SAD: [[../sad.md]] §8, §6 flujo 10
- Enmienda: [[0003-encadenar-por-expediente-y-en-una-cadena-de-reglas.md]]
- Revisión: [[../_review/review-2026-09-27.md]] M2, M3
