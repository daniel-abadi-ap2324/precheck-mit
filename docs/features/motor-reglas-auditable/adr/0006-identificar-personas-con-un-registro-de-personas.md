---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "motor-reglas-auditable"
---

# 0006 — Identificar a las personas con un registro de personas

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Tech Lead + responsable del proyecto (pasada socrática de design)

## Context

Los cuatro ojos y la atribución se comparan por persona, no por cuenta (spec §6.1). La v1 es CLI y no tiene autenticación propia.

## Decision drivers

- Negar la autoaprobación aunque una persona tenga dos cuentas (AC-10).
- Sin dependencias criptográficas en el núcleo (§2).

## Considered options

1. **Registro de personas**: identificador personal, roles y designación, en la cadena de reglas, con cuentas del SO vinculadas.
2. **Firma personal con clave** para cada evento.

## Decision outcome

**Chosen:** Registro de personas. Cierra el hueco de las dos cuentas sin gestión de claves; la firma criptográfica queda como deuda aceptada hasta la API.

## Consequences

**Positive**
- La designación de aprobador es un evento auditado de cuatro ojos; la primera es un evento génesis.
- El núcleo resuelve la persona con el puerto `ResolutorIdentidad`; la CLI no la decide.

**Negative**
- El no repudio es débil sin firma: depende de la cuenta del SO.

**Neutral**
- Vincular una cuenta a una persona es un evento más de la cadena de reglas.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4, §8
