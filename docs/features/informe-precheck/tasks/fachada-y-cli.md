---
id: T11
title: "Exponer los métodos del informe en la fachada y la CLI"
layer: "ports"
deps: ["T3", "T9", "T10"]
blocks: ["T12", "T13"]
acs: ["AC-07"]
files_hint: ["precheck/__init__.py", "precheck/cli.py", "tests/test_cli_informe.py"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T11 — Exponer los métodos del informe en la fachada y la CLI

## Place in the sequence

- **Blocked by:** T3 — Registrar la indicación al profesional y decidir con indicación, T9 — Generar la versión del revisor y emitir la del profesional, T10 — Verificar informes por archivo y por código y listar emitidos · **Blocks:** T12 — Agregar la prueba de extremo a extremo y las de NFR del informe, T13 — Documentar el módulo informe y registrar el cambio · **Wave:** 6 (adaptadores sobre los servicios terminados).
- **Lane:** carril propio (`precheck/__init__.py`, `precheck/cli.py`).

## Why (user story)

> **As a** Revisor DOYC
> **I want** emitir la versión del profesional cuando el expediente esté revisado
> **So that** entregue al profesional idóneo un informe que quede registrado y que no pueda contener nada sin respaldo
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

Esta tarea hace usables desde la biblioteca y la terminal las operaciones de US-01, US-02, US-05, US-06 y US-07, con la autorización de AC-07 vista desde fuera.

## Inlined context

> **Target surfaces:** `library-sdk` + `cli`, igual que el núcleo (ADR-0001 de `motor-reglas-auditable`): toda la lógica en la biblioteca, la CLI solo traduce argumentos, salidas y códigos.
>
> — `sad.md §4, Solution strategy, abridged` · full text: [sad.md](../sad.md)

> ```mermaid
> sequenceDiagram
>     alt la cuenta no tiene persona vinculada
>         service-->>client: rechazo: cuenta no vinculada, sin revelar el expediente
>     else la persona no tiene el rol de Revisor DOYC
>         service-->>client: rechazo: se necesita el rol de Revisor DOYC, sin revelar el expediente
>     else Revisor DOYC
>         service->>service: continúa con la operación (flujos 1 a 8)
>     end
> ```
>
> — `sad.md §6, Flujo 9, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Errores de negocio como `ErrorPreCheck(codigo)` traducidos por la CLI a salida 2; códigos con prefijo por dominio (`informe.*`).
>
> — `sad.md §2, Conventions, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) ·
[cli.md](../contracts/cli.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes.

## API contract

> | Código | En los subcomandos del informe |
> |---|---|
> | 0 | Informe generado o emitido; indicación registrada; verificación `coincide` (aunque la emisión esté reemplazada, sustituida o afectada: es información, no error); lista de emitidos |
> | 1 | Error de uso: argumentos inválidos, archivo de encabezado ilegible, directorio de salida inexistente |
> | 2 | Rechazo de negocio (tabla de errores) |
> | 3 | Verificación `no_coincide`, o bloque de trazabilidad distinto del evento de emisión |
> | 5 | `no_verificable_version`: la emisión existe pero su formato es de otra versión |
> | 6 | Bitácora no disponible |
>
> ```
> informe --expediente ID --evaluacion SEQ --salida DIRECTORIO [--encabezado ARCHIVO.json]
> emitir --expediente ID --evaluacion SEQ --salida DIRECTORIO [--encabezado ARCHIVO.json]
> indicar --expediente ID --evaluacion SEQ --regla ID|norma:NORMA --texto TEXTO
> verificar-informe (--archivo RUTA | --expediente ID --codigo CODIGO) [--salida DIRECTORIO]
> emitidos --expediente ID
> decidir --expediente ID --evaluacion SEQ --regla ID (--confirmar | --descartar | --veredicto CUMPLE|NO_CUMPLE) --motivo TEXTO [--indicacion TEXTO]
> ```
> - `informe`: Escribe `informe-revisor-<ID>-<SEQ>.html` y `.json` (versión del revisor, «uso interno»). No registra nada.
> - `--encabezado`: JSON con `tramite`, `proyecto`, `finca`, `profesional`, `idoneidad` (todas opcionales; las ausentes salen «no consta»).
> - `emitir`: Escribe `informe-profesional-<ID>-<SEQ>-<huella[:8]>.html` y `.json`, registra la emisión e imprime el código de huella en bloques.
> - `verificar-informe --codigo`: con `--salida` escribe el contenido regenerado (`regenerado-<ID>-<seq>.html`).
> - `verificar-informe` Salida: resultado, emisiones con quién, cuándo y vigencia (`vigente`, `reemplazado`, `sustituida`, afectaciones), y el aviso correspondiente.
> - `emitidos`: Lista cada emisión con evaluación, huella, quién, cuándo, vigencia y afectaciones con su período.
>
> — `contracts/cli.md, Códigos de salida y Subcomandos nuevos, abridged` · full text: [cli.md](../contracts/cli.md)

> Todos resuelven la persona y exigen el rol `revisor_doyc` (flujo 9 · AC-07); si no, `identidad.cuenta_no_vinculada` o `identidad.sin_rol`, sin leer el expediente.
>
> — `contracts/public-api.md, Métodos nuevos de PreCheck, verbatim` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-07 — authorization

> **Given** una persona sin el rol de Revisor DOYC (por ejemplo, un Redactor de reglas) o una cuenta sin persona vinculada
> **When** pide cualquiera de las dos versiones, intenta emitir la del profesional, verificar un informe, consultar los informes emitidos o escribir una indicación al profesional
> **Then** el sistema lo deniega, explica que se necesita el rol de Revisor DOYC y no revela el contenido del expediente
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Métodos `informe_revisor`, `emitir`, `indicar`, `verificar_informe`, `verificar_codigo`, `emitidos` y `decidir(..., indicacion=None)` en `PreCheck`; reexportar `Encabezado`, `Informe`, `Emision`, `EstadoEmision`, `Afectacion`, `VerificacionInforme` — `precheck/__init__.py`
- [ ] Subcomandos `informe`, `emitir`, `indicar`, `verificar-informe`, `emitidos` y `decidir --indicacion`; lectura del `--encabezado` (ilegible → salida 1); directorio de salida inexistente → salida 1; nombres de archivo del contrato — `precheck/cli.py`
- [ ] Salidas: `ErrorPreCheck` → 2; `no_coincide` o `trazabilidad_coincide=False` → 3; `no_verificable_version` → 5; bitácora no disponible → 6; `--json` en todos
- [ ] Pruebas — `tests/test_cli_informe.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Redactor de reglas pide `informe` o `emitidos` | salida 2 `identidad.sin_rol`; la salida no incluye nada del expediente |
| Cuenta sin persona vinculada | salida 2 `identidad.cuenta_no_vinculada` |
| `verificar-informe` sin `--archivo` ni `--codigo`, o con ambos | salida 1 (uso) |
| `verificar-informe` que coincide con una emisión reemplazada | salida 0, con la vigencia en el texto |
| `--encabezado` con JSON inválido | salida 1 |
| `--json` | misma información en JSON estable, mismos códigos de salida |

## Definition of Done

- [ ] `tests/test_cli_informe.py` cubre AC-07 para los seis subcomandos (y `decidir --indicacion`) y las salidas 0/1/2/3/5/6 del contrato, y pasa
- [ ] `tests/test_cli.py` existente sigue pasando
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde; `ruff` y `mypy` limpios
