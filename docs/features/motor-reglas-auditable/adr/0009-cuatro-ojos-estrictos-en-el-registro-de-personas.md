---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "motor-reglas-auditable"
supersedes: []
amends: ["0006"]
---

# 0009 — Cuatro ojos estrictos en el registro de personas, con génesis de dos aprobadores

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Tech Lead + responsable del proyecto (decidido al resolver los hallazgos A1 y A2 de la revisión)

## Context

ADR-0006 creó el registro de personas, pero dejó abierto quién confirma cada evento. La revisión del 2026-09-27 encontró dos formas de saltarse los cuatro ojos:

- **A1.** `getpass.getuser()` lee `LOGNAME`/`USER`, que controla quien ejecuta el comando.
- **A2.** El propio sujeto podía confirmar su vinculación o su designación. Así podía apropiarse de otra persona o fabricar una segunda identidad.

Con un único aprobador génesis, además, nadie distinto podía confirmar la primera designación.

## Decision drivers

- Ninguna persona sola obtiene un resultado oficial ni un rol (AC-10, AC-11).
- La identidad no puede depender de variables que controla el usuario.
- Sin claves ni firma criptográfica en la v1 (ADR-0006).

## Considered options

1. **Génesis con dos aprobadores y reglas estrictas de confirmación, que se revalidan al derivar.**
2. Un aprobador génesis más una confirmación diferida de la segunda persona.
3. Firma personal con clave (se descartó en ADR-0006 para la v1).

## Decision outcome

**Chosen:** opción 1.

- **Cuenta:** se resuelve por el UID efectivo (`pwd.getpwuid(os.geteuid())`), nunca por variables de entorno (`precheck/personas/registro.py`, `ResolutorCuentaSO`).
- **Génesis:** `inicializar` registra exactamente dos personas distintas con dos cuentas distintas como aprobadores, una sola vez. Si no, `gobierno.sin_segunda_persona` o `gobierno.ya_inicializado`.
- **Vínculo de una persona nueva:** lo acepta la propia persona desde la cuenta propuesta, o lo confirma un aprobador distinto del proponente.
- **Vínculo de una persona existente y designación de rol:** solo los confirma un aprobador distinto del proponente y del sujeto.
- **Revalidación:** `Registro.aplicar` vuelve a comprobar estas reglas al derivar el estado. Un evento que no las cumple se ignora aunque esté en la cadena, así que escribir directamente en la bitácora no otorga roles.

## Consequences

**Positive**
- Desde el primer evento, toda designación la confirma alguien distinto del proponente y del sujeto.
- Suplantar la cuenta con `LOGNAME`/`USER` ya no sirve (prueba de fijación en `tests/test_rerevision.py`).

**Negative**
- La génesis no pasa por cuatro ojos: quien inicializa declara a la segunda persona y su cuenta. Es deuda aceptada (sad §11), mitigada porque la génesis es un evento sellado y visible.
- Arrancar exige dos cuentas del SO reales, también en la prueba de punta a punta de AC-20 por la CLI.

**Neutral**
- Las carreras en `inicializar` y los vínculos duplicados de una misma cuenta quedan diferidos a spec §8 #12, porque SQLite tiene un solo escritor.

## Links

- Spec: [[../spec.md]] §6.1, §8
- SAD: [[../sad.md]] §6 (flujos 11–13), §11
- Revisión: [[../_review/review-2026-09-27.md]] A1, A2
- Enmienda: [[0006-identificar-personas-con-un-registro-de-personas.md]]
