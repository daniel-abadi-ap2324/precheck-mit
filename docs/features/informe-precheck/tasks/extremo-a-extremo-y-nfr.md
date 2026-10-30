---
id: T12
title: "Agregar la prueba de extremo a extremo y las de NFR del informe"
layer: "tests"
deps: ["T11"]
blocks: []
acs: ["AC-07", "AC-16"]
files_hint: ["tests/test_informe_extremo_a_extremo.py", "tests/test_informe_nfr.py"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T12 — Agregar la prueba de extremo a extremo y las de NFR del informe

## Place in the sequence

- **Blocked by:** T11 — Exponer los métodos del informe en la fachada y la CLI · **Blocks:** — · **Wave:** 7 (en paralelo con T13).
- **Lane:** carril propio (solo archivos nuevos en `tests/`).

## Why (user story)

> **As a** Revisor DOYC
> **I want** comprobar si un archivo de informe que me presentan coincide con uno emitido
> **So that** pueda detectar un informe alterado o que el sistema nunca emitió
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Esta tarea prueba el ciclo completo por biblioteca y por CLI y mide los NFR de la spec §6; las AC-01 a AC-24 ya tienen su prueba unitaria en T1–T11 y aquí se recorren juntas.

## Inlined context

> | Aspect | Target | Measurement |
> |---|---|---|
> | Tiempo de generación, emisión y verificación | ≤ 2 s p95 por operación (generar cualquiera de las versiones, emitir con su registro, verificar por archivo o por código) con el catálogo completo (~650 resultados) | medición en la suite de pruebas con los casos de `tests/casos/` |
> | Reproducibilidad de la huella | 100 % de regeneraciones de la misma evaluación con las mismas decisiones, indicaciones y datos de encabezado producen la misma huella | prueba automática que regenera y compara |
> | Autocontenido | 0 referencias a recursos externos en el documento; se abre y se imprime sin red | prueba automática sobre el documento generado |
> | Detección de alteración (verificación por archivo) | 100 % de archivos originales (documento o forma estructurada) con un solo carácter de contenido alterado se reportan como no coincidentes; 0 falsos rechazos del mismo contenido en su otra forma original; las copias impresas o convertidas se verifican por código | prueba automática de manipulación y de cambio de presentación |
> | Accesibilidad | 100 % de estados (CUMPLE, NO_CUMPLE, REQUIERE_REVISION, no oficial) expresados en texto, no solo con color; impresión en carta y legal sin cortar tablas | revisión automática del documento + revisión manual de impresión |
>
> — `spec.md §6, Non-functional requirements, verbatim` · full text: [spec.md](../spec.md)

> - **How verify:** medición en la suite con `tests/casos/`; inspección automática del documento (sin `src`/`href` externos ni scripts ejecutables); revisión manual de impresión.
>
> — `sad.md §10, QG-3, verbatim` · full text: [sad.md](../sad.md)

> - **Informes emitidos con resultados sin respaldo oficial o humano** — baseline: no medible, target: 0 en todo momento (medido en cada emisión por las pruebas y en la reproducción mensual de una muestra).
>
> — `spec.md §7, Metrics / KPIs, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) ·
[cli.md](../contracts/cli.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes. Cada prueba usa una bitácora temporal con los datos de `tests/casos/` y el apoyo de `tests/apoyo.py`.

## API contract

Internal — no API surface. Ejerce los métodos de `contracts/public-api.md` y los subcomandos de `contracts/cli.md` ya expuestos por T11.

## Acceptance criteria

### AC-07 — authorization

> **Given** una persona sin el rol de Revisor DOYC (por ejemplo, un Redactor de reglas) o una cuenta sin persona vinculada
> **When** pide cualquiera de las dos versiones, intenta emitir la del profesional, verificar un informe, consultar los informes emitidos o escribir una indicación al profesional
> **Then** el sistema lo deniega, explica que se necesita el rol de Revisor DOYC y no revela el contenido del expediente
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — domain invariant

> **Given** la misma evaluación con las mismas decisiones, las mismas indicaciones al profesional y los mismos datos de encabezado (dos escrituras que solo difieren en tildes compuestas o en espacios cuentan como el mismo dato)
> **When** se emite la versión del profesional más de una vez, por la misma o por otra persona
> **Then** todas las emisiones producen el mismo contenido y la misma huella (quién emite y cuándo quedan en el registro de cada emisión, fuera del contenido con huella), y cada emisión queda registrada como una entrega distinta; si después se agrega una indicación, la emisión siguiente tiene otra huella
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Recorrido punta a punta por biblioteca con dos Revisores DOYC: evaluar → versión del revisor (pendiente) → decidir con indicación → indicar sobre no bloqueantes → visto bueno → emitir → verificar por archivo (documento y JSON) y por código → retiro de una versión usada → `emitidos` marca afectado → emitir rechaza → reevaluar → emitir de nuevo; la primera queda reemplazada — `tests/test_informe_extremo_a_extremo.py`
- [ ] El mismo recorrido por CLI (`python3 -m precheck …`) con los códigos de salida del contrato
- [ ] NFR: p95 ≤ 2 s por operación (generar, emitir, verificar por archivo y por código) con el catálogo completo; huella reproducible (100 % de regeneraciones); 0 recursos externos ni scripts ejecutables; alteración de cada carácter del contenido visible y del JSON embebido → `no_coincide`, 0 falsos rechazos entre documento y forma estructurada; estados en texto — `tests/test_informe_nfr.py`
- [ ] Autorización: redactor y cuenta sin vínculo denegados en las seis operaciones, sin contenido del expediente en el mensaje

## Edge cases

| Case | Behaviour |
|---|---|
| Alteración de un carácter dentro del bloque de trazabilidad | `coincide` con `trazabilidad_coincide=False` (no es contenido con huella) |
| Muestreo carácter a carácter demasiado lento | recorrer todos los caracteres de texto del modelo, no cada byte del HTML |
| Verificación > 1 s en la suite | anotar el disparador de sad §7 (índice derivado por huella) en el resultado, sin cambiar la bitácora |

## Definition of Done

- [ ] `tests/test_informe_extremo_a_extremo.py` y `tests/test_informe_nfr.py` pasan
- [ ] Todos los NFR de spec §6 automatizables medidos y en verde; la revisión manual de impresión (carta y legal) queda anotada en el PR
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde; `ruff` y `mypy` limpios
