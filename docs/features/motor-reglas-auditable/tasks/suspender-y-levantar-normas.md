---
id: T13
title: "Implementar suspender y levantar normas con cuatro ojos"
layer: "app"
deps: ["T8", "T9", "T10"]
blocks: ["T15"]
acs: ["AC-20"]
files_hint: ["precheck/reglas/servicio.py", "precheck/reglas/normas.json"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T13 — Implementar suspender y levantar normas con cuatro ojos

## Place in the sequence

- **Blocked by:** T8 — Implementar aprobar, rechazar y retirar versiones con cuatro ojos, T9 — Implementar inicializar, vincular cuenta, designar y confirmar propuestas, T10 — Implementar evaluar expediente con degradación, CEUS, cobertura e instantánea · **Blocks:** T15 — Exponer la fachada PreCheck y la CLI python3 -m precheck · **Wave:** 5 (empieza cuando terminan sus dependencias).
- **Lane:** comparte `files_hint` con T7, T8; serializado.

## Why (user story)

> **As a** Revisor aprobador
> **I want** suspender en bloque todas las versiones de una norma, o retirar una versión de regla aprobada, y ver qué resultados registrados dependen de ellas
> **So that** una nulidad o un cambio de norma se gestione sin reescribir la historia
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

Implementar suspender y levantar normas con cuatro ojos: aporta la parte de US-09 que cubren AC-20.

## Inlined context

> ```mermaid
> sequenceDiagram
>     actor A1 as Revisor aprobador (propone)
>     actor A2 as Revisor aprobador (confirma)
>     participant client as <client>
>     participant service as <service>
>     participant store as <data-store>
>     Note over A1,store: precondición: norma con versiones aprobadas y resultados registrados
>     A1->>client: propone suspender la norma con motivo
>     client->>service: proponer suspensión
>     Note over service,store: persiste evento «suspensión propuesta» en la cadena de reglas (todavía no rige)
>     A2->>client: confirma la suspensión
>     client->>service: confirmar suspensión
>     alt quien confirma es quien propuso
>         service-->>client: rechazo: la suspensión requiere una segunda persona
>     else confirmación válida
>         Note over service,store: persiste evento «suspensión confirmada» (abarca las normas derivadas)
>         service->>store: busca expedientes y resultados que usaron versiones de la norma
>         Note over service,store: persiste un evento «afectado por suspensión» en cada cadena de expediente, sin modificar resultados
>         service-->>client: suspendida: sus versiones dan REQUIERE_REVISION y se listan los expedientes afectados
>     end
>     client-->>A2: resultado
> ```
>
> — `sad.md §6, Flujo 6, verbatim` · full text: [sad.md](../sad.md)

> **Chosen:** Evento de suspensión reversible, que no toca la vigencia (AC-12). La variante no reversible obligaría a crear y aprobar de nuevo unas 650 versiones si la CSJ desestima la demanda.
>
> — `adr/0008-suspender-normas-con-un-evento-separado-de-la-vigencia.md, Decision outcome, verbatim` · full text: [0008-suspender-normas-con-un-evento-separado-de-la-vigencia.md](../adr/0008-suspender-normas-con-un-evento-separado-de-la-vigencia.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No se modifica el esquema. Anexa `suspension_*`/`levantamiento_*` en `reglas` y `afectado_suspension` en cada expediente afectado; lee `uso_regla`.

## API contract

> #### `suspender` · `levantar` · `confirmar`
> ```
> suspender --norma NORMA --motivo TEXTO
> levantar  --norma NORMA --motivo TEXTO
> confirmar --propuesta SEQ
> ```
> - `suspender` y `levantar` crean una propuesta que no rige hasta que otra persona la confirma con `confirmar`.
> - Al confirmarse una suspensión, se listan los expedientes afectados (AC-20).
> - Errores: `gobierno.sin_segunda_persona`, `gobierno.propuesta_inexistente`, `gobierno.propuesta_ya_resuelta`, `gobierno.norma_desconocida`.
>
> — `contracts/cli.md, subcomando `suspender`, verbatim` · full text: [cli.md](../contracts/cli.md)

## Acceptance criteria

### AC-20 — cross-context

> **Given** reglas aprobadas de la norma PLOT-A61-2021 con resultados registrados en varios expedientes
> **When** el Revisor aprobador suspende en bloque esa norma con un motivo (por ejemplo, una nulidad dictada por la Corte Suprema)
> **Then** el sistema deja de emitir resultados oficiales con todas sus versiones (desde entonces dan REQUIERE_REVISION), lista los expedientes y resultados que dependen de ellas y los marca como afectados sin modificarlos
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `precheck/reglas/normas.json`: normas conocidas y derivadas (`PLOT-A61-2021` → `PLOT-A61-2021+A270-2025`)
- [ ] `proponer_suspension` / `proponer_levantamiento` con motivo; `confirmar` (T9) aplica: afectados por `usos` de todas las versiones de la norma y derivadas
- [ ] Pruebas en `tests/test_suspension.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Norma desconocida | `gobierno.norma_desconocida` |
| Confirmar el mismo aprobador | `gobierno.sin_segunda_persona` |
| Evaluar tras la suspensión | esas versiones dan REQUIERE_REVISION |

## Definition of Done

- [ ] `tests/test_suspension.py` cubre AC-20 y pasa
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
