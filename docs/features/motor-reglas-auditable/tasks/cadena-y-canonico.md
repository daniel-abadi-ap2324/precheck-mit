---
id: T2
title: "Implementar el canónico JSON y la cadena de eventos del dominio"
layer: "domain"
deps: []
blocks: ["T4", "T5", "T6"]
acs: ["AC-19"]
files_hint: ["precheck/auditoria/canonico.py", "precheck/auditoria/cadena.py", "precheck/auditoria/verificar_cadena.py"]
owner: "<TBD lead>"
estimate: "S"
context_budget: "S"
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T2 — Implementar el canónico JSON y la cadena de eventos del dominio

## Place in the sequence

- **Blocked by:** — · **Blocks:** T4 — Derivar el estado de las reglas y seleccionar la versión aplicable, T5 — Crear ErrorPreCheck y el registro de personas derivado de eventos, T6 — Implementar RepositorioSQLite detrás del puerto de bitácora · **Wave:** 1 (empieza cuando terminan sus dependencias).
- **Lane:** carril propio.

## Why (user story)

> **As a** Revisor DOYC
> **I want** comprobar que la bitácora de un expediente no fue alterada
> **So that** el registro tenga valor probatorio
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

Implementar el canónico JSON y la cadena de eventos del dominio: aporta la parte de US-08 que cubren AC-19.

## Inlined context

> | Serialización canónica | JSON con `sort_keys`, `ensure_ascii=False`, separadores `(",", ":")`, UTF-8; los números tal como salen de `json` (repr más corto) | `precheck/auditoria/canonico.py`, heredado de `verificar_cadena.py:13` |
>
> — `sad.md §8, verbatim` · full text: [sad.md](../sad.md)

> | Hash encadenado | `sha256(hash_previo + canónico(payload))`, `hash_previo` vacío en el génesis | `auditoria/canonico.py` |
>
> — `sad.md §8, verbatim` · full text: [sad.md](../sad.md)

> **Chosen:** Por expediente + cadena de reglas. Un expediente se verifica sin leer los demás, y el sello conjunto (ADR-0007) detecta que desaparezca una cadena entera.
>
> — `adr/0003-encadenar-por-expediente-y-en-una-cadena-de-reglas.md, Decision outcome, verbatim` · full text: [0003-encadenar-por-expediente-y-en-una-cadena-de-reglas.md](../adr/0003-encadenar-por-expediente-y-en-una-cadena-de-reglas.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes.

## API contract

> | `verificar(cadena_id: str \| None = None, sello: Sello \| None = None)` | `Verificacion` | US-08 · AC-19, AC-19b |
>
> — `contracts/public-api.md §Métodos, verbatim` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-19 — domain invariant

> **Given** una bitácora de expediente en la que se alteró, insertó o eliminó un evento
> **When** el Revisor DOYC verifica su integridad
> **Then** el sistema indica que la bitácora fue alterada y en qué evento se rompe la cadena
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Mover `canonico` y `calcular` de `verificar_cadena.py` a `precheck/auditoria/canonico.py` sin cambiar su salida
- [ ] `cadena.py`: `EventoNuevo`, `EventoRegistrado` (frozen), `encadenar(previo, evento)`, `verificar(eventos) -> (integra, rota_en)`, `cabeza(eventos)`
- [ ] `verificar_cadena.py` importa de `canonico.py` y conserva su CLI
- [ ] Pruebas unitarias en `tests/test_cadena.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Cadena vacía | íntegra, cabeza vacía |
| Evento con `hash_previo` ajeno | rota en ese `seq` |
| Payload alterado | rota en ese `seq` |
| Evento eliminado en medio | rota en el siguiente |
| Mismo payload con claves en otro orden | mismo hash |

## Definition of Done

- [ ] `tests/test_cadena.py` pasa, incluida la prueba de claves reordenadas
- [ ] `test_cadena_detecta_alteracion` existente sigue pasando
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
