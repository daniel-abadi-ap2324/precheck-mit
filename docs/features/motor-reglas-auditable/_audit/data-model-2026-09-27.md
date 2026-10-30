# Auditoría data-model — motor-reglas-auditable (2026-09-27)

**Las migraciones están en preparación: todavía no están en un árbol vivo de `migrations/`. `implement` las promueve.**

## Migraciones preparadas

| Orden | Archivos |
|---|---|
| 01 | `docs/features/motor-reglas-auditable/migrations/01_create_cadena.{up,down}.sql` (incluye bootstrap de la cadena `reglas`) |
| 02 | `…/migrations/02_create_evento.{up,down}.sql` |
| 03 | `…/migrations/03_create_contenido_regla.{up,down}.sql` |
| 04 | `…/migrations/04_create_uso_regla.{up,down}.sql` |

## Pista de convención para la promoción

El repo no tiene base de datos, carpeta `migrations/` ni herramienta de migración (`architecture-map.md`: `migration_tool: ""`). Propuesta para `implement`: crear `precheck/auditoria/migraciones/` con los archivos numerados `0001_…` en el orden 01 a 04, y un aplicador mínimo que use `PRAGMA user_version` para registrar la última migración aplicada, con cada archivo en una transacción. La numeración definitiva se asigna al promover.

## Autocontrol (4 obligatorios)

- **Nombres:** tablas y columnas en español y snake_case, como los campos del esquema de reglas (`regla_id`, `version`). Pasa.
- **Reversibilidad:** cada CREATE TABLE, TRIGGER e INDEX tiene su DROP en el `.down`; verificado en SQLite en memoria (aplicar dos veces y revertir deja 0 objetos). Pasa.
- **Índices de FK:** `evento.cadena_id` queda cubierto por el prefijo de la PK; `uso_regla(regla_id, version)` por el prefijo de la PK; `uso_regla(cadena_id, seq)` por `idx_uso_regla_evento`. Pasa.
- **Convenciones:** en greenfield se confirmaron con el usuario los agregados, la deduplicación y el índice de uso. El resto sale de ADR-0002 a ADR-0006 y de sad §8. Pasa.

## Verificación ejecutada

Contra SQLite 3.46.1 en memoria: aplicar dos veces (idempotente), rechazo de un salto de `seq` y de un `hash_previo` incorrecto, rechazo de UPDATE y DELETE en `evento` y DELETE en `cadena`, UNIQUE de `(regla_id, version)`, FK de `uso_regla`, plan de consulta por PK, y reversión completa.

## Desviaciones y decisiones sin pregunta

- `evento.tipo` sin CHECK: en SQLite cambiar un CHECK obliga a reconstruir la tabla, así que el conjunto se valida en el núcleo.
- Fechas en TEXT ISO 8601 UTC (SQLite no tiene tipo fecha); lo fija sad §8.
- Tablas `STRICT` (disponibles desde SQLite 3.37).

## Drift

No aplica: todavía no existe capa de dominio para estas entidades. Se revisa en `implement`.

## Breaking changes

Ninguno: todas las tablas son nuevas.

## TBD

Ninguno en el esquema. Siguen abiertos en sad §11: el destino del anclaje, el caso sin CEUS, la retención de versiones del motor y la designación génesis. Ninguno cambia el esquema.
