---
id: T7
title: "Derivar la vigencia de las emisiones y los resultados afectados"
layer: "domain"
deps: []
blocks: ["T9"]
acs: ["AC-14", "AC-15", "AC-16", "AC-20"]
files_hint: ["precheck/informe/vigencia.py", "tests/test_informe_vigencia.py"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T7 — Derivar la vigencia de las emisiones y los resultados afectados

## Place in the sequence

- **Blocked by:** — · **Blocks:** T9 — Generar la versión del revisor y emitir la del profesional · **Wave:** 1 (dominio puro; en paralelo con T1, T2 y T4).
- **Lane:** carril propio. No crear `precheck/informe/__init__.py` (lo crea T4); mientras tanto el directorio se importa como paquete de espacio de nombres.

## Why (user story)

> **As a** Revisor DOYC
> **I want** ver los informes emitidos de un expediente y si alguno dejó de reflejar su estado vigente
> **So that** no se sostenga una observación después de una reevaluación, un retiro de regla o una suspensión de norma
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Esta tarea entrega la función pura que dice si cada emisión está vigente, reemplazada, sustituida o afectada (con períodos), y la que detecta resultados afectados en la evaluación vigente para bloquear la emisión.

## Inlined context

> **Chosen:** opción 1. `informe.vigencia` es pura. Recibe los eventos del expediente, los eventos de reglas y los resultados de la evaluación de origen, y devuelve el estado de cada emisión con sus períodos de afectación.
>
> - **Corte temporal:** solo cuentan los retiros y las confirmaciones de suspensión cuyo `ocurrido_en` es posterior al de la evaluación de origen. Una evaluación hecha después de un retiro, o durante una suspensión, ya lleva ese estado en su instantánea (la regla da REQUIERE_REVISION o no oficial), así que no queda afectada y reevaluar desbloquea la emisión (AC-20).
> - **Resultados que cuentan:** todos los de la evaluación de origen menos los NO_APLICA (igual que los usos del núcleo): observaciones, cumplimientos y veredictos humanos.
> - **Retiro:** afecta si toca la regla y la versión de algún resultado que cuenta.
> - **Suspensión:** afecta si es de la norma de algún resultado que cuenta, o de una norma de su linaje (`gobierno.norma_de` y `linaje`), mientras no se levante.
> - **Suspensiones y levantamientos:** se derivan reproduciendo `estado_de_reglas` evento a evento, para no contar confirmaciones que el gobierno ignora (cuatro ojos).
>
> — `adr/0004-derivar-la-vigencia-de-los-informes-emitidos-al-consultar.md, Decision outcome, verbatim` · full text: [ADR-0004](../adr/0004-derivar-la-vigencia-de-los-informes-emitidos-al-consultar.md)

> ```mermaid
> sequenceDiagram
>     loop cada emisión
>         alt hay una evaluación posterior
>             service->>service: «reemplazado por una evaluación posterior»
>         else hay una emisión posterior de la misma evaluación con otra huella
>             service->>service: «sustituida por la emisión del <fecha>»
>         else emisión posterior con la misma huella
>             service->>service: otra entrega del mismo documento, sin marca
>         end
>         opt un retiro o una suspensión posteriores a la evaluación tocan algún resultado (no NO_APLICA)
>             service->>service: «afectado», con la regla o norma, cuándo y el período si la suspensión se levantó
>         end
>     end
>     Note over service,store: Sin escrituras: la vigencia se deriva al consultar (ADR-0004)
> ```
>
> — `sad.md §6, Flujo 8, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Las marcas `afectado_suspension` del núcleo siguen existiendo para sus propios fines. El informe no depende de ellas.
>
> — `adr/0004-derivar-la-vigencia-de-los-informes-emitidos-al-consultar.md, Consequences (Neutral), verbatim` · full text: [ADR-0004](../adr/0004-derivar-la-vigencia-de-los-informes-emitidos-al-consultar.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes.

## API contract

> ```python
> Vigencia       = Literal["vigente", "reemplazado", "sustituida"]
>
> @dataclass(frozen=True)
> class Afectacion:
>     tipo: Literal["retiro", "suspension"]
>     referencia: str                      # "<regla_id> v<version>" o la norma
>     desde: str                           # ISO 8601 UTC
>     hasta: str | None                    # levantamiento, si lo hubo
>
> @dataclass(frozen=True)
> class EstadoEmision:
>     expediente_id: str
>     evaluacion: int
>     seq: int                             # evento informe_emitido
>     huella: str
>     formato_informe: str
>     emitido_por: str                     # persona_id
>     emitido_en: str
>     vigencia: Vigencia
>     sustituida_por: int | None           # seq de la emisión posterior (vigencia "sustituida")
>     reemplazado_por: int | None          # seq de la evaluación posterior (vigencia "reemplazado")
>     afectaciones: tuple[Afectacion, ...] # vacía si no está afectada; con `hasta` si la suspensión se levantó
> ```
>
> — `contracts/public-api.md, Tipos, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

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

### AC-16 — domain invariant

> **Given** la misma evaluación con las mismas decisiones, las mismas indicaciones al profesional y los mismos datos de encabezado (dos escrituras que solo difieren en tildes compuestas o en espacios cuentan como el mismo dato)
> **When** se emite la versión del profesional más de una vez, por la misma o por otra persona
> **Then** todas las emisiones producen el mismo contenido y la misma huella (quién emite y cuándo quedan en el registro de cada emisión, fuera del contenido con huella), y cada emisión queda registrada como una entrega distinta; si después se agrega una indicación, la emisión siguiente tiene otra huella
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — cross-context

> **Given** un expediente revisado cuya evaluación vigente tiene cualquier resultado afectado por el retiro de una versión de regla o por una suspensión de norma vigente (no levantada)
> **When** el Revisor DOYC intenta emitir la versión del profesional
> **Then** el sistema no la emite, explica que la evaluación tiene resultados afectados, dice qué regla o norma cambió, y le indica que reevalúe el expediente
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

De AC-16 esta tarea cubre «cada emisión es una entrega distinta» (misma huella → sin marca); de AC-20, la función de detección que T9 usa para rechazar.

## Checklist

- [ ] `EstadoEmision`, `Afectacion`, `Vigencia` — `precheck/informe/vigencia.py`
- [ ] `estados(eventos_expediente, eventos_reglas, expediente_id)` → `tuple[EstadoEmision, ...]`: reemplazado (evaluación posterior), sustituida (emisión posterior de la misma evaluación con otra huella), misma huella sin marca
- [ ] `afectaciones(evaluacion, eventos_reglas)`: reproduce `estado_de_reglas` evento a evento; solo retiros y suspensiones confirmadas con `ocurrido_en` posterior al de la evaluación; excluye NO_APLICA; norma por `gobierno.norma_de` + `linaje`; `hasta` al levantar
- [ ] `afectados_vigentes(evaluacion, eventos_reglas)`: solo afectaciones sin `hasta` (para AC-20)
- [ ] Pruebas — `tests/test_informe_vigencia.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Retiro anterior a la evaluación de origen | no afecta (la instantánea ya lo refleja) |
| Retiro de una regla cuyo único resultado es NO_APLICA | no afecta |
| Suspensión propuesta sin confirmar (cuatro ojos) | no afecta |
| Suspensión de una norma del linaje de la del resultado | afecta |
| Suspensión levantada | `afectaciones` conserva el período con `hasta`; `afectados_vigentes` vacío |
| Retiro que toca un cumplimiento del resumen | afecta igual que una observación |
| Evaluación posterior y además emisión posterior | «reemplazado» prevalece |

## Definition of Done

- [ ] `tests/test_informe_vigencia.py` cubre AC-14, AC-15, la parte de entregas de AC-16 y la detección de AC-20 y pasa
- [ ] `vigencia.py` no hace E/S ni lee las marcas `afectado_suspension`
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde; `ruff` y `mypy` limpios
