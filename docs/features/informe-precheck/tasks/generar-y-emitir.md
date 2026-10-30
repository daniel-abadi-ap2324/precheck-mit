---
id: T9
title: "Generar la versión del revisor y emitir la del profesional"
layer: "app"
deps: ["T1", "T3", "T6", "T7", "T8"]
blocks: ["T10", "T11"]
acs: ["AC-01", "AC-03", "AC-04", "AC-05", "AC-06", "AC-16", "AC-18", "AC-20"]
files_hint: ["precheck/informe/servicio.py", "tests/test_informe_emitir.py"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "L"   # justified: los 8 AC son las ramas de un solo flujo (flujo 1 + flujo 3) sobre la misma función emitir; partirlos deja rechazos sin la emisión que protegen
status: "todo"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T9 — Generar la versión del revisor y emitir la del profesional

## Place in the sequence

- **Blocked by:** T1 — Agregar anexar_lote y cadenas al puerto de bitácora y los códigos informe.*, T3 — Registrar la indicación al profesional y decidir con indicación, T6 — Proyectar la versión del profesional con observaciones, alcance y primera página, T7 — Derivar la vigencia de las emisiones y los resultados afectados, T8 — Renderizar el documento autocontenido y extraer su modelo · **Blocks:** T10 — Verificar informes por archivo y por código y listar emitidos, T11 — Exponer los métodos del informe en la fachada y la CLI · **Wave:** 4 (une dominio e infraestructura).
- **Lane:** comparte `precheck/informe/servicio.py` con T3 y T10; serializado.

## Why (user story)

> **As a** Revisor DOYC
> **I want** obtener la versión del revisor de cualquier evaluación registrada de un expediente
> **So that** vea en un solo documento todos los resultados, su respaldo, los datos usados y lo que falta decidir
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Revisor DOYC
> **I want** emitir la versión del profesional cuando el expediente esté revisado
> **So that** entregue al profesional idóneo un informe que quede registrado y que no pueda contener nada sin respaldo
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

Esta tarea compone lectura de bitácora, proyección, render y registro de la emisión, con todos los rechazos.

## Inlined context

> ```mermaid
> sequenceDiagram
>     CLI->>Srv: emitir(expediente, evaluación, encabezado)
>     Srv->>Exp: estado del expediente y evaluación vigente
>     alt evaluación no vigente
>         Srv-->>CLI: rechazo: solo se emite de la evaluación vigente
>     else expediente pendiente
>         Srv-->>CLI: rechazo: falta revisión humana, con la lista de pendientes
>     end
>     Srv->>Bit: lee cadena del expediente y cadena de reglas
>     Srv->>Mod: proyectar(versión profesional)
>     Mod-->>Srv: modelo u observaciones sin indicación o resultados afectados
>     alt falta alguna indicación o hay resultados afectados
>         Srv-->>CLI: rechazo con la lista de observaciones o de reglas y normas afectadas
>     else todo en orden
>         Srv->>Srv: huella del modelo y huella del encabezado
>         Srv->>Bit: anexa evento de emisión (evaluación, huellas, formato)
>         Bit-->>Srv: evento con quién y cuándo
>         Srv-->>CLI: documento, forma estructurada y huella
>     end
> ```
>
> — `sad.md §6, Critical flow 1, abridged` · full text: [sad.md](../sad.md)

> ```mermaid
> sequenceDiagram
>     alt el expediente o la evaluación no existen
>         service-->>client: rechazo: expediente o evaluación no registrados, sin generar nada
>     else la evaluación existe
>         service->>service: renderiza el documento «uso interno» y la forma estructurada con la huella de la evaluación
>     end
>     Note over service,store: Sin escrituras: la versión del revisor no se registra
> ```
>
> — `sad.md §6, Flujo 3, abridged` · full text: [sad.md](../sad.md)

> | Eventos nuevos | `informe_emitido` {evaluacion_seq, hash_evaluacion, version: "profesional", huella, huella_encabezado, formato_informe, version_motor}. […] en la cadena `expediente:<id>`; el sobre aporta actor y fecha | ADR-0003, ADR-0005 |
>
> — `sad.md §8, fila «Eventos nuevos», abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Datos del expediente solo por referencia en la bitácora (`motor-reglas-auditable` spec §6.1) → ADR-0005.
>
> — `sad.md §2, Regulatory / external, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** Toda operación del informe exige el rol `revisor_doyc` (mismo `_revisor` de `expediente.servicio`)
>
> — `sad.md §8, fila «Identidad y autorización», abridged` · full text: [sad.md](../sad.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) ·
[cli.md](../contracts/cli.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes. Anexa eventos `informe_emitido` en la cadena `expediente:<id>` (tabla `evento` existente); el encabezado nunca se escribe, solo `huella_encabezado`.

## API contract

> | `informe_revisor(expediente_id, evaluacion: int, encabezado: Encabezado \| None = None)` | `Informe` (`version="revisor"`) | US-01 · AC-01, AC-02, AC-03, AC-11, AC-22 · flujo 3 |
> | `emitir(expediente_id, evaluacion: int, encabezado: Encabezado \| None = None)` | `Emision` | US-02, US-03, US-04 · AC-04–06, AC-08–11, AC-16, AC-18–20, AC-23 · flujos 1, 4 |
>
> ```python
> @dataclass(frozen=True)
> class Informe:
>     version: VersionInforme
>     expediente_id: str
>     evaluacion: int
>     huella: str                          # SHA-256 hex del modelo canónico (ADR-0002)
>     formato_informe: str                 # FORMATO_INFORME
>     modelo: Mapping                      # contenido completo; fuente del documento y de la huella
>     documento: str                       # HTML autocontenido con el modelo embebido
>     estructurada: str                    # JSON del modelo (misma huella)
>
> @dataclass(frozen=True)
> class Emision:
>     evento: EventoRegistrado             # informe_emitido: quién y cuándo en el sobre
>     informe: Informe                     # version="profesional"
>     codigo: str                          # huella en bloques de 4 para imprimir
> ```
>
> — `contracts/public-api.md, Métodos nuevos y Tipos, abridged` · full text: [public-api.md](../contracts/public-api.md)

> - Errores de `emitir`: `expediente.evaluacion_inexistente`, `expediente.evaluacion_no_vigente` (AC-06), `informe.expediente_pendiente` (AC-05; `detalles.pendientes`), `informe.sin_indicacion` (AC-18; `detalles.observaciones`), `informe.resultados_afectados` (AC-20; `detalles.afectaciones`).
>
> — `contracts/cli.md, subcomando emitir, abridged` · full text: [cli.md](../contracts/cli.md)

## Acceptance criteria

### AC-01 — happy

> **Given** un Revisor DOYC y un expediente con una evaluación registrada, con reglas aprobadas y no aprobadas
> **When** el revisor pide la versión del revisor de esa evaluación
> **Then** el sistema le entrega un informe marcado «uso interno» con cada resultado (incluidos NO_APLICA), su cita literal, versión de regla, valores usados con su procedencia y confianza, el indicativo de cada regla no aprobada marcado «no oficial» en texto, la cobertura por norma, las advertencias «sin CEUS», las decisiones humanas con su motivo y la huella de la evaluación
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — error

> **Given** un Revisor DOYC
> **When** pide un informe de un expediente o de una evaluación que no existen en la bitácora
> **Then** el sistema no genera nada y le explica que ese expediente o esa evaluación no están registrados
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — happy

> **Given** un expediente revisado cuya evaluación vigente tiene decisiones y visto bueno
> **When** el Revisor DOYC emite la versión del profesional
> **Then** el sistema entrega el informe, registra la emisión en la cadena del expediente con la huella del informe, la evaluación de origen, quién lo emitió y cuándo, y le muestra esa huella
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — domain invariant

> **Given** un expediente pendiente de revisión humana
> **When** el Revisor DOYC intenta emitir la versión del profesional
> **Then** el sistema no la emite, explica que la versión del profesional solo existe con el expediente revisado y enumera lo que falta
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — domain invariant

> **Given** un expediente con una evaluación posterior a la que el revisor indica
> **When** el Revisor DOYC intenta emitir la versión del profesional de la evaluación anterior
> **Then** el sistema no la emite y explica que solo se emite de la evaluación vigente (la última evaluación registrada del expediente; una reproducción no cuenta como evaluación nueva)
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — domain invariant

> **Given** la misma evaluación con las mismas decisiones, las mismas indicaciones al profesional y los mismos datos de encabezado (dos escrituras que solo difieren en tildes compuestas o en espacios cuentan como el mismo dato)
> **When** se emite la versión del profesional más de una vez, por la misma o por otra persona
> **Then** todas las emisiones producen el mismo contenido y la misma huella (quién emite y cuándo quedan en el registro de cada emisión, fuera del contenido con huella), y cada emisión queda registrada como una entrega distinta; si después se agrega una indicación, la emisión siguiente tiene otra huella
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — domain invariant

> **Given** un expediente revisado con alguna observación que no tiene indicación al profesional
> **When** el Revisor DOYC intenta emitir la versión del profesional
> **Then** el sistema no la emite, explica que toda observación necesita su indicación al profesional y enumera las que faltan
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — cross-context

> **Given** un expediente revisado cuya evaluación vigente tiene cualquier resultado afectado por el retiro de una versión de regla o por una suspensión de norma vigente (no levantada)
> **When** el Revisor DOYC intenta emitir la versión del profesional
> **Then** el sistema no la emite, explica que la evaluación tiene resultados afectados, dice qué regla o norma cambió, y le indica que reevalúe el expediente
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `Informe`, `Emision` y un lector común: `_revisor(ctx)` primero (sin leer el expediente), eventos del expediente, `ctx.estado_reglas()`, contenidos de las versiones usadas vía `ctx.repo.contenido` — `precheck/informe/servicio.py`
- [ ] `informe_revisor`: `expediente.evaluacion_inexistente` si falta; `proyectar(version="revisor")` + `render` + `estructurada`; sin escrituras; la huella del modelo en `Informe.huella`
- [ ] `emitir`, en este orden: existe → vigente (`expediente.evaluacion_no_vigente`) → `expediente.servicio.estado` revisado (`informe.expediente_pendiente` con `pendientes`) → `vigencia.afectados_vigentes` vacío (`informe.resultados_afectados` con `afectaciones`) → proyección profesional sin faltantes de indicación (`informe.sin_indicacion` con `observaciones`)
- [ ] Emisión: `huella(modelo)`, `huella_encabezado(enc)`, `ctx.anexar(... "informe_emitido" ...)` con `{evaluacion_seq, hash_evaluacion, version: "profesional", huella, huella_encabezado, formato_informe, version_motor}`; render con la trazabilidad del evento; `Emision.codigo`
- [ ] Pruebas — `tests/test_informe_emitir.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Emitir dos veces igual, por dos revisores | misma huella; dos eventos `informe_emitido` |
| Encabezado con tildes NFD y espacios extra | misma huella que el normalizado |
| Indicación nueva entre dos emisiones | la segunda tiene otra huella |
| Reproducción registrada después de la evaluación | no cuenta como evaluación nueva: sigue vigente |
| Retiro posterior a la evaluación vigente | `informe.resultados_afectados`; tras reevaluar, se emite |
| Pedir la versión del revisor | no anexa ningún evento (la cabeza de la cadena no cambia) |
| Cualquier rechazo | ningún evento anexado |

## Definition of Done

- [ ] `tests/test_informe_emitir.py` cubre AC-01, AC-03, AC-04, AC-05, AC-06, AC-16, AC-18 y AC-20 y pasa
- [ ] El payload de `informe_emitido` no contiene ningún dato del encabezado
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde; `ruff` y `mypy` limpios
