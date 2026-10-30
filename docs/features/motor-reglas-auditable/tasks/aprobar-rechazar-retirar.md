---
id: T8
title: "Implementar aprobar, rechazar y retirar versiones con cuatro ojos"
layer: "app"
deps: ["T7"]
blocks: ["T13", "T15"]
acs: ["AC-09", "AC-10", "AC-11", "AC-20b"]
files_hint: ["precheck/reglas/servicio.py"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T8 — Implementar aprobar, rechazar y retirar versiones con cuatro ojos

## Place in the sequence

- **Blocked by:** T7 — Implementar proponer versiones con verificación de cita · **Blocks:** T13 — Implementar suspender y levantar normas con cuatro ojos, T15 — Exponer la fachada PreCheck y la CLI python3 -m precheck · **Wave:** 4 (empieza cuando terminan sus dependencias).
- **Lane:** comparte `files_hint` con T13, T7; serializado.

## Why (user story)

> **As a** Revisor aprobador
> **I want** aprobar o rechazar una versión de regla redactada por otra persona
> **So that** solo reglas validadas por un segundo par de ojos emitan resultados oficiales
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** Revisor aprobador
> **I want** suspender en bloque todas las versiones de una norma, o retirar una versión de regla aprobada, y ver qué resultados registrados dependen de ellas
> **So that** una nulidad o un cambio de norma se gestione sin reescribir la historia
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

Implementar aprobar, rechazar y retirar versiones con cuatro ojos: aporta la parte de US-04, US-09 que cubren AC-09, AC-10, AC-11, AC-20b.

## Inlined context

> **Critical flow 2: aprobar una versión de regla con cuatro ojos (AC-09, AC-10, AC-11)**
>
> ```mermaid
> sequenceDiagram
>     actor Aprob as Revisor aprobador
>     participant CLI as CLI precheck
>     participant Gob as reglas.gobierno
>     participant Per as personas.registro
>     participant Bit as Bitácora
>     Aprob->>CLI: aprueba regla id y versión
>     CLI->>Gob: aprobar(regla, versión, cuenta)
>     Gob->>Per: ResolutorIdentidad: persona vinculada a la cuenta
>     Per-->>Gob: persona y designaciones
>     alt persona sin designación de aprobador
>         Gob-->>CLI: rechazo: solo un aprobador designado
>     else persona es quien redactó la versión
>         Gob-->>CLI: rechazo: nadie aprueba lo que redactó
>     else aprobación válida
>         Gob->>Bit: anexa evento de aprobación en la cadena de reglas
>         Bit-->>Gob: hash
>         Gob-->>CLI: aprobada
>     end
>     CLI-->>Aprob: resultado
> ```
>
> — `sad.md §6, Critical flow 2, verbatim` · full text: [sad.md](../sad.md)

> ```mermaid
> sequenceDiagram
>     actor Aprob as Revisor aprobador
>     participant client as <client>
>     participant service as <service>
>     participant store as <data-store>
>     Note over Aprob,store: precondición: persona designada como aprobadora
>     alt intento de modificar condición, cita o vigencia de una versión aprobada
>         Aprob->>client: modifica una versión aprobada
>         client->>service: modificar versión
>         service-->>client: rechazo: una regla aprobada no se edita, se crea una versión nueva
>     else rechazar un borrador
>         Aprob->>client: rechaza la versión con motivo
>         client->>service: rechazar versión
>         Note over service,store: persiste evento «rechazo» con motivo y persona en la cadena de reglas
>         service-->>client: versión en estado final rechazada, sin indicativo
>     else retirar una versión aprobada
>         Aprob->>client: retira la versión con motivo
>         client->>service: retirar versión
>         Note over service,store: persiste evento «retiro» con motivo y persona en la cadena de reglas
>         service->>store: busca evaluaciones registradas que usaron esa versión
>         service-->>client: retirada: da REQUIERE_REVISION desde ahora, con la lista de resultados que dependen de ella
>     end
>     client-->>Aprob: resultado
> ```
>
> — `sad.md §6, Flujo 5, verbatim` · full text: [sad.md](../sad.md)

> **Chosen:** Estado derivado de la cadena. Las reglas de selección son: rige la versión aprobada más reciente cuya vigencia cubre la fecha de presentación; un borrador solo agrega su indicativo; no se admiten dos aprobadas con vigencias solapadas; una retirada o sin aprobada da REQUIERE_REVISION; una rechazada es un estado final sin indicativo.
>
> — `adr/0005-derivar-estado-de-reglas-de-la-cadena-de-reglas.md, Decision outcome, verbatim` · full text: [0005-derivar-estado-de-reglas-de-la-cadena-de-reglas.md](../adr/0005-derivar-estado-de-reglas-de-la-cadena-de-reglas.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No se modifica el esquema. Solo anexa eventos `aprobacion`, `rechazo`, `retiro` en la cadena `reglas`; lee `uso_regla`.

## API contract

> #### `aprobar` · `rechazar` · `retirar`
> ```
> aprobar  --regla ID --version N
> rechazar --regla ID --version N --motivo TEXTO
> retirar  --regla ID --version N --motivo TEXTO
> ```
> - Errores: `gobierno.auto_aprobacion` (AC-10), `gobierno.sin_designacion` (AC-11), `regla.version_inexistente`, `regla.vigencia_solapada` (otra versión aprobada cubre el mismo rango), `regla.estado_invalido` (por ejemplo, retirar un borrador), `gobierno.motivo_obligatorio`.
> - `retirar` devuelve la lista de resultados registrados que usaron la versión (AC-20b).
>
> — `contracts/cli.md, subcomando `aprobar`, verbatim` · full text: [cli.md](../contracts/cli.md)

## Acceptance criteria

### AC-09 — happy

> **Given** una versión en borrador redactada por otra persona
> **When** el Revisor aprobador la aprueba
> **Then** el sistema la registra como aprobada con su nombre y fecha en la bitácora, y desde entonces emite resultados oficiales en expedientes presentados dentro de su vigencia
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

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

### AC-20b — happy

> **Given** una versión de regla aprobada que resultó mal interpretada
> **When** el Revisor aprobador la retira con un motivo
> **Then** el sistema deja de aplicarla a nuevas evaluaciones, conserva su historia y lista los resultados registrados que dependen de ella
>
> — `spec.md §5, AC-20b, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `aprobar(regla_id, version)`: persona por resolutor → `puede_aprobar` (T5) → `regla.vigencia_solapada` si choca → evento `aprobacion`
- [ ] `rechazar(..., motivo)` y `retirar(..., motivo)`: motivo obligatorio (`gobierno.motivo_obligatorio`), estado válido (`regla.estado_invalido`)
- [ ] `retirar` devuelve `Retiro` con `usos(regla_id, version)`
- [ ] Pruebas en `tests/test_gobierno.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Aprobar una versión ya aprobada | `regla.estado_invalido` |
| Retirar un borrador | `regla.estado_invalido` |
| Aprobar lo que redactó | `gobierno.auto_aprobacion` |

## Definition of Done

- [ ] `tests/test_gobierno.py` cubre AC-09, AC-10, AC-11 y AC-20b y pasa
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
