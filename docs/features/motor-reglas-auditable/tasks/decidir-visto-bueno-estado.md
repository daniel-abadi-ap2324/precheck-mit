---
id: T11
title: "Implementar decidir, visto bueno y estado del expediente"
layer: "app"
deps: ["T10"]
blocks: ["T15"]
acs: ["AC-13", "AC-14", "AC-15", "AC-16"]
files_hint: ["precheck/expediente/servicio.py"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T11 — Implementar decidir, visto bueno y estado del expediente

## Place in the sequence

- **Blocked by:** T10 — Implementar evaluar expediente con degradación, CEUS, cobertura e instantánea · **Blocks:** T15 — Exponer la fachada PreCheck y la CLI python3 -m precheck · **Wave:** 5 (empieza cuando terminan sus dependencias).
- **Lane:** comparte `files_hint` con T10, T12; serializado.

## Why (user story)

> **As a** Revisor DOYC
> **I want** confirmar o descartar con un motivo cada NO_CUMPLE bloqueante y cada REQUIERE_REVISION
> **So that** ninguna conclusión desfavorable quede sin decisión humana registrada
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As a** Revisor DOYC
> **I want** dar un visto bueno único a los CUMPLE y a los NO_CUMPLE de observación de un expediente, viendo de qué datos declarados depende cada uno
> **So that** ningún resultado oficial del expediente quede sin firma humana
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Implementar decidir, visto bueno y estado del expediente: aporta la parte de US-05, US-06 que cubren AC-13, AC-14, AC-15, AC-16.

## Inlined context

> ```mermaid
> sequenceDiagram
>     actor Revisor as Revisor DOYC
>     participant client as <client>
>     participant service as <service>
>     participant store as <data-store>
>     Note over Revisor,store: precondición: evaluación registrada con resultados pendientes de decisión
>     Revisor->>client: confirma o descarta un resultado con motivo
>     client->>service: registrar decisión
>     alt falta el motivo
>         service-->>client: rechazo: el motivo es obligatorio
>     else decisión sobre un NO_CUMPLE bloqueante
>         Note over service,store: persiste evento «decisión» (confirma o descarta) enlazado al resultado original
>         service-->>client: decisión registrada
>     else decisión sobre un REQUIERE_REVISION
>         Note over service,store: persiste evento «decisión» con el veredicto humano CUMPLE o NO_CUMPLE
>         service-->>client: veredicto humano registrado
>     end
>     client-->>Revisor: estado del expediente actualizado
> ```
>
> — `sad.md §6, Flujo 7, verbatim` · full text: [sad.md](../sad.md)

> | Decisión humana | Confirmar o descartar exige motivo; sobre un REQUIERE_REVISION fija un veredicto humano CUMPLE o NO_CUMPLE. Corregir un dato crea un hecho `metodo: humano` y una evaluación nueva, y el expediente vuelve a «pendiente»; las decisiones previas quedan enlazadas a la evaluación que firmaron | aquí (spec §8) |
>
> — `sad.md §8, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No se modifica el esquema. Anexa eventos `decision` y `visto_bueno` en la cadena del expediente.

## API contract

> #### `decidir`
> ```
> decidir --expediente ID --evaluacion SEQ --regla ID (--confirmar | --descartar | --veredicto CUMPLE|NO_CUMPLE) --motivo TEXTO
> ```
> - `--confirmar` o `--descartar` para un NO_CUMPLE bloqueante; `--veredicto` para un REQUIERE_REVISION.
> - Errores: `decision.motivo_obligatorio` (AC-14), `decision.accion_no_aplicable` (por ejemplo, un veredicto sobre un NO_CUMPLE), `expediente.evaluacion_inexistente`, `identidad.sin_rol`.
>
> — `contracts/cli.md, subcomando `decidir`, verbatim` · full text: [cli.md](../contracts/cli.md)

> #### `visto-bueno`
> ```
> visto-bueno --expediente ID --evaluacion SEQ (--listar | --dar)
> ```
> - `--listar`: CUMPLE y NO_CUMPLE de observación, con los datos declarados de los que depende cada uno.
> - `--dar`: registra el visto bueno único.
> - Errores: `expediente.evaluacion_no_vigente` (hay una evaluación más reciente), `identidad.sin_rol`.
>
> — `contracts/cli.md, subcomando `visto-bueno`, verbatim` · full text: [cli.md](../contracts/cli.md)

> #### `estado`
> ```
> estado --expediente ID
> ```
> - Salida: `pendiente` (con la lista de lo que falta) o `revisado`. Nunca «aprobado».
>
> — `contracts/cli.md, subcomando `estado`, verbatim` · full text: [cli.md](../contracts/cli.md)

## Acceptance criteria

### AC-13 — happy

> **Given** un expediente evaluado con un NO_CUMPLE bloqueante
> **When** el Revisor DOYC lo confirma o lo descarta con un motivo
> **Then** el sistema registra la decisión, el motivo y su nombre en la bitácora, enlazados al resultado original, sin modificar ese resultado
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — error

> **Given** un NO_CUMPLE bloqueante o un REQUIERE_REVISION pendiente
> **When** el Revisor DOYC intenta descartarlo sin escribir un motivo
> **Then** el sistema no registra la decisión y le indica que el motivo es obligatorio
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — happy

> **Given** un expediente evaluado con varios CUMPLE oficiales y NO_CUMPLE de severidad observación
> **When** el Revisor DOYC revisa esa lista con los datos declarados de los que depende cada resultado y da su visto bueno
> **Then** el sistema registra el visto bueno con su nombre en la bitácora y marca esos resultados como confirmados
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — domain invariant

> **Given** un expediente con NO_CUMPLE bloqueantes o REQUIERE_REVISION sin decisión, o con CUMPLE u observaciones sin visto bueno
> **When** alguien consulta el estado del expediente
> **Then** el sistema lo presenta como pendiente de revisión humana, y solo lo presenta como revisado cuando todo tiene decisión o visto bueno; en ningún caso lo presenta como aprobado
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `decidir`: rol, motivo obligatorio, acción aplicable al resultado (`decision.accion_no_aplicable`), evaluación existente y vigente
- [ ] `listar_visto_bueno` / `dar_visto_bueno`: CUMPLE + NO_CUMPLE de observación con valores usados
- [ ] `estado`: `pendiente` con lista o `revisado`; nunca «aprobado»
- [ ] Pruebas en `tests/test_decisiones.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Decidir sobre una evaluación anterior | `expediente.evaluacion_no_vigente` |
| Nueva evaluación tras firmar | estado vuelve a `pendiente`; decisiones previas quedan enlazadas a la suya |

## Definition of Done

- [ ] `tests/test_decisiones.py` cubre AC-13 a AC-16 y pasa
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
