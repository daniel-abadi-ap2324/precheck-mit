---
id: T7
title: "Implementar proponer versiones con verificación de cita"
layer: "app"
deps: ["T4", "T5", "T6"]
blocks: ["T8"]
acs: ["AC-07", "AC-08", "AC-12"]
files_hint: ["precheck/reglas/servicio.py", "precheck/motor/verificar_citas.py"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T7 — Implementar proponer versiones con verificación de cita

## Place in the sequence

- **Blocked by:** T4 — Derivar el estado de las reglas y seleccionar la versión aplicable, T5 — Crear ErrorPreCheck y el registro de personas derivado de eventos, T6 — Implementar RepositorioSQLite detrás del puerto de bitácora · **Blocks:** T8 — Implementar aprobar, rechazar y retirar versiones con cuatro ojos · **Wave:** 3 (empieza cuando terminan sus dependencias).
- **Lane:** comparte `files_hint` con T13, T8; serializado.

## Why (user story)

> **As a** Redactor de reglas
> **I want** proponer una versión nueva de una regla con su fuente, cita literal y vigencia
> **So that** entre al circuito de aprobación sin alterar las versiones ya aprobadas
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Revisor aprobador
> **I want** aprobar o rechazar una versión de regla redactada por otra persona
> **So that** solo reglas validadas por un segundo par de ojos emitan resultados oficiales
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

Implementar proponer versiones con verificación de cita: aporta la parte de US-03, US-04 que cubren AC-07, AC-08, AC-12.

## Inlined context

> **Chosen:** Estado derivado de la cadena. Las reglas de selección son: rige la versión aprobada más reciente cuya vigencia cubre la fecha de presentación; un borrador solo agrega su indicativo; no se admiten dos aprobadas con vigencias solapadas; una retirada o sin aprobada da REQUIERE_REVISION; una rechazada es un estado final sin indicativo.
>
> — `adr/0005-derivar-estado-de-reglas-de-la-cadena-de-reglas.md, Decision outcome, verbatim` · full text: [0005-derivar-estado-de-reglas-de-la-cadena-de-reglas.md](../adr/0005-derivar-estado-de-reglas-de-la-cadena-de-reglas.md)

> ```mermaid
> sequenceDiagram
>     actor Redactor as Redactor de reglas
>     participant client as <client>
>     participant service as <service>
>     participant store as <data-store>
>     Note over Redactor,store: precondición: la cuenta está vinculada a una persona del registro
>     Redactor->>client: propone versión con fuente, cita y vigencia
>     client->>service: proponer versión
>     service->>service: resuelve la persona desde la cuenta
>     service->>store: lee la normativa cargada y las versiones existentes de la regla
>     alt la cita no aparece literal en la normativa
>         service-->>client: rechazo: la cita no se encuentra en el texto fuente
>     else la cita se verifica
>         service->>service: asigna número de versión nuevo y calcula el hash del contenido
>         Note over service,store: persiste evento «propuesta» en la cadena de reglas (versión anterior intacta)
>         service-->>client: versión registrada como borrador
>     end
>     client-->>Redactor: resultado
> ```
>
> — `sad.md §6, Flujo 4, verbatim` · full text: [sad.md](../sad.md)

> | Integridad de citas | 100 % de reglas con cita verificable antes de poder aprobarse | verificación de citas en cada propuesta y en las pruebas |
>
> — `spec.md §6, NFR, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

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

Escribe `contenido_regla` y un evento `propuesta` en la cadena `reglas`.

## API contract

> #### `proponer`
> ```
> proponer --catalogo ARCHIVO.json --normativa TEXTO.md [--normativa ...]
> ```
> - Registra como borrador cada versión del catálogo cuya cita aparezca literal en la normativa. También sirve para cargar los catálogos existentes de `reglas/`.
> - Salida: por regla, `registrada` o el error. Una versión ya registrada con el mismo contenido se informa como `sin_cambios`.
> - Errores por regla: `regla.cita_no_encontrada` (AC-08), `regla.inmutable` (misma regla y versión con otro contenido, AC-12).
>
> — `contracts/cli.md, subcomando `proponer`, verbatim` · full text: [cli.md](../contracts/cli.md)

> | `proponer(catalogo: Sequence[Mapping])` | `list[ResultadoPropuesta]` | US-03 · AC-07, AC-08, AC-12 |
>
> — `contracts/public-api.md §Métodos, verbatim` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-07 — happy

> **Given** un Redactor de reglas con una versión nueva de una regla cuya cita textual aparece literal en la normativa cargada
> **When** la propone para aprobación
> **Then** el sistema la registra como borrador con número de versión nuevo y deja intactas las versiones anteriores
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — error

> **Given** un Redactor de reglas con una versión cuya cita textual no aparece literal en la normativa cargada
> **When** la propone para aprobación
> **Then** el sistema la rechaza y le indica que la cita no se encuentra en el texto fuente
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — domain invariant

> **Given** una versión de regla ya aprobada
> **When** alguien intenta modificar su condición, cita o vigencia
> **Then** el sistema lo impide y le indica que una regla aprobada no se edita, y que un cambio requiere una versión nueva
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Extraer de `verificar_citas.py` una función `cita_en_normativa(cita, textos)` reutilizable
- [ ] `servicio.py`: `proponer(catalogo)` por versión: verifica cita → `regla.cita_no_encontrada`; mismo contenido → `sin_cambios`; otro contenido en misma versión → `regla.inmutable`; si no, guarda contenido + evento `propuesta` con autor
- [ ] Prueba que carga `reglas/reglas_a110_borrador.json` completo (14 registradas)

## Edge cases

| Case | Behaviour |
|---|---|
| Cita con espacios o Markdown distintos | se normaliza como hoy en `verificar_citas.py` |
| Catálogo con una regla mala | las demás se registran; la mala informa su error |

## Definition of Done

- [ ] `tests/test_proponer.py` cubre AC-07, AC-08 y AC-12 y pasa
- [ ] `verificar_citas.py` conserva su CLI
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
