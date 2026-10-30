---
id: T5
title: "Derivar la indicación vigente y su traslado entre evaluaciones"
layer: "domain"
deps: ["T4"]
blocks: ["T6"]
acs: ["AC-24"]
files_hint: ["precheck/informe/modelo.py", "tests/test_informe_traslado.py"]
owner: "<TBD lead>"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T5 — Derivar la indicación vigente y su traslado entre evaluaciones

## Place in the sequence

- **Blocked by:** T4 — Proyectar el modelo de la versión del revisor con corte temporal · **Blocks:** T6 — Proyectar la versión del profesional · **Wave:** 2 (amplía el modelo de T4).
- **Lane:** comparte `precheck/informe/modelo.py` con T4 y T6; serializado.

## Why (user story)

> **As a** Revisor DOYC
> **I want** escribir, al decidir o después, una indicación para el profesional separada del motivo de mi decisión
> **So that** el profesional reciba una instrucción útil sin que salga del sistema el criterio interno que dejo para la auditoría
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

Esta tarea decide qué indicación rige cada observación (la última, con historial) y la traslada desde la evaluación anterior cuando nada cambió.

## Inlined context

> ```mermaid
> sequenceDiagram
>     loop cada observación de la evaluación vigente
>         alt tiene indicación propia
>             service->>service: usa la última indicación de esa evaluación
>         else la evaluación anterior tiene la misma regla, versión, resultado y valores usados
>             service->>service: toma la indicación vigente de la anterior (recursivo) y la marca «trasladada»
>         else cambió algo
>             service->>service: la observación queda sin indicación y figura entre las que faltan
>         end
>     end
>     Note over service,store: Sin escrituras: el traslado se deriva al proyectar
> ```
>
> — `sad.md §6, Flujo 6, abridged` · full text: [sad.md](../sad.md)

> | Indicación vigente | Por observación: la última `indicacion` sobre esa evaluación; si no hay, la de la evaluación anterior si la regla tiene la misma versión, resultado y valores usados (traslado recursivo, marcado como trasladado) | ADR-0003 |
>
> — `sad.md §8, fila «Indicación vigente», verbatim` · full text: [sad.md](../sad.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-24 — cross-context

> **Given** una observación con indicación al profesional y, después, una evaluación nueva del mismo expediente
> **When** la evaluación nueva produce para esa regla la misma versión, el mismo resultado y los mismos valores usados
> **Then** la indicación se traslada a la observación de la evaluación nueva y la versión del revisor muestra que fue trasladada; si cambió cualquiera de esos elementos, la observación queda sin indicación y figura entre las que faltan
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `indicacion_vigente(eventos, evaluacion_seq, clave)` → `(texto, autor, trasladada: bool) | None` e `historial_indicaciones(...)` — `precheck/informe/modelo.py`
- [ ] Traslado recursivo a evaluaciones anteriores mientras coincidan regla, versión, resultado y valores usados (comparados en forma canónica); para `norma:X`, mientras siga en `normas_sin_reglas` con el mismo veredicto
- [ ] El modelo del revisor muestra la vigente, su historial y la marca «trasladada»; las observaciones sin vigente entran en los faltantes de AC-02 (punto de extensión de T4)
- [ ] Pruebas — `tests/test_informe_traslado.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Dos indicaciones sobre la misma observación | rige la última; el historial muestra ambas con autor y fecha |
| Cambió un valor usado (o la versión, o el resultado) | sin indicación; figura entre las que faltan |
| Tres evaluaciones iguales con indicación solo en la primera | la tercera la hereda, marcada «trasladada» |
| Indicación propia en la nueva evaluación | rige la propia, sin marca de traslado |

## Definition of Done

- [ ] `tests/test_informe_traslado.py` cubre AC-24 (traslado, recursión, cambio en cada uno de los tres elementos) y pasa
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde; `ruff` y `mypy` limpios
