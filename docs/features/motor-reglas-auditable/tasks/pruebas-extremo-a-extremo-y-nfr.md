---
id: T16
title: "Agregar la prueba de extremo a extremo y las de NFR"
layer: "tests"
deps: ["T15"]
blocks: []
acs: ["AC-17", "AC-19b", "AC-21"]
files_hint: ["tests/test_extremo_a_extremo.py"]
owner: "<TBD lead>"
estimate: "S"
context_budget: "M"
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T16 — Agregar la prueba de extremo a extremo y las de NFR

## Place in the sequence

- **Blocked by:** T15 — Exponer la fachada PreCheck y la CLI python3 -m precheck · **Blocks:** — · **Wave:** 7 (empieza cuando terminan sus dependencias).
- **Lane:** carril propio.

## Why (user story)

> **As a** Revisor DOYC
> **I want** volver a ejecutar una evaluación registrada y saber si coincide con la original
> **So that** pueda defender o corregir una observación impugnada meses después
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

> **As a** Revisor DOYC
> **I want** comprobar que la bitácora de un expediente no fue alterada
> **So that** el registro tenga valor probatorio
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

> **As a** Revisor DOYC
> **I want** ver qué normas y temas se evaluaron, cuáles no tienen reglas y cuántas reglas estaban sin aprobar
> **So that** no confunda la ausencia de NO_CUMPLE con un expediente limpio
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

Agregar la prueba de extremo a extremo y las de NFR: aporta la parte de US-07, US-08, US-10 que cubren AC-17, AC-19b, AC-21.

## Inlined context

> | Reproducibilidad | 100 % de resultados reproducidos coinciden con el original cuando no cambió nada | prueba automática que reproduce todas las evaluaciones del lote de validación |
>
> — `spec.md §6, NFR, verbatim` · full text: [spec.md](../spec.md)

> | Detección de alteración | 100 % de alteraciones, inserciones o eliminaciones de eventos anteriores al último anclaje externo; la ventana hasta el siguiente anclaje es un riesgo aceptado | prueba automática de manipulación de la bitácora y de reescritura completa contra el anclaje |
>
> — `spec.md §6, NFR, verbatim` · full text: [spec.md](../spec.md)

> | Tiempo de evaluación | ≤ 10 s por expediente con el catálogo completo (~650 reglas) | medición en las pruebas con los casos de `tests/casos/` |
>
> — `spec.md §6, NFR, verbatim` · full text: [spec.md](../spec.md)

> - Ningún resultado oficial sale de una regla no aprobada, y ningún expediente queda como revisado sin que un revisor DOYC haya firmado cada resultado bloqueante y dado su visto bueno al resto; el expediente nunca se presenta como aprobado, porque el dictamen es de la DOYC.
>
> — `spec.md §2, Goals, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-17 — happy

> **Given** una evaluación registrada
> **When** el Revisor DOYC pide reproducirla
> **Then** el sistema la vuelve a ejecutar con los datos, las versiones de regla, la versión del motor y la fecha de presentación registradas, e indica si cada resultado coincide con el original
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-19b — cross-context

> **Given** una bitácora reescrita por completo con una cadena recalculada que es coherente consigo misma
> **When** el Revisor DOYC la verifica contra el último anclaje externo
> **Then** el sistema indica que la bitácora no coincide con el anclaje y desde qué punto dejó de ser confiable
>
> — `spec.md §5, AC-19b, verbatim` · full text: [spec.md](../spec.md)

### AC-21 — happy

> **Given** un expediente en una zona exceptuada del MIVIOT, sin reglas cargadas, más reglas aprobadas y en borrador de otras normas
> **When** el Revisor DOYC evalúa el expediente
> **Then** el sistema declara qué normas y temas se evaluaron, que la norma MIVIOT no tiene reglas (lo que va a revisión) y cuántas reglas estaban sin aprobar, y nunca muestra un veredicto global de «cumple»
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Guion: inicializar → vincular/designar con dos personas → proponer catálogos → aprobar algunas → evaluar casos → decidir → visto bueno → estado revisado → reproducir todo → sellar → reescribir bitácora → verificar
- [ ] Medir tiempo por expediente con el catálogo completo

## Edge cases

| Case | Behaviour |
|---|---|
| Reescritura completa tras el sello | verificar informa «no coincide con el anclaje» |

## Definition of Done

- [ ] `tests/test_extremo_a_extremo.py` pasa: 100 % reproducciones coinciden, alteraciones detectadas, ≤ 10 s por expediente
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
