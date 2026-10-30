---
id: T12
title: "Implementar reproducir una evaluación registrada"
layer: "app"
deps: ["T10"]
blocks: ["T15"]
acs: ["AC-17", "AC-18"]
files_hint: ["precheck/expediente/servicio.py"]
owner: "<TBD lead>"
estimate: "S"
context_budget: "M"
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T12 — Implementar reproducir una evaluación registrada

## Place in the sequence

- **Blocked by:** T10 — Implementar evaluar expediente con degradación, CEUS, cobertura e instantánea · **Blocks:** T15 — Exponer la fachada PreCheck y la CLI python3 -m precheck · **Wave:** 5 (empieza cuando terminan sus dependencias).
- **Lane:** comparte `files_hint` con T10, T11; serializado.

## Why (user story)

> **As a** Revisor DOYC
> **I want** volver a ejecutar una evaluación registrada y saber si coincide con la original
> **So that** pueda defender o corregir una observación impugnada meses después
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

Implementar reproducir una evaluación registrada: aporta la parte de US-07 que cubren AC-17, AC-18.

## Inlined context

> ```mermaid
> sequenceDiagram
>     actor Revisor as Revisor DOYC
>     participant client as <client>
>     participant service as <service>
>     participant store as <data-store>
>     Note over Revisor,store: precondición: evaluación registrada con instantánea completa
>     Revisor->>client: pide reproducir una evaluación
>     client->>service: reproducir evaluación
>     service->>store: lee la instantánea (reglas y su estado de entonces, hechos, fecha, umbral, versión del motor)
>     alt la versión del motor registrada no es la que corre
>         Note over service,store: persiste evento «reproducción no posible con esta versión»
>         service-->>client: no reproducible con esta versión, sin comparar
>     else misma versión del motor
>         service->>service: vuelve a evaluar con la instantánea
>         alt todos los resultados coinciden
>             Note over service,store: persiste evento «reproducción coincidente»
>             service-->>client: coincide
>         else hay discrepancias
>             Note over service,store: persiste evento «reproducción con discrepancias», original intacto
>             service-->>client: discrepancias por regla con valor original y nuevo
>         end
>     end
>     client-->>Revisor: resultado de la reproducción
> ```
>
> — `sad.md §6, Flujo 9, verbatim` · full text: [sad.md](../sad.md)

> | Reproducibilidad | 100 % de resultados reproducidos coinciden con el original cuando no cambió nada | prueba automática que reproduce todas las evaluaciones del lote de validación |
>
> — `spec.md §6, NFR, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No se modifica el esquema. Lee la instantánea y `contenido_regla`; anexa un evento `reproduccion`.

## API contract

> #### `reproducir`
> ```
> reproducir --expediente ID --evaluacion SEQ
> ```
> - Salida: `coincide`, `discrepancias` (por regla: original y nuevo) o `no_reproducible_version`. Siempre registra el intento.
> - Salida 4 con discrepancias; salida 5 con otra versión del motor.
>
> — `contracts/cli.md, subcomando `reproducir`, verbatim` · full text: [cli.md](../contracts/cli.md)

## Acceptance criteria

### AC-17 — happy

> **Given** una evaluación registrada
> **When** el Revisor DOYC pide reproducirla
> **Then** el sistema la vuelve a ejecutar con los datos, las versiones de regla, la versión del motor y la fecha de presentación registradas, e indica si cada resultado coincide con el original
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — error

> **Given** una evaluación registrada cuya reproducción da un resultado distinto en alguna regla
> **When** el Revisor DOYC la reproduce
> **Then** el sistema señala cada discrepancia con el valor original y el nuevo, la registra en la bitácora y no altera el registro original
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Reconstruir reglas desde `hash_contenido` y su estado registrado (no el actual)
- [ ] Versión de motor distinta → `no_reproducible_version` sin comparar
- [ ] Comparar por regla; registrar `coincide` o `discrepancias` sin tocar el original
- [ ] Pruebas en `tests/test_reproducir.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Regla aprobada después de la evaluación | reproducción coincide (usa el estado registrado) |
| Contenido alterado fuera de banda | su hash no coincide → discrepancia señalada |

## Definition of Done

- [ ] `tests/test_reproducir.py` cubre AC-17 y AC-18 y pasa
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
