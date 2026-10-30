---
id: T9
title: "Implementar inicializar, vincular cuenta, designar y confirmar propuestas"
layer: "app"
deps: ["T5", "T6"]
blocks: ["T10", "T13"]
acs: ["AC-11"]
files_hint: ["precheck/personas/servicio.py"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T9 — Implementar inicializar, vincular cuenta, designar y confirmar propuestas

## Place in the sequence

- **Blocked by:** T5 — Crear ErrorPreCheck y el registro de personas derivado de eventos, T6 — Implementar RepositorioSQLite detrás del puerto de bitácora · **Blocks:** T10 — Implementar evaluar expediente con degradación, CEUS, cobertura e instantánea, T13 — Implementar suspender y levantar normas con cuatro ojos · **Wave:** 3 (empieza cuando terminan sus dependencias).
- **Lane:** carril propio.

## Why (user story)

> **As a** Revisor aprobador
> **I want** aprobar o rechazar una versión de regla redactada por otra persona
> **So that** solo reglas validadas por un segundo par de ojos emitan resultados oficiales
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

Implementar inicializar, vincular cuenta, designar y confirmar propuestas: aporta la parte de US-04 que cubren AC-11.

## Inlined context

> **Chosen:** Registro de personas. Cierra el hueco de las dos cuentas sin gestión de claves; la firma criptográfica queda como deuda aceptada hasta la API.
>
> — `adr/0006-identificar-personas-con-un-registro-de-personas.md, Decision outcome, verbatim` · full text: [0006-identificar-personas-con-un-registro-de-personas.md](../adr/0006-identificar-personas-con-un-registro-de-personas.md)

> | Cuatro ojos | Aprobar una versión, suspender o levantar una norma y designar aprobadores exigen dos personas distintas: una propone y otra confirma; solo rige lo confirmado. La primera designación la registra el responsable del proyecto al instalar, como evento génesis | ADR-0006, ADR-0008 |
>
> — `sad.md §8, verbatim` · full text: [sad.md](../sad.md)

> - [ ] ¿Qué historia y qué flujo describen el registro de personas (inicialización génesis, vincular cuenta, designar con cuatro ojos)? Default now: lo que fija el contrato CLI (`inicializar`, `vincular-cuenta`, `designar` + `confirmar`). — owner: sequences (+ specify si hace falta una historia), due: before sdd:tasks
>
> — `spec.md §8, OQ registro de personas, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No se modifica el esquema. Solo anexa eventos `designacion_genesis`, `designacion_propuesta`, `designacion_confirmada`, `vinculo_cuenta` en la cadena `reglas`.

## API contract

> #### `inicializar` · `vincular-cuenta` · `designar`
> ```
> inicializar     --persona ID --nombre TEXTO
> vincular-cuenta --persona ID --nombre TEXTO --cuenta CUENTA
> designar        --persona ID --rol redactor|revisor_doyc|aprobador --motivo TEXTO
> ```
> - `inicializar`: solo con la cadena de reglas vacía de personas. Registra a quien lo ejecuta como aprobador génesis, vinculado a su cuenta. Es deuda aceptada (sad §11).
> - `vincular-cuenta` y `designar` crean propuestas que se confirman con `confirmar` (cuatro ojos).
> - Errores: `gobierno.ya_inicializado`, `identidad.cuenta_ya_vinculada`, `gobierno.sin_designacion`, `gobierno.sin_segunda_persona`.
>
> — `contracts/cli.md, subcomando `inicializar`, verbatim` · full text: [cli.md](../contracts/cli.md)

## Acceptance criteria

### AC-11 — authorization

> **Given** un Revisor DOYC o un Redactor de reglas sin la designación de aprobador
> **When** intenta aprobar una versión de regla
> **Then** el sistema lo impide y le indica que solo un revisor aprobador designado puede aprobar reglas
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `inicializar(persona_id, nombre)`: solo sin personas registradas (`gobierno.ya_inicializado`); génesis aprobador vinculado a la cuenta actual
- [ ] `vincular_cuenta` y `designar`: crean propuesta; `confirmar(propuesta_seq)` genérico: otra persona designada (`gobierno.sin_segunda_persona`), no resuelta (`gobierno.propuesta_ya_resuelta`)
- [ ] Pruebas en `tests/test_personas_servicio.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Confirmar la propia propuesta | `gobierno.sin_segunda_persona` |
| Vincular una cuenta ya vinculada | `identidad.cuenta_ya_vinculada` |
| Inicializar dos veces | `gobierno.ya_inicializado` |

## Definition of Done

- [ ] `tests/test_personas_servicio.py` pasa, incluido AC-11 de punta a punta con personas reales del registro
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
