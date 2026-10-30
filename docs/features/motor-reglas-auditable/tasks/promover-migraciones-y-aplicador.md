---
id: T1
title: "Promover las migraciones de la bitácora y crear su aplicador"
layer: "migration"
deps: []
blocks: ["T6"]
acs: ["AC-19"]
files_hint: ["docs/features/motor-reglas-auditable/migrations/", "precheck/auditoria/migraciones/", "precheck/auditoria/migrar.py"]
owner: "<TBD lead>"
estimate: "S"
context_budget: "M"
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T1 — Promover las migraciones de la bitácora y crear su aplicador

## Place in the sequence

- **Blocked by:** — · **Blocks:** T6 — Implementar RepositorioSQLite detrás del puerto de bitácora · **Wave:** 1 (empieza cuando terminan sus dependencias).
- **Lane:** carril propio (las tareas `migration` se serializan).

## Why (user story)

> **As a** Revisor DOYC
> **I want** comprobar que la bitácora de un expediente no fue alterada
> **So that** el registro tenga valor probatorio
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

Promover las migraciones de la bitácora y crear su aplicador: aporta la parte de US-08 que cubren AC-19.

## Inlined context

> **Chosen:** SQLite tras un puerto `RepositorioBitacora`. Da atomicidad y bloqueo de modificaciones sin infraestructura, y el puerto aísla la migración.
>
> — `adr/0002-guardar-bitacora-en-sqlite-de-solo-anexar-tras-un-puerto.md, Decision outcome, verbatim` · full text: [0002-guardar-bitacora-en-sqlite-de-solo-anexar-tras-un-puerto.md](../adr/0002-guardar-bitacora-en-sqlite-de-solo-anexar-tras-un-puerto.md)

> | Serialización canónica | JSON con `sort_keys`, `ensure_ascii=False`, separadores `(",", ":")`, UTF-8; los números tal como salen de `json` (repr más corto) | `precheck/auditoria/canonico.py`, heredado de `verificar_cadena.py:13` |
>
> — `sad.md §8, verbatim` · full text: [sad.md](../sad.md)

