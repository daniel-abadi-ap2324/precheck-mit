---
id: T10
title: "Implementar evaluar expediente con degradación, CEUS, cobertura e instantánea"
layer: "app"
deps: ["T3", "T4", "T6", "T9"]
blocks: ["T11", "T12", "T13"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-21"]
files_hint: ["precheck/expediente/servicio.py"]
owner: "<TBD lead>"
estimate: "L"
context_budget: "L"   # justified: es el caso de uso central; siete AC comparten un único recorrido y separarlos duplicaría la instantánea
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T10 — Implementar evaluar expediente con degradación, CEUS, cobertura e instantánea

## Place in the sequence

- **Blocked by:** T3 — Extraer el evaluador puro de motor.py y fijar VERSION_MOTOR, T4 — Derivar el estado de las reglas y seleccionar la versión aplicable, T6 — Implementar RepositorioSQLite detrás del puerto de bitácora, T9 — Implementar inicializar, vincular cuenta, designar y confirmar propuestas · **Blocks:** T11 — Implementar decidir, visto bueno y estado del expediente, T12 — Implementar reproducir una evaluación registrada, T13 — Implementar suspender y levantar normas con cuatro ojos · **Wave:** 4 (empieza cuando terminan sus dependencias).
- **Lane:** comparte `files_hint` con T11, T12; serializado.

## Why (user story)

> **As a** Revisor DOYC
> **I want** evaluar un expediente con las versiones de regla vigentes a su fecha de presentación
> **So that** cada resultado se base en la norma que regía cuando el profesional presentó el trámite
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Revisor DOYC
> **I want** ver lo que concluiría cada regla no aprobada, marcado como indicativo
> **So that** tenga una pista útil sin que una regla sin validar decida el expediente
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As a** Revisor DOYC
> **I want** ver qué normas y temas se evaluaron, cuáles no tienen reglas y cuántas reglas estaban sin aprobar
> **So that** no confunda la ausencia de NO_CUMPLE con un expediente limpio
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

Implementar evaluar expediente con degradación, CEUS, cobertura e instantánea: aporta la parte de US-01, US-02, US-10 que cubren AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-21.

## Inlined context

> **Critical flow 1: evaluar un expediente (AC-01, AC-02, AC-05, AC-06, AC-21)**
>
> ```mermaid
> sequenceDiagram
>     actor Revisor as Revisor DOYC
>     participant CLI as CLI precheck
>     participant Exp as expediente.servicio
>     participant Gob as reglas.gobierno
>     participant Mot as motor.evaluador
>     participant Bit as Bitácora
>     Revisor->>CLI: evalúa expediente con hechos y fecha de presentación
>     CLI->>Exp: evaluar(expediente, hechos, persona)
>     alt falta fecha de presentación
>         Exp-->>CLI: rechazo: sin fecha no hay norma aplicable
>     end
>     Exp->>Gob: versión aplicable por fecha de presentación y su estado a la fecha de evaluación
>     Gob->>Bit: lee cadena de reglas
>     Gob-->>Exp: versión por regla (elegida por fecha de presentación) con su estado actual (aprobada, borrador, retirada, suspendida)
>     loop cada regla aplicable
>         Exp->>Mot: evaluar_regla(versión, hechos, umbral)
>         Mot-->>Exp: resultado bruto y motivo
>         Exp->>Exp: si no está aprobada → REQUIERE_REVISION con indicativo
>     end
>     Exp->>Exp: cobertura (normas evaluadas, sin reglas, reglas sin aprobar)
>     Exp->>Bit: anexa evento de evaluación con instantánea completa
>     Bit-->>Exp: hash del evento
>     Exp-->>CLI: resultados, cobertura, estado «pendiente de revisión»
>     CLI-->>Revisor: informe preliminar
> ```
>
> — `sad.md §6, Critical flow 1, verbatim` · full text: [sad.md](../sad.md)

> ```mermaid
> sequenceDiagram
>     actor Revisor as Revisor DOYC
>     participant client as <client>
>     participant service as <service>
>     participant store as <data-store>
>     Note over Revisor,store: precondición: expediente con zona del Documento Gráfico y fecha de presentación
>     Revisor->>client: evalúa el expediente
>     client->>service: evaluar expediente
>     service->>store: lee la CEUS registrada del lote
>     alt hay CEUS y su código difiere del Documento Gráfico
>         service->>service: determina la norma aplicable con la CEUS
>         service->>service: marca la discrepancia y conserva ambos códigos con su fuente
>     else hay CEUS y coincide
>         service->>service: determina la norma aplicable con la CEUS
>     else no hay CEUS
>         service->>service: usa la zona del GIS y marca cada resultado que depende de la zona con «sin CEUS»
>     end
>     Note over service,store: persiste evento de evaluación con ambos códigos, su fuente y la discrepancia
>     service-->>client: resultados con la discrepancia visible
>     client-->>Revisor: informe preliminar
> ```
>
> — `sad.md §6, Flujo 3, verbatim` · full text: [sad.md](../sad.md)

> **Chosen:** Instantánea completa. Reproducir no depende de que el catálogo sobreviva ni de su estado actual; «qué cambiaría hoy» es un informe aparte.
>
> — `adr/0004-guardar-instantanea-completa-en-cada-evaluacion.md, Decision outcome, verbatim` · full text: [0004-guardar-instantanea-completa-en-cada-evaluacion.md](../adr/0004-guardar-instantanea-completa-en-cada-evaluacion.md)

> | Tiempo de evaluación | ≤ 10 s por expediente con el catálogo completo (~650 reglas) | medición en las pruebas con los casos de `tests/casos/` |
>
> — `spec.md §6, NFR, verbatim` · full text: [spec.md](../spec.md)

> - Ningún resultado oficial sale de una regla no aprobada, y ningún expediente queda como revisado sin que un revisor DOYC haya firmado cada resultado bloqueante y dado su visto bueno al resto; el expediente nunca se presenta como aprobado, porque el dictamen es de la DOYC.
>
> — `spec.md §2, Goals, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

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

Anexa un evento `evaluacion` (instantánea con `hash_contenido` por regla) y sus filas `uso_regla` en la misma transacción.

## API contract

> #### `evaluar`
> ```
> evaluar --expediente ID --hechos ARCHIVO.json [--umbral-confianza 0.85]
> ```
> - `--hechos`: hechos con el formato del esquema de reglas (`{valor, confianza, fuente}`). Hechos requeridos: `expediente.fecha_presentacion`. Hechos opcionales con tratamiento especial: `lote.ceus` y `lote.codigo_zona_dg`.
> - `--umbral-confianza`: umbral global; una regla puede subirlo pero nunca bajarlo (spec §8, default).
> - Salida: `Evaluacion` con resultado oficial, indicativo, cita, versión, valores y fuente por regla; `Cobertura`; estado `pendiente`; `hash` del evento.
> - Errores: `expediente.sin_fecha_presentacion` (AC-03), `identidad.sin_rol`, `identidad.cuenta_no_vinculada`.
>
> — `contracts/cli.md, subcomando `evaluar`, verbatim` · full text: [cli.md](../contracts/cli.md)

> | `evaluar(expediente_id, hechos: Mapping, umbral: float = 0.85)` | `Evaluacion` | US-01, US-02, US-10 · AC-01–06, AC-21 |
>
> — `contracts/public-api.md §Métodos, verbatim` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-01 — happy

> **Given** un expediente con datos declarados completos, fecha de presentación registrada y zona obtenida del GIS, y reglas aprobadas vigentes a esa fecha
> **When** el Revisor DOYC evalúa el expediente
> **Then** el sistema muestra por cada regla su resultado oficial, la cita textual, la versión aplicada y los valores usados con su fuente, y registra la evaluación en la bitácora atribuida a ese revisor
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-02 — domain invariant

> **Given** una regla con una versión cuya vigencia terminó antes de la fecha de presentación y otra versión vigente a esa fecha
> **When** el Revisor DOYC evalúa el expediente
> **Then** el sistema aplica solo la versión vigente a la fecha de presentación y nunca la vigente a la fecha de evaluación
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — error

> **Given** un expediente sin fecha de presentación registrada
> **When** el Revisor DOYC intenta evaluarlo
> **Then** el sistema no evalúa y le indica que falta la fecha de presentación, porque sin ella no puede determinar la norma aplicable
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — cross-context

> **Given** un expediente cuyo código de zona leído del Documento Gráfico difiere del que indica la CEUS registrada del lote
> **When** el Revisor DOYC evalúa el expediente
> **Then** el sistema determina la norma aplicable con la CEUS, muestra la discrepancia y registra ambos valores con su fuente
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — error

> **Given** un dato requerido por una regla que falta o tiene confianza bajo el umbral
> **When** el Revisor DOYC evalúa el expediente
> **Then** esa regla resulta REQUIERE_REVISION con el motivo en lenguaje llano y el sistema no rellena el dato faltante
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — domain invariant

> **Given** una regla vigente en estado borrador cuya condición no se cumple con los datos del expediente
> **When** el Revisor DOYC evalúa el expediente
> **Then** el resultado oficial de esa regla es REQUIERE_REVISION con el resultado indicativo NO_CUMPLE visible y marcado como no oficial
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-21 — happy

> **Given** un expediente en una zona exceptuada del MIVIOT, sin reglas cargadas, más reglas aprobadas y en borrador de otras normas
> **When** el Revisor DOYC evalúa el expediente
> **Then** el sistema declara qué normas y temas se evaluaron, que la norma MIVIOT no tiene reglas (lo que va a revisión) y cuántas reglas estaban sin aprobar, y nunca muestra un veredicto global de «cumple»
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Rol `revisor_doyc` (`identidad.sin_rol`); sin `expediente.fecha_presentacion` → `expediente.sin_fecha_presentacion`
- [ ] Zona: CEUS si existe (discrepancia con `lote.codigo_zona_dg` como advertencia); sin CEUS → GIS con advertencia «sin CEUS»
- [ ] Por regla: versión por fecha de presentación, estado a la fecha de evaluación (T4); no aprobada → REQUIERE_REVISION + indicativo
- [ ] Cobertura: normas evaluadas, sin reglas (MIVIOT), reglas sin aprobar; nunca veredicto global
- [ ] Anexar evento con instantánea + usos; devolver `Evaluacion`
- [ ] Pruebas en `tests/test_evaluar.py` con `tests/casos/*.json`

## Edge cases

| Case | Behaviour |
|---|---|
| Catálogo entero en borrador | todo REQUIERE_REVISION con indicativo; cobertura lo dice |
| Zona MIVIOT exceptuada | norma sin reglas declarada en cobertura |
| Hecho con confianza bajo umbral | REQUIERE_REVISION con motivo |

## Definition of Done

- [ ] `tests/test_evaluar.py` cubre AC-01 a AC-06 y AC-21 y pasa
- [ ] Evaluar `plot_1zm6_excede.json` con el catálogo completo tarda ≤ 10 s
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
