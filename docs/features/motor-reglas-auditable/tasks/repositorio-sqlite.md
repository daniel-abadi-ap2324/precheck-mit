---
id: T6
title: "Implementar RepositorioSQLite detrás del puerto de bitácora"
layer: "infra"
deps: ["T1", "T2"]
blocks: ["T7", "T9", "T10", "T14"]
acs: ["AC-19"]
files_hint: ["precheck/auditoria/puertos.py", "precheck/auditoria/sqlite_repo.py"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T6 — Implementar RepositorioSQLite detrás del puerto de bitácora

## Place in the sequence

- **Blocked by:** T1 — Promover las migraciones de la bitácora y crear su aplicador, T2 — Implementar el canónico JSON y la cadena de eventos del dominio · **Blocks:** T7 — Implementar proponer versiones con verificación de cita, T9 — Implementar inicializar, vincular cuenta, designar y confirmar propuestas, T10 — Implementar evaluar expediente con degradación, CEUS, cobertura e instantánea, T14 — Implementar sellar y verificar contra el anclaje externo · **Wave:** 2 (empieza cuando terminan sus dependencias).
- **Lane:** carril propio.

## Why (user story)

> **As a** Revisor DOYC
> **I want** comprobar que la bitácora de un expediente no fue alterada
> **So that** el registro tenga valor probatorio
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

Implementar RepositorioSQLite detrás del puerto de bitácora: aporta la parte de US-08 que cubren AC-19.

## Inlined context

> **Chosen:** SQLite tras un puerto `RepositorioBitacora`. Da atomicidad y bloqueo de modificaciones sin infraestructura, y el puerto aísla la migración.
>
> — `adr/0002-guardar-bitacora-en-sqlite-de-solo-anexar-tras-un-puerto.md, Decision outcome, verbatim` · full text: [0002-guardar-bitacora-en-sqlite-de-solo-anexar-tras-un-puerto.md](../adr/0002-guardar-bitacora-en-sqlite-de-solo-anexar-tras-un-puerto.md)

> **Chosen:** Instantánea completa. Reproducir no depende de que el catálogo sobreviva ni de su estado actual; «qué cambiaría hoy» es un informe aparte.
>
> — `adr/0004-guardar-instantanea-completa-en-cada-evaluacion.md, Decision outcome, verbatim` · full text: [0004-guardar-instantanea-completa-en-cada-evaluacion.md](../adr/0004-guardar-instantanea-completa-en-cada-evaluacion.md)

> ```python
> class RepositorioBitacora(Protocol):
>     def anexar(self, cadena_id: str, evento: EventoNuevo, usos: Sequence[UsoRegla] = ()) -> EventoRegistrado: ...
>     def leer(self, cadena_id: str, desde: int = 1) -> Iterator[EventoRegistrado]: ...
>     def cabezas(self) -> dict[str, str]: ...                              # cadena_id -> hash
>     def guardar_contenido(self, contenido: ContenidoRegla) -> str: ...    # devuelve hash; idempotente
>     def contenido(self, hash_: str) -> ContenidoRegla: ...
>     def usos(self, regla_id: str, version: int) -> list[tuple[str, int]]: ...
>
> class ResolutorIdentidad(Protocol):
>     def cuenta_actual(self) -> str: ...
>
> class DestinoAnclaje(Protocol):
>     def exportar(self, sello: Sello) -> str: ...     # devuelve una referencia al sello exportado
>     def ultimo(self) -> Sello | None: ...
> ```
>
> Adaptadores incluidos: `RepositorioSQLite` (ADR-0002), `ResolutorCuentaSO` (`getpass.getuser()`) y `DestinoArchivo(directorio)` (ADR-0007). Las pruebas inyectan un `ResolutorIdentidad` falso.
>
> — `contracts/public-api.md §Puertos, verbatim` · full text: [public-api.md](../contracts/public-api.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

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

Lee y escribe las tablas creadas por T1; no cambia el esquema.

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

- [ ] `puertos.py`: `RepositorioBitacora`, `DestinoAnclaje` como `typing.Protocol`
- [ ] `sqlite_repo.py`: `anexar` (crea la cadena si falta, calcula `seq` y hash con `cadena.encadenar`, escribe `uso_regla` en la misma transacción), `leer`, `cabezas`, `guardar_contenido` (idempotente por hash), `contenido`, `usos`
- [ ] Pruebas en `tests/test_sqlite_repo.py` con base `:memory:`

## Edge cases

| Case | Behaviour |
|---|---|
| Guardar dos veces el mismo contenido | devuelve el mismo hash, sin error |
| Mismo `(regla_id, version)` con otro contenido | `regla.inmutable` |
| Fallo a mitad de `anexar` | ni evento ni usos quedan escritos |

## Definition of Done

- [ ] `tests/test_sqlite_repo.py` pasa (anexar, leer, cabezas, usos, idempotencia, atomicidad)
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
