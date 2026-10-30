---
id: T4
title: "Derivar el estado de las reglas y seleccionar la versión aplicable"
layer: "domain"
deps: ["T2"]
blocks: ["T7", "T10"]
acs: ["AC-02", "AC-06", "AC-12"]
files_hint: ["precheck/reglas/gobierno.py", "precheck/motor/seleccion.py"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T4 — Derivar el estado de las reglas y seleccionar la versión aplicable

## Place in the sequence

- **Blocked by:** T2 — Implementar el canónico JSON y la cadena de eventos del dominio · **Blocks:** T7 — Implementar proponer versiones con verificación de cita, T10 — Implementar evaluar expediente con degradación, CEUS, cobertura e instantánea · **Wave:** 2 (empieza cuando terminan sus dependencias).
- **Lane:** carril propio.

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

> **As a** Revisor aprobador
> **I want** aprobar o rechazar una versión de regla redactada por otra persona
> **So that** solo reglas validadas por un segundo par de ojos emitan resultados oficiales
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

Derivar el estado de las reglas y seleccionar la versión aplicable: aporta la parte de US-01, US-02, US-04 que cubren AC-02, AC-06, AC-12.

## Inlined context

> **Chosen:** Estado derivado de la cadena. Las reglas de selección son: rige la versión aprobada más reciente cuya vigencia cubre la fecha de presentación; un borrador solo agrega su indicativo; no se admiten dos aprobadas con vigencias solapadas; una retirada o sin aprobada da REQUIERE_REVISION; una rechazada es un estado final sin indicativo.
>
> — `adr/0005-derivar-estado-de-reglas-de-la-cadena-de-reglas.md, Decision outcome, verbatim` · full text: [0005-derivar-estado-de-reglas-de-la-cadena-de-reglas.md](../adr/0005-derivar-estado-de-reglas-de-la-cadena-de-reglas.md)

> **Chosen:** Evento de suspensión reversible, que no toca la vigencia (AC-12). La variante no reversible obligaría a crear y aprobar de nuevo unas 650 versiones si la CSJ desestima la demanda.
>
> — `adr/0008-suspender-normas-con-un-evento-separado-de-la-vigencia.md, Decision outcome, verbatim` · full text: [0008-suspender-normas-con-un-evento-separado-de-la-vigencia.md](../adr/0008-suspender-normas-con-un-evento-separado-de-la-vigencia.md)

> | Cuatro ojos | Aprobar una versión, suspender o levantar una norma y designar aprobadores exigen dos personas distintas: una propone y otra confirma; solo rige lo confirmado. La primera designación la registra el responsable del proyecto al instalar, como evento génesis | ADR-0006, ADR-0008 |
>
> — `sad.md §8, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes.

## API contract

> | `estado_regla(regla_id, version, en: date \| None = None)` | `EstadoRegla` | ADR-0005 |
>
> — `contracts/public-api.md §Métodos, verbatim` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-02 — domain invariant

> **Given** una regla con una versión cuya vigencia terminó antes de la fecha de presentación y otra versión vigente a esa fecha
> **When** el Revisor DOYC evalúa el expediente
> **Then** el sistema aplica solo la versión vigente a la fecha de presentación y nunca la vigente a la fecha de evaluación
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — domain invariant

> **Given** una regla vigente en estado borrador cuya condición no se cumple con los datos del expediente
> **When** el Revisor DOYC evalúa el expediente
> **Then** el resultado oficial de esa regla es REQUIERE_REVISION con el resultado indicativo NO_CUMPLE visible y marcado como no oficial
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — domain invariant

> **Given** una versión de regla ya aprobada
> **When** alguien intenta modificar su condición, cita o vigencia
> **Then** el sistema lo impide y le indica que una regla aprobada no se edita, y que un cambio requiere una versión nueva
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `gobierno.py` (puro): `estado_de_reglas(eventos_reglas, en: datetime)` → estado por `(regla_id, version)`: borrador, aprobada, rechazada, retirada, suspendida (suspensión solo si confirmada; abarca derivadas)
- [ ] `seleccion.py`: `version_aplicable(versiones, estados, fecha_presentacion)` = aprobada más reciente que cubre la fecha; si no hay, el borrador vigente más reciente (para indicativo); retirada/sin versión → REQUIERE_REVISION
- [ ] Regla de inmutabilidad: mismo `(regla_id, version)` con otro hash de contenido → `regla.inmutable`; dos aprobadas solapadas → `regla.vigencia_solapada`
- [ ] Pruebas en `tests/test_seleccion.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Borrador nuevo sobre una aprobada vigente | rige la aprobada; el borrador solo aporta indicativo |
| Versión rechazada | sin indicativo, no se evalúa |
| Norma suspendida y luego levantada | vuelve a regir la aprobada |
| Suspensión solo propuesta | no rige |

## Definition of Done

- [ ] `tests/test_seleccion.py` cubre AC-02, AC-06 y AC-12 y pasa
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
