---
id: T1
title: "Agregar anexar_lote y cadenas al puerto de bitácora y los códigos informe.*"
layer: "infra"
deps: []
blocks: ["T3", "T9"]
acs: ["AC-17"]
files_hint: ["precheck/auditoria/puertos.py", "precheck/auditoria/sqlite_repo.py", "precheck/contexto.py", "precheck/errores.py", "tests/test_anexar_lote.py"]
owner: "<TBD lead>"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T1 — Agregar anexar_lote y cadenas al puerto de bitácora y los códigos informe.*

## Place in the sequence

- **Blocked by:** — · **Blocks:** T3 — Registrar la indicación al profesional y decidir con indicación, T9 — Generar la versión del revisor y emitir la del profesional · **Wave:** 1 (sin dependencias; arranca en paralelo con T2, T4 y T7).
- **Lane:** carril propio; es la única tarea que toca `precheck/auditoria/` y `precheck/errores.py`.

## Why (user story)

> **As a** Revisor DOYC
> **I want** escribir, al decidir o después, una indicación para el profesional separada del motivo de mi decisión
> **So that** el profesional reciba una instrucción útil sin que salga del sistema el criterio interno que dejo para la auditoría
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

Esta tarea deja la infraestructura para que decisión e indicación se anexen en una sola transacción (AC-17) y declara los códigos de error que usan T3, T9 y T10.

## Inlined context

> ```
> precheck/auditoria/puertos.py     RepositorioBitacora gana anexar_lote(cadena_id, eventos) y cadenas()
> precheck/auditoria/sqlite_repo.py anexar_lote — varios eventos en una transacción
> precheck/contexto.py              anexar_lote con actor y reloj, como anexar
> precheck/errores.py               códigos informe.*
> ```
>
> — `sad.md §5, descomposición interna, abridged` · full text: [sad.md](../sad.md)

> | Transacciones | `anexar_lote` en el repositorio: decisión + indicación en una sola transacción | puerto `RepositorioBitacora` |
> | Errores | `ErrorPreCheck` con códigos `informe.*` (p. ej. pendiente, no vigente, sin indicación, afectada, inexistente) → salida 2; verificación sin coincidencia → salida 3, igual que `verificar`; formato de otra versión → salida 5 | `precheck/errores.py`, contrato CLI |
>
> — `sad.md §8, filas «Transacciones» y «Errores», verbatim` · full text: [sad.md](../sad.md)

> - **Repositorio:** gana `anexar_lote` para escribir varios eventos en una sola transacción.
>
> — `adr/0003-registrar-la-indicacion-al-profesional-como-evento-propio.md, Decision outcome, abridged` · full text: [ADR-0003](../adr/0003-registrar-la-indicacion-al-profesional-como-evento-propio.md)

> **Hard rule:** Bitácora SQLite de solo anexar detrás del puerto `RepositorioBitacora` (ADR-0002 de `motor-reglas-auditable`); sin migraciones nuevas: el informe agrega tipos de evento, no tablas.
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) ·
[cli.md](../contracts/cli.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes. No hay cambio de esquema: el puerto gana el método `anexar_lote` (varios eventos de una cadena en una transacción) y `cadenas()` pasa del adaptador SQLite al puerto; los eventos siguen en la tabla `evento` existente.

## API contract

> ```python
> class RepositorioBitacora(Protocol):
>     ...                                                                   # igual que 0.1.1
>     def anexar_lote(self, cadena_id: str, eventos: Sequence[EventoNuevo]) -> list[EventoRegistrado]: ...  # una transacción
>     def cadenas(self) -> list[str]: ...                                   # ya existía en RepositorioSQLite; pasa al puerto
> ```
>
> `Contexto.anexar_lote(cadena_id, [(tipo, actor, rol, payload), …])` aplica el mismo reloj y el mismo actor que `anexar`.
>
> — `contracts/public-api.md, Puertos (enmienda), verbatim` · full text: [public-api.md](../contracts/public-api.md)

> | `codigo` | Mensaje (plantilla) | AC / flujo |
> |---|---|---|
> | `informe.expediente_pendiente` | La versión del profesional solo se emite con el expediente revisado; falta: {pendientes}. | AC-05 · flujo 1 |
> | `informe.sin_indicacion` | Toda observación necesita su indicación al profesional; faltan: {observaciones}. | AC-18 · flujo 1 |
> | `informe.resultados_afectados` | La evaluación tiene resultados afectados por un retiro o una suspensión; reevalúe el expediente. | AC-20 · flujo 1 |
> | `informe.indicacion_no_aplicable` | Solo se escriben indicaciones sobre observaciones de la evaluación vigente. | AC-21 · flujo 5 |
> | `informe.indicacion_vacia` | La indicación al profesional no puede estar vacía. | flujo 5 |
> | `informe.codigo_corto` | El código de huella debe tener al menos 16 caracteres. | AC-12 · flujo 7 |
> | `informe.archivo_no_verificable` | El archivo no es un documento ni una forma estructurada del PreCheck; verifíquelo con el código impreso. | AC-13 · flujo 2 |
>
> — `contracts/cli.md, Tabla de errores nuevos, verbatim` · full text: [cli.md](../contracts/cli.md)

## Acceptance criteria

### AC-17 — happy

> **Given** un Revisor DOYC que confirma un NO_CUMPLE bloqueante, da un veredicto desfavorable sobre un REQUIERE_REVISION o tiene un NO_CUMPLE no bloqueante oficial cubierto por el visto bueno
> **When** escribe la indicación al profesional al decidir, o la agrega después como complemento de ese resultado
> **Then** el sistema la registra atribuida a él, sin reescribir la decisión ni su motivo, y la usa como «qué hacer» de esa observación; cualquier Revisor DOYC puede escribirla; si hay varias, la versión del profesional usa la última y la del revisor muestra el historial
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

Esta tarea cubre de AC-17 solo la precondición de infraestructura: varios eventos anexados atómicamente, cada uno con su actor. La regla de negocio es de T3.

## Checklist

- [ ] `anexar_lote` y `cadenas` en el `Protocol` — `precheck/auditoria/puertos.py`
- [ ] `RepositorioSQLite.anexar_lote`: una sola transacción, `seq` y `hash_previo` encadenados entre los eventos del lote; si falla uno, no queda ninguno — `precheck/auditoria/sqlite_repo.py`
- [ ] `Contexto.anexar_lote(cadena_id, [(tipo, actor, rol, payload), …])`: mismo reloj (un solo instante) y mismo sobre que `anexar` — `precheck/contexto.py`
- [ ] Los 7 códigos `informe.*` en `CODIGOS`, con los mensajes de la tabla — `precheck/errores.py`
- [ ] Pruebas — `tests/test_anexar_lote.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Un evento del lote viola una restricción (p. ej. payload no serializable) | se revierte la transacción; la cadena queda con la misma cabeza que antes |
| Lote vacío | devuelve `[]` sin escribir |
| `cadenas()` con bitácora nueva | devuelve la lista (puede incluir solo `reglas`) sin error |
| Plantillas con `{pendientes}` / `{observaciones}` | el mensaje base queda en `CODIGOS`; el detalle viaja en `detalles` como hoy |

## Definition of Done

- [ ] `tests/test_anexar_lote.py` pasa: lote atómico (rollback ante fallo), encadenamiento correcto, `verificar_cadena` en verde tras un lote, `cadenas()` desde el puerto
- [ ] `ErrorPreCheck("informe.<código>")` se construye para los 7 códigos nuevos
- [ ] Las pruebas existentes siguen pasando
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde; `ruff` y `mypy` limpios
