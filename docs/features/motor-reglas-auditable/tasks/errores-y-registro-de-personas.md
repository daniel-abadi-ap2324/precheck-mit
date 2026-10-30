---
id: T5
title: "Crear ErrorPreCheck y el registro de personas derivado de eventos"
layer: "domain"
deps: ["T2"]
blocks: ["T7", "T9"]
acs: ["AC-10", "AC-11"]
files_hint: ["precheck/errores.py", "precheck/personas/registro.py"]
owner: "<TBD lead>"
estimate: "S"
context_budget: "M"
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T5 — Crear ErrorPreCheck y el registro de personas derivado de eventos

## Place in the sequence

- **Blocked by:** T2 — Implementar el canónico JSON y la cadena de eventos del dominio · **Blocks:** T7 — Implementar proponer versiones con verificación de cita, T9 — Implementar inicializar, vincular cuenta, designar y confirmar propuestas · **Wave:** 2 (empieza cuando terminan sus dependencias).
- **Lane:** carril propio.

## Why (user story)

> **As a** Revisor aprobador
> **I want** aprobar o rechazar una versión de regla redactada por otra persona
> **So that** solo reglas validadas por un segundo par de ojos emitan resultados oficiales
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

Crear ErrorPreCheck y el registro de personas derivado de eventos: aporta la parte de US-04 que cubren AC-10, AC-11.

## Inlined context

> **Chosen:** Registro de personas. Cierra el hueco de las dos cuentas sin gestión de claves; la firma criptográfica queda como deuda aceptada hasta la API.
>
> — `adr/0006-identificar-personas-con-un-registro-de-personas.md, Decision outcome, verbatim` · full text: [0006-identificar-personas-con-un-registro-de-personas.md](../adr/0006-identificar-personas-con-un-registro-de-personas.md)

> | Identidad | El núcleo resuelve la persona desde la cuenta con el puerto `ResolutorIdentidad`; nunca confía en una persona pasada por el llamador. Todo evento lleva `persona_id` y rol | ADR-0006 |
>
> — `sad.md §8, verbatim` · full text: [sad.md](../sad.md)

> | Cuatro ojos | Aprobar una versión, suspender o levantar una norma y designar aprobadores exigen dos personas distintas: una propone y otra confirma; solo rige lo confirmado. La primera designación la registra el responsable del proyecto al instalar, como evento génesis | ADR-0006, ADR-0008 |
>
> — `sad.md §8, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes.

## API contract

> ```python
> class ErrorPreCheck(Exception):
>     codigo: str          # "<modulo>.<error>", ver la tabla de contracts/cli.md
>     mensaje: str
>     detalles: Mapping
> ```
>
> Subclases por módulo (`ErrorExpediente`, `ErrorDecision`, `ErrorRegla`, `ErrorGobierno`, `ErrorIdentidad`). Los fallos de evaluación de una regla nunca son excepción: producen REQUIERE_REVISION (sad §8).
>
> — `contracts/public-api.md §Errores, verbatim` · full text: [public-api.md](../contracts/public-api.md)

> | `codigo` | Mensaje (plantilla) | AC / flujo |
> |---|---|---|
> | `expediente.sin_fecha_presentacion` | Falta la fecha de presentación; sin ella no se puede determinar la norma aplicable. | AC-03 · flujo 1 |
> | `expediente.evaluacion_inexistente` | La evaluación indicada no existe en la bitácora del expediente. | flujos 7–9 |
> | `expediente.evaluacion_no_vigente` | Hay una evaluación más reciente; decida sobre ella. | flujo 8 |
> | `decision.motivo_obligatorio` | El motivo es obligatorio. | AC-14 · flujo 7 |
> | `decision.accion_no_aplicable` | Esa acción no aplica al resultado indicado. | flujo 7 |
> | `regla.cita_no_encontrada` | La cita no se encuentra en el texto fuente. | AC-08 · flujo 4 |
> | `regla.inmutable` | Una regla registrada no se edita; cree una versión nueva. | AC-12 · flujo 5 |
> | `regla.version_inexistente` | La versión indicada no existe. | flujos 2, 5 |
> | `regla.vigencia_solapada` | Ya hay una versión aprobada cuya vigencia se solapa. | ADR-0005 |
> | `regla.estado_invalido` | La acción no es válida en el estado actual de la versión. | flujo 5 |
> | `gobierno.auto_aprobacion` | Nadie puede aprobar una regla que redactó. | AC-10 · flujo 2 |
> | `gobierno.sin_designacion` | Solo un revisor aprobador designado puede hacerlo. | AC-11 · flujo 2 |
> | `gobierno.sin_segunda_persona` | Requiere la confirmación de otra persona. | flujo 6 |
> | `gobierno.motivo_obligatorio` | El motivo es obligatorio. | flujos 5, 6 |
> | `gobierno.propuesta_inexistente` | La propuesta indicada no existe. | flujo 6 |
> | `gobierno.propuesta_ya_resuelta` | La propuesta ya fue confirmada. | flujo 6 |
> | `gobierno.norma_desconocida` | La norma indicada no existe en la configuración de normas. | flujo 6 |
> | `gobierno.ya_inicializado` | El registro de personas ya fue inicializado. | ADR-0006 |
> | `identidad.cuenta_no_vinculada` | Su cuenta no está vinculada a una persona del registro. | ADR-0006 |
> | `identidad.cuenta_ya_vinculada` | La cuenta ya está vinculada a otra persona. | ADR-0006 |
> | `identidad.sin_rol` | Su persona no tiene el rol necesario para esta acción. | spec §6.1 (OQ en spec §8) |
>
> — `contracts/cli.md §Tabla de errores, verbatim` · full text: [cli.md](../contracts/cli.md)

## Acceptance criteria

### AC-10 — authorization

> **Given** una versión en borrador redactada por el mismo Revisor aprobador
> **When** intenta aprobarla
> **Then** el sistema lo impide y le explica que nadie puede aprobar una regla que redactó
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — authorization

> **Given** un Revisor DOYC o un Redactor de reglas sin la designación de aprobador
> **When** intenta aprobar una versión de regla
> **Then** el sistema lo impide y le indica que solo un revisor aprobador designado puede aprobar reglas
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `precheck/errores.py`: `ErrorPreCheck(codigo, mensaje, detalles)` y subclases por módulo, con los 21 códigos del contrato
- [ ] `registro.py` (puro): `registro_de_personas(eventos_reglas)` → personas, cuentas vinculadas, roles; solo cuenta lo confirmado por una segunda persona, salvo `designacion_genesis`
- [ ] `puede_aprobar(persona, version_propuesta_por)` → lanza `gobierno.sin_designacion` o `gobierno.auto_aprobacion`; `ResolutorIdentidad` Protocol + `ResolutorCuentaSO`
- [ ] Pruebas en `tests/test_personas.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Una persona con dos cuentas intenta aprobar lo que redactó con la otra | `gobierno.auto_aprobacion` (se compara por persona) |
| Cuenta sin vínculo | `identidad.cuenta_no_vinculada` |
| Designación solo propuesta | no otorga el rol |

## Definition of Done

- [ ] `tests/test_personas.py` cubre AC-10 y AC-11 (regla de dominio) y pasa
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
