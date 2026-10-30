---
id: T15
title: "Exponer la fachada PreCheck y la CLI python3 -m precheck"
layer: "ports"
deps: ["T8", "T11", "T12", "T13", "T14"]
blocks: ["T16"]
acs: ["AC-03", "AC-14", "AC-16"]
files_hint: ["precheck/__init__.py", "precheck/__main__.py", "precheck/cli.py", "README.md", "CLAUDE.md"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T15 — Exponer la fachada PreCheck y la CLI python3 -m precheck

## Place in the sequence

- **Blocked by:** T8 — Implementar aprobar, rechazar y retirar versiones con cuatro ojos, T11 — Implementar decidir, visto bueno y estado del expediente, T12 — Implementar reproducir una evaluación registrada, T13 — Implementar suspender y levantar normas con cuatro ojos, T14 — Implementar sellar y verificar contra el anclaje externo · **Blocks:** T16 — Agregar la prueba de extremo a extremo y las de NFR · **Wave:** 6 (empieza cuando terminan sus dependencias).
- **Lane:** carril propio.

## Why (user story)

> **As a** Revisor DOYC
> **I want** evaluar un expediente con las versiones de regla vigentes a su fecha de presentación
> **So that** cada resultado se base en la norma que regía cuando el profesional presentó el trámite
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Revisor DOYC
> **I want** confirmar o descartar con un motivo cada NO_CUMPLE bloqueante y cada REQUIERE_REVISION
> **So that** ninguna conclusión desfavorable quede sin decisión humana registrada
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As a** Revisor DOYC
> **I want** dar un visto bueno único a los CUMPLE y a los NO_CUMPLE de observación de un expediente, viendo de qué datos declarados depende cada uno
> **So that** ningún resultado oficial del expediente quede sin firma humana
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Exponer la fachada PreCheck y la CLI python3 -m precheck: aporta la parte de US-01, US-05, US-06 que cubren AC-03, AC-14, AC-16.

## Inlined context

> **Chosen:** CLI + biblioteca. Da un núcleo que se prueba en proceso y se reutiliza, sin la infraestructura de un servicio que la spec no pide.
>
> — `adr/0001-construir-nucleo-como-biblioteca-con-cli-delgada.md, Decision outcome, verbatim` · full text: [0001-construir-nucleo-como-biblioteca-con-cli-delgada.md](../adr/0001-construir-nucleo-como-biblioteca-con-cli-delgada.md)

> | Código | Significado |
> |---|---|
> | 0 | Operación completada (una evaluación con NO_CUMPLE también sale con 0: es un resultado, no un error) |
> | 1 | Error de uso: argumentos inválidos o archivo ilegible |
> | 2 | Rechazo de negocio (cualquier `codigo` de la tabla de errores) |
> | 3 | Integridad comprometida: bitácora alterada o que no coincide con el sello |
> | 4 | Reproducción con discrepancias |
> | 5 | No reproducible con esta versión del motor |
>
> Los errores salen por stderr como `ERROR <codigo>: <mensaje>`; con `--json`, `{"codigo": ..., "mensaje": ..., "detalles": {...}}`.
>
> — `contracts/cli.md §Códigos de salida, verbatim` · full text: [cli.md](../contracts/cli.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes.

## API contract

> ```
> python3 -m precheck [--bitacora RUTA] [--json] <subcomando> [opciones]
> ```
>
> | Opción | Por defecto | Descripción |
> |---|---|---|
> | `--bitacora RUTA` | variable `PRECHECK_BITACORA`, si no `./bitacora.sqlite3` | Archivo SQLite de la bitácora. Si no existe, se crea con las migraciones aplicadas. |
> | `--json` | apagado | Salida JSON estable (el esquema de cada subcomando es el tipo de retorno en `public-api.md`). Sin la opción, texto en español para el revisor. |
>
> **Identidad.** La CLI no recibe la persona por argumento: el núcleo la resuelve desde la cuenta del sistema operativo con `ResolutorIdentidad` (ADR-0006, sad §8). Una cuenta sin vínculo recibe `identidad.cuenta_no_vinculada`.
>
> — `contracts/cli.md §Invocación, verbatim` · full text: [cli.md](../contracts/cli.md)

> ```python
> from precheck import PreCheck, abrir
>
> pc: PreCheck = abrir(ruta_bitacora: str | os.PathLike,
>                      normativa: Sequence[os.PathLike],
>                      resolutor: ResolutorIdentidad | None = None,   # por defecto: cuenta del SO
>                      destino_anclaje: DestinoAnclaje | None = None)
> ```
>
> `abrir` crea la bitácora si no existe, aplica las migraciones pendientes y activa `foreign_keys`.
>
> — `contracts/public-api.md §Punto de entrada, verbatim` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-03 — error

> **Given** un expediente sin fecha de presentación registrada
> **When** el Revisor DOYC intenta evaluarlo
> **Then** el sistema no evalúa y le indica que falta la fecha de presentación, porque sin ella no puede determinar la norma aplicable
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — error

> **Given** un NO_CUMPLE bloqueante o un REQUIERE_REVISION pendiente
> **When** el Revisor DOYC intenta descartarlo sin escribir un motivo
> **Then** el sistema no registra la decisión y le indica que el motivo es obligatorio
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — domain invariant

> **Given** un expediente con NO_CUMPLE bloqueantes o REQUIERE_REVISION sin decisión, o con CUMPLE u observaciones sin visto bueno
> **When** alguien consulta el estado del expediente
> **Then** el sistema lo presenta como pendiente de revisión humana, y solo lo presenta como revisado cuando todo tiene decisión o visto bueno; en ningún caso lo presenta como aprobado
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `precheck/__init__.py`: `abrir(...)` y `PreCheck` delegando en los servicios
- [ ] `cli.py` + `__main__.py`: los 20 subcomandos, `--json`, `--bitacora`, códigos de salida, `ERROR <codigo>: <mensaje>` por stderr
- [ ] Actualizar `README.md` y la tabla de estructura de `CLAUDE.md`
- [ ] Pruebas en `tests/test_cli.py` por subproceso (patrón de `tests/test_precheck.py:26`)

## Edge cases

| Case | Behaviour |
|---|---|
| Error de negocio | salida 2 y código en stderr |
| `--json` | esquema estable del tipo de retorno |

## Definition of Done

- [ ] `tests/test_cli.py` pasa (AC-03, AC-14 y AC-16 vistos desde la CLI)
- [ ] Suite completa verde
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