> El repo no tiene base de datos, carpeta `migrations/` ni herramienta de migración (`architecture-map.md`: `migration_tool: ""`). Propuesta para `implement`: crear `precheck/auditoria/migraciones/` con los archivos numerados `0001_…` en el orden 01 a 04, y un aplicador mínimo que use `PRAGMA user_version` para registrar la última migración aplicada, con cada archivo en una transacción. La numeración definitiva se asigna al promover.
>
> — `_audit/data-model-2026-09-27.md, Pista de convención, verbatim` · full text: [data-model-2026-09-27.md](../_audit/data-model-2026-09-27.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

> #### `cadena`
> | Column | Type | Constraints | Notes |
> |---|---|---|---|
> | `id` | TEXT | PK | `reglas` o `expediente:<expediente_id>` |
> | `tipo` | TEXT | NOT NULL, CHECK en (`reglas`, `expediente`), coherente con `id` | |
> | `creada_en` | TEXT | NOT NULL | ISO 8601 UTC |
>
> **Aggregate root:** raíz. **Access patterns:** lectura por `id` → PK. **Constraints:** sin UPDATE ni DELETE (triggers). Bootstrap: la fila `reglas` se crea en la migración 01.
>
> — `data-model.md §Entities, `cadena`, verbatim` · full text: [data-model.md](../data-model.md)

> #### `evento`
> | Column | Type | Constraints | Notes |
> |---|---|---|---|
> | `cadena_id` | TEXT | PK, FK → `cadena(id)` | |
> | `seq` | INTEGER | PK, CHECK ≥ 1; trigger: = máximo de la cadena + 1 | orden dentro de la cadena |
> | `tipo` | TEXT | NOT NULL | ver «Tipos de evento»; se valida en la aplicación para no congelar el conjunto en un CHECK |
> | `actor` | TEXT | NOT NULL | `persona_id` del registro, o `sistema:precheck@<version>` para el sello programado |
> | `rol` | TEXT | NOT NULL | rol con el que actuó |
> | `ocurrido_en` | TEXT | NOT NULL | ISO 8601 UTC |
> | `payload` | TEXT | NOT NULL, CHECK `json_valid` | JSON canónico (sad §8) |
> | `hash_previo` | TEXT | NOT NULL; `''` si y solo si `seq = 1`; trigger: = hash del evento anterior | |
> | `hash` | TEXT | NOT NULL, UNIQUE, largo 64 | `sha256(hash_previo + canónico(payload))`, calculado por la aplicación |
>
> **Aggregate root:** `cadena`. **Access patterns:** leer una cadena en orden y su cabeza → PK `(cadena_id, seq)`; ubicar un evento por el hash sellado → UNIQUE `hash`. **Constraints:** continuidad, no UPDATE, no DELETE (triggers).
>
> **Tipos de evento** (validados por el núcleo):
> - Cadena de expediente: `evaluacion`, `decision`, `visto_bueno`, `reproduccion`, `afectado_suspension`, `anulacion`.
> - Cadena de reglas: `propuesta`, `aprobacion`, `rechazo`, `retiro`, `suspension_propuesta`, `suspension_confirmada`, `levantamiento_propuesto`, `levantamiento_confirmado`, `designacion_genesis`, `designacion_propuesta`, `designacion_confirmada`, `vinculo_cuenta`, `sello`.
>
> El payload de `evaluacion` guarda la instantánea (ADR-0004): fecha de presentación, hechos con su fuente, umbral, `VERSION_MOTOR` y commit, y por cada regla `(regla_id, version, hash_contenido, estado_a_la_evaluacion, resultado, indicativo, motivo, valores_usados)`, más la cobertura. El contenido de cada regla se referencia por `hash_contenido` en `contenido_regla`.
>
> — `data-model.md §Entities, `evento`, verbatim` · full text: [data-model.md](../data-model.md)

> #### `contenido_regla`
> | Column | Type | Constraints | Notes |
> |---|---|---|---|
> | `hash` | TEXT | PK, largo 64 | `sha256(canónico(contenido))`; se autoverifica |
> | `regla_id` | TEXT | NOT NULL | `<NORMA>-<TRAMITE>-<TEMA>` |
> | `version` | INTEGER | NOT NULL, CHECK ≥ 1 | |
> | `contenido` | TEXT | NOT NULL, CHECK `json_valid` | la versión completa, según el esquema de reglas |
> | `registrado_en` | TEXT | NOT NULL | ISO 8601 UTC |
>
> **Aggregate root:** raíz de contenido (lo referencian `propuesta` y `evaluacion` por hash). **Access patterns:** cargar por hash → PK; cargar por `(regla_id, version)` → UNIQUE. **Constraints:** una sola versión por `(regla_id, version)`; inmutable (triggers).
>
> — `data-model.md §Entities, `contenido_regla`, verbatim` · full text: [data-model.md](../data-model.md)

> #### `uso_regla`
> | Column | Type | Constraints | Notes |
> |---|---|---|---|
> | `regla_id` | TEXT | PK, FK → `contenido_regla(regla_id, version)` | |
> | `version` | INTEGER | PK | |
> | `cadena_id` | TEXT | PK, FK → `evento(cadena_id, seq)` | |
> | `seq` | INTEGER | PK | |
>
> **Aggregate root:** `evento` (se escribe en la misma transacción que el evento de evaluación). **Access patterns:** qué evaluaciones usaron una versión (flujos 5 y 6) → PK; FK hacia el evento → `idx_uso_regla_evento`. **Constraints:** de solo anexar (triggers).
>
> — `data-model.md §Entities, `uso_regla`, verbatim` · full text: [data-model.md](../data-model.md)

Pares preparados: `docs/features/motor-reglas-auditable/migrations/01_create_cadena`, `02_create_evento`, `03_create_contenido_regla`, `04_create_uso_regla` (`.up.sql` / `.down.sql`).

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-19 — domain invariant

> **Given** una bitácora de expediente en la que se alteró, insertó o eliminó un evento
> **When** el Revisor DOYC verifica su integridad
> **Then** el sistema indica que la bitácora fue alterada y en qué evento se rompe la cadena
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Copiar los 4 pares preparados a `precheck/auditoria/migraciones/0001_…0004_*.sql` (conservando el orden 01→04)
- [ ] Escribir `precheck/auditoria/migrar.py`: `aplicar(conexion)` con `PRAGMA user_version`, una transacción por archivo, `PRAGMA foreign_keys = ON`
- [ ] Prueba `tests/test_migraciones.py`: aplica, reaplica sin error, bloquea UPDATE/DELETE y saltos de cadena, revierte a 0 objetos

## Edge cases

| Case | Behaviour |
|---|---|
| Base ya migrada | `aplicar` no hace nada (user_version al día) |
| Inserción que salta `seq` o con `hash_previo` ajeno | la base aborta con «cadena rota» |
| UPDATE/DELETE en `evento`, `cadena`, `contenido_regla`, `uso_regla` | la base aborta |

## Definition of Done

- [ ] `tests/test_migraciones.py` pasa: aplicar, reaplicar, triggers y reversión
- [ ] Las 10 pruebas existentes siguen pasando
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
