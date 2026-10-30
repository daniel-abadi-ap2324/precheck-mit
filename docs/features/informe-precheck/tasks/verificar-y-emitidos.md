---
id: T10
title: "Verificar informes por archivo y por código y listar emitidos"
layer: "app"
deps: ["T9"]
blocks: ["T11"]
acs: ["AC-12", "AC-13", "AC-14", "AC-15"]
files_hint: ["precheck/informe/servicio.py", "tests/test_informe_verificar.py"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T10 — Verificar informes por archivo y por código y listar emitidos

## Place in the sequence

- **Blocked by:** T9 — Generar la versión del revisor y emitir la del profesional · **Blocks:** T11 — Exponer los métodos del informe en la fachada y la CLI · **Wave:** 5 (necesita emisiones registradas).
- **Lane:** comparte `precheck/informe/servicio.py` con T3 y T9; serializado.

## Why (user story)

> **As a** Revisor DOYC
> **I want** comprobar si un archivo de informe que me presentan coincide con uno emitido
> **So that** pueda detectar un informe alterado o que el sistema nunca emitió
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As a** Revisor DOYC
> **I want** ver los informes emitidos de un expediente y si alguno dejó de reflejar su estado vigente
> **So that** no se sostenga una observación después de una reevaluación, un retiro de regla o una suspensión de norma
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Esta tarea entrega `verificar_informe`, `verificar_codigo` y `emitidos` sobre las emisiones que registra T9.

## Inlined context

> ```mermaid
> sequenceDiagram
>     CLI->>Srv: verificar_archivo(contenido)
>     Srv->>Html: extraer modelo embebido
>     alt no es un documento ni una forma estructurada del sistema
>         Srv-->>CLI: no verificable por archivo: usar el código impreso
>     end
>     Srv->>Srv: recalcula la huella y vuelve a renderizar el modelo
>     alt el modelo es de otro formato de informe
>         Srv->>Bit: busca emisiones con esa huella
>         Srv-->>CLI: no verificable con esta versión: la huella existe o no, pero el texto visible no se compara
>     else el texto visible no coincide con el modelo
>         Srv-->>CLI: no coincide: contenido alterado
>     end
>     Srv->>Bit: busca emisiones con esa huella en todas las cadenas de expediente
>     alt ninguna emisión
>         Srv-->>CLI: no coincide con ninguna emisión registrada
>     else una o más emisiones
>         Srv->>Vig: estado de cada emisión (reemplazado, sustituida, afectado)
>         Srv->>Srv: compara el bloque de trazabilidad con cada emisión
>         Srv-->>CLI: emisiones con expediente, evaluación, quién, cuándo y vigencia
>     end
> ```
>
> — `sad.md §6, Critical flow 2, abridged` · full text: [sad.md](../sad.md)

> ```mermaid
> sequenceDiagram
>     alt el código tiene menos de 16 caracteres
>         service-->>client: rechazo: código demasiado corto
>     else código válido
>         service->>store: busca emisiones del expediente cuya huella empiece con el código
>         alt ninguna emisión
>             service-->>client: no coincide con ninguna emisión registrada
>         else una o más emisiones
>             service->>service: vigencia de cada emisión (flujo 8)
>             alt el formato de la emisión no es el de esta versión
>                 service-->>client: la emisión existe, pero su contenido no es regenerable con esta versión
>             else mismo formato
>                 service->>store: lee los eventos hasta la emisión y el estado de reglas a esa fecha
>                 service->>service: regenera el contenido emitido con «encabezado no conservado»
>                 service-->>client: emisiones con quién, cuándo y vigencia, contenido regenerado y aviso: el código prueba que la emisión existe, no que la copia esté íntegra
>             end
>         end
>     end
> ```
>
> — `sad.md §6, Flujo 7, abridged` · full text: [sad.md](../sad.md)

> | Corte temporal | Regenerar una emisión usa los eventos del expediente hasta su `seq` y `estado_reglas(en=ocurrido_en)` de la emisión | ADR-0001 |
>
> — `sad.md §8, fila «Corte temporal», verbatim` · full text: [sad.md](../sad.md)

> - **Regenerar por código:** el encabezado se muestra como «no conservado», junto con su huella.
>
> — `adr/0005-mantener-el-encabezado-fuera-de-la-bitacora-y-guardar-solo-su-huella.md, Decision outcome, verbatim` · full text: [ADR-0005](../adr/0005-mantener-el-encabezado-fuera-de-la-bitacora-y-guardar-solo-su-huella.md)

> Disparador interno, no NFR: si una verificación supera 1 s en la suite, se agrega un índice por huella (tabla derivada, reconstruible) sin cambiar la bitácora.
>
> — `sad.md §7, Scaling thresholds, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) ·
[cli.md](../contracts/cli.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes. Solo lectura: recorre `repo.cadenas()` y los eventos `informe_emitido`.

## API contract

> | `verificar_informe(contenido: str \| bytes)` | `VerificacionInforme` | US-05 · AC-12, AC-13 · flujo 2 |
> | `verificar_codigo(expediente_id, codigo: str)` | `VerificacionInforme` | US-05 · AC-12 · flujo 7 |
> | `emitidos(expediente_id)` | `tuple[EstadoEmision, ...]` | US-06 · AC-14, AC-15, AC-16 · flujo 8 |
>
> ```python
> @dataclass(frozen=True)
> class VerificacionInforme:
>     resultado: Literal["coincide", "no_coincide", "no_verificable_version"]
>     emisiones: tuple[EstadoEmision, ...] # las que coinciden (vacía si no_coincide)
>     trazabilidad_coincide: bool | None   # solo por archivo: bloque de trazabilidad vs evento
>     regenerado: Informe | None           # solo por código y mismo formato; encabezado «no conservado»
>     aviso: str | None                    # p. ej. «el código prueba que la emisión existe, no que la copia esté íntegra»
> ```
>
> `verificar_informe` y `verificar_codigo` no lanzan por «no coincide»: lo informan en `VerificacionInforme.resultado`.
>
> — `contracts/public-api.md, Métodos nuevos, Tipos y Errores nuevos, abridged` · full text: [public-api.md](../contracts/public-api.md)

> - Errores: `informe.codigo_corto`, `informe.archivo_no_verificable` (no es un original del sistema: usar `--codigo`).
>
> — `contracts/cli.md, subcomando verificar-informe, abridged` · full text: [cli.md](../contracts/cli.md)

## Acceptance criteria

### AC-12 — happy

> **Given** una versión del profesional emitida por el sistema, como archivo original (documento o forma estructurada) sin cambios de contenido, o como copia impresa o convertida con su código de huella (la huella completa, impresa en bloques junto al expediente)
> **When** el Revisor DOYC la verifica con el archivo, o con el expediente y el código impreso (completo o con al menos sus primeros 16 caracteres)
> **Then** el sistema busca entre todas las emisiones registradas, confirma que coincide con una o más, lista para cada una el expediente al que pertenece, la evaluación de origen, quién la emitió y cuándo, y dice si sigue vigente, si fue afectada por un retiro o una suspensión, si fue reemplazada por una evaluación posterior o si fue sustituida por una emisión posterior de la misma evaluación, e indica cuál es la emisión vigente; con el archivo, además compara el bloque de trazabilidad (quién emitió y cuándo, que queda fuera de la huella) con el registro de la emisión y avisa si no coincide; con el código impreso, el sistema además regenera el contenido emitido (sin los datos de encabezado, que no guarda) para que el revisor lo compare con la copia, y aclara que el código prueba que la emisión existe, no que la copia esté íntegra
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — error

> **Given** un archivo de informe con su contenido alterado en cualquier parte, una versión del revisor o un informe que el sistema nunca emitió
> **When** el Revisor DOYC lo verifica con el archivo
> **Then** el sistema informa que no coincide con ninguna emisión registrada y no lo presenta como válido; si el archivo no es un documento original ni una forma estructurada del sistema (por ejemplo, una conversión), explica que debe verificarse con el código impreso
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — cross-context

> **Given** un informe emitido y, después, un retiro de una versión de regla o una suspensión de una norma que toca cualquier resultado de su evaluación de origen (observaciones, cumplimientos del resumen o veredictos humanos sobre reglas de esa norma)
> **When** el Revisor DOYC consulta los informes emitidos del expediente
> **Then** el sistema marca ese informe como afectado, dice qué regla o norma cambió y cuándo, y no altera el informe ya emitido; si la suspensión se levanta, el informe deja de estar afectado y el sistema sigue mostrando el período en que lo estuvo
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — cross-context

> **Given** un informe emitido y, después, una evaluación nueva del mismo expediente
> **When** el Revisor DOYC consulta los informes emitidos
> **Then** el sistema marca ese informe como reemplazado por una evaluación posterior; si en cambio hay una emisión posterior de la misma evaluación con otra huella (por una indicación nueva o un encabezado corregido), marca la anterior como sustituida por esa emisión; una emisión posterior con la misma huella no marca nada, porque es otra entrega del mismo documento
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `emitidos(expediente_id)`: `_revisor`, eventos del expediente + eventos de reglas → `vigencia.estados` — `precheck/informe/servicio.py`
- [ ] `verificar_informe(contenido)`: `html.extraer` (`None` → `informe.archivo_no_verificable`); otro `formato_informe` → buscar la huella y devolver `no_verificable_version`; re-render y comparar `texto_visible`; buscar la huella en todas las `repo.cadenas()` de expediente; `trazabilidad_coincide` por emisión; indicar cuál es la emisión vigente
- [ ] `verificar_codigo(expediente_id, codigo)`: `informe.codigo_corto`; prefijo dentro del expediente; otro formato → `no_verificable_version`; mismo formato → regenerar con eventos hasta el `seq` de la emisión y `ctx.estado_reglas(en=ocurrido_en)`, encabezado «no conservado» + su huella; `aviso`
- [ ] La versión del revisor (sin evento de emisión) da `no_coincide`
- [ ] Pruebas, incluida la del disparador de 1 s — `tests/test_informe_verificar.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Documento con un carácter visible cambiado y el JSON intacto | `no_coincide` (re-render distinto) |
| JSON embebido cambiado | `no_coincide` (huella sin emisión) |
| Forma estructurada del mismo documento | `coincide` con la misma emisión |
| Bloque de trazabilidad editado | `coincide` con `trazabilidad_coincide=False` (salida 3 en la CLI) |
| Misma huella emitida dos veces | ambas emisiones en la lista |
| Indicación agregada después de la emisión | lo regenerado por código no la incluye (corte temporal) |
| Código válido de otro expediente | `no_coincide` (la búsqueda por código es dentro del expediente) |

## Definition of Done

- [ ] `tests/test_informe_verificar.py` cubre AC-12 (archivo y código), AC-13, AC-14 y AC-15 vistos desde el servicio y pasa
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde; `ruff` y `mypy` limpios
