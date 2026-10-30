---
id: T3
title: "Registrar la indicación al profesional y decidir con indicación"
layer: "app"
deps: ["T1"]
blocks: ["T9", "T11"]
acs: ["AC-17", "AC-21"]
files_hint: ["precheck/informe/servicio.py", "precheck/expediente/servicio.py", "tests/test_informe_indicar.py"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T3 — Registrar la indicación al profesional y decidir con indicación

## Place in the sequence

- **Blocked by:** T1 — Agregar anexar_lote y cadenas al puerto de bitácora y los códigos informe.* · **Blocks:** T9 — Generar la versión del revisor y emitir la del profesional, T11 — Exponer los métodos del informe en la fachada y la CLI · **Wave:** 2 (necesita `anexar_lote` y los códigos `informe.*`).
- **Lane:** comparte `precheck/informe/servicio.py` con T9 y T10 (ya serializados por dependencias). Crea `servicio.py` con `indicar`; T9 y T10 lo amplían.

## Why (user story)

> **As a** Revisor DOYC
> **I want** escribir, al decidir o después, una indicación para el profesional separada del motivo de mi decisión
> **So that** el profesional reciba una instrucción útil sin que salga del sistema el criterio interno que dejo para la auditoría
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

Esta tarea entrega el registro de la indicación (evento `indicacion`), con sus reglas de aceptación, al decidir y después.

## Inlined context

> ```mermaid
> sequenceDiagram
>     alt al decidir
>         Revisor->>client: confirma un NO_CUMPLE o da un veredicto desfavorable, con motivo e indicación
>         client->>service: decidir con indicación
>         service->>service: valida la decisión como hoy (motivo obligatorio, acción aplicable)
>         service->>store: anexa decisión e indicación en una sola transacción
>     else después, como complemento
>         Revisor->>client: agrega una indicación sobre un resultado de una evaluación
>         client->>service: indicar
>         service->>store: lee la evaluación y sus decisiones
>         alt la evaluación no es la vigente
>             service-->>client: rechazo: solo se indica sobre la evaluación vigente
>         else resultado favorable, NO_CUMPLE descartado o NO_APLICA
>             service-->>client: rechazo: solo se escriben indicaciones sobre observaciones
>         else observación válida (bloqueante, veredicto desfavorable, no bloqueante oficial con o sin visto bueno, o norma sin reglas)
>             service->>store: anexa la indicación
>         end
>     end
>     service-->>client: indicación registrada, atribuida a la persona
> ```
>
> — `sad.md §6, Flujo 5, abridged` · full text: [sad.md](../sad.md)

> | Eventos nuevos | `indicacion` {evaluacion_seq, hash_evaluacion, regla_id (o `norma:X`), texto}; `informe_emitido` {…}. Ambos en la cadena `expediente:<id>`; el sobre aporta actor y fecha | ADR-0003, ADR-0005 |
> | Identidad y autorización | Toda operación del informe exige el rol `revisor_doyc` (mismo `_revisor` de `expediente.servicio`); la persona la resuelve el núcleo | ADR-0006 de `motor-reglas-auditable` |
>
> — `sad.md §8, filas «Eventos nuevos» e «Identidad y autorización», abridged` · full text: [sad.md](../sad.md)

> - **Qué rige:** la última indicación por observación. El traslado entre evaluaciones se deriva en la proyección, sin eventos nuevos.
> - **Contrato de `decidir`:** pasa a la versión 0.2.0 con la opción `--indicacion`.
> - **Qué se puede indicar:** solo observaciones de la evaluación vigente. Se rechazan los resultados favorables, los NO_CUMPLE descartados, los NO_APLICA y los resultados de una evaluación no vigente (AC-21).
>
> — `adr/0003-registrar-la-indicacion-al-profesional-como-evento-propio.md, Decision outcome, abridged` · full text: [ADR-0003](../adr/0003-registrar-la-indicacion-al-profesional-como-evento-propio.md)

> **Hard rule:** No reescribir decisiones: la cadena es de solo anexar.
>
> — `adr/0003-registrar-la-indicacion-al-profesional-como-evento-propio.md, Decision drivers, verbatim` · full text: [ADR-0003](../adr/0003-registrar-la-indicacion-al-profesional-como-evento-propio.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) ·
[cli.md](../contracts/cli.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes. Anexa eventos `indicacion` en la cadena `expediente:<id>` (tabla `evento` existente, payload JSON).

## API contract

> | `indicar(expediente_id, evaluacion: int, regla_id: str, texto: str)` | `EventoRegistrado` | US-07 · AC-17, AC-21 · flujo 5 |
> | `decidir(expediente_id, evaluacion, regla_id, accion, motivo, veredicto=None, indicacion: str \| None = None)` | Con `indicacion`, anexa la decisión y el evento `indicacion` en una sola transacción; devuelve el evento de la decisión. Sin `indicacion`, igual que en 0.1.1 |
>
> — `contracts/public-api.md, Métodos nuevos y Cambios en métodos existentes, abridged` · full text: [public-api.md](../contracts/public-api.md)

> - `indicar`: Acepta NO_CUMPLE bloqueantes confirmados, veredictos desfavorables, NO_CUMPLE no bloqueantes oficiales (con o sin visto bueno) y normas sin reglas decididas en contra.
> - Errores: `informe.indicacion_vacia`, `expediente.evaluacion_inexistente`, `expediente.evaluacion_no_vigente`, `informe.indicacion_no_aplicable` (resultado favorable, NO_CUMPLE descartado, NO_APLICA o regla sin resultado; AC-21).
> - `decidir --indicacion`: indicación al profesional, registrada en la misma transacción que la decisión. Solo con `--confirmar` o con `--veredicto NO_CUMPLE`; si no, `informe.indicacion_no_aplicable` y no se registra nada.
>
> — `contracts/cli.md, subcomandos indicar y decidir, abridged` · full text: [cli.md](../contracts/cli.md)

## Acceptance criteria

### AC-17 — happy

> **Given** un Revisor DOYC que confirma un NO_CUMPLE bloqueante, da un veredicto desfavorable sobre un REQUIERE_REVISION o tiene un NO_CUMPLE no bloqueante oficial cubierto por el visto bueno
> **When** escribe la indicación al profesional al decidir, o la agrega después como complemento de ese resultado
> **Then** el sistema la registra atribuida a él, sin reescribir la decisión ni su motivo, y la usa como «qué hacer» de esa observación; cualquier Revisor DOYC puede escribirla; si hay varias, la versión del profesional usa la última y la del revisor muestra el historial
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-21 — error

> **Given** un resultado favorable, un NO_CUMPLE descartado, un NO_APLICA o un resultado de una evaluación que ya no es la vigente
> **When** el Revisor DOYC intenta escribir una indicación al profesional sobre él
> **Then** el sistema no la registra y explica que solo se escriben indicaciones sobre observaciones de la evaluación vigente
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

«Usa la última / muestra el historial» se proyecta en T5; aquí se registra el evento.

## Checklist

- [ ] `indicar(ctx, expediente_id, evaluacion, regla_id, texto)`: `_revisor(ctx)`, texto no vacío (`informe.indicacion_vacia`), `_evaluacion_vigente`, regla de observación, `ctx.anexar(... "indicacion" ...)` con `{evaluacion_seq, hash_evaluacion, regla_id, texto}` — `precheck/informe/servicio.py`
- [ ] Regla de observación: NO_CUMPLE bloqueante con decisión `confirmar`; REQUIERE_REVISION con veredicto `NO_CUMPLE`; NO_CUMPLE `observacion` oficial (con o sin visto bueno); `norma:X` con veredicto `NO_CUMPLE`. Todo lo demás → `informe.indicacion_no_aplicable`
- [ ] `decidir(..., indicacion=None)`: con indicación, valida igual que hoy y además que la acción sea `confirmar` o veredicto `NO_CUMPLE`; anexa decisión + indicación con `ctx.anexar_lote`; devuelve el evento de la decisión — `precheck/expediente/servicio.py`
- [ ] Pruebas — `tests/test_informe_indicar.py`

## Edge cases

| Case | Behaviour |
|---|---|
| `decidir --descartar --indicacion …` o `--veredicto CUMPLE --indicacion …` | `informe.indicacion_no_aplicable`; no se registra ni la decisión |
| NO_CUMPLE bloqueante aún sin decisión | `informe.indicacion_no_aplicable` (solo se indica sobre confirmados) |
| Indicación de solo espacios | `informe.indicacion_vacia` |
| Evaluación anterior a la vigente | `expediente.evaluacion_no_vigente` |
| `regla_id` que no está en la evaluación | `informe.indicacion_no_aplicable` |
| Otro Revisor DOYC indica sobre la misma observación | se registra; el sobre lo atribuye a él |
| Persona sin rol / cuenta no vinculada | `identidad.sin_rol` / `identidad.cuenta_no_vinculada`, sin leer el expediente |

## Definition of Done

- [ ] `tests/test_informe_indicar.py` cubre AC-17 (al decidir y después, atribución, decisión intacta) y AC-21 (cada rechazo) y pasa
- [ ] `tests/test_decisiones.py` existente sigue pasando sin cambios (sin `indicacion`, igual que 0.1.1)
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde; `ruff` y `mypy` limpios
