---
id: T4
title: "Proyectar el modelo de la versión del revisor con corte temporal"
layer: "domain"
deps: []
blocks: ["T5", "T6", "T8"]
acs: ["AC-01", "AC-02", "AC-22"]
files_hint: ["precheck/informe/__init__.py", "precheck/informe/modelo.py", "tests/test_informe_modelo_revisor.py"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T4 — Proyectar el modelo de la versión del revisor con corte temporal

## Place in the sequence

- **Blocked by:** — · **Blocks:** T5 — Derivar la indicación vigente y su traslado entre evaluaciones, T6 — Proyectar la versión del profesional, T8 — Renderizar el documento autocontenido y extraer su modelo · **Wave:** 1 (dominio puro; en paralelo con T1, T2 y T7).
- **Lane:** comparte `precheck/informe/modelo.py` con T5 y T6 (serializados por dependencias). Crea el paquete `precheck/informe/__init__.py`.

## Why (user story)

> **As a** Revisor DOYC
> **I want** obtener la versión del revisor de cualquier evaluación registrada de un expediente
> **So that** vea en un solo documento todos los resultados, su respaldo, los datos usados y lo que falta decidir
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

Esta tarea entrega la función pura que arma el modelo de la versión del revisor a partir de los eventos, sin render ni E/S.

## Inlined context

> ```
> ├── modelo.py       dominio: Informe, Encabezado, Observacion, Alcance, ResumenCumplimiento;
> │                   proyectar(eventos_expediente, estado_reglas, evaluacion_seq, version, encabezado)
> │                   con corte temporal para regenerar; aviso «no es la evaluación vigente» (AC-22);
> │                   indicaciones vigentes con traslado entre evaluaciones (AC-24); FORMATO_INFORME
> ```
>
> — `sad.md §5, descomposición interna, verbatim` · full text: [sad.md](../sad.md)

> ```mermaid
> sequenceDiagram
>     alt el expediente o la evaluación no existen
>         service-->>client: rechazo: expediente o evaluación no registrados, sin generar nada
>     else la evaluación existe
>         service->>service: proyecta el modelo: todos los resultados con cita, versión, valores y procedencia, indicativos «no oficial», NO_APLICA, cobertura, «sin CEUS», decisiones con motivo, indicaciones y su historial
>         opt el expediente está pendiente de revisión humana
>             service->>service: agrega «pendiente de revisión humana» con lo que falta (decisiones, normas sin reglas, visto bueno, indicaciones)
>         end
>         opt hay una evaluación posterior
>             service->>service: agrega el aviso «no es la evaluación vigente» con la referencia a la vigente
>         end
>     end
>     Note over service,store: Sin escrituras: la versión del revisor no se registra
> ```
>
> — `sad.md §6, Flujo 3, abridged` · full text: [sad.md](../sad.md)

> **Chosen:** opción 1. `informe.modelo.proyectar(eventos_expediente, estado_reglas, evaluacion_seq, version, encabezado)` es pura.
>
> - **Corte temporal:** para regenerar una emisión, el servicio le pasa los eventos del expediente hasta el `seq` de la emisión y `ctx.estado_reglas(en=ocurrido_en)` de la emisión. Así una indicación posterior o un cambio de estado de reglas no altera lo regenerado (AC-12).
>
> — `adr/0001-construir-el-informe-como-proyeccion-pura-de-la-bitacora.md, Decision outcome, abridged` · full text: [ADR-0001](../adr/0001-construir-el-informe-como-proyeccion-pura-de-la-bitacora.md)

> | Versión del formato | `FORMATO_INFORME` (semver) dentro del modelo y en el evento de emisión; un cambio en la proyección que altere el modelo sube la versión; regenerar por código o comparar el texto visible exige la misma versión, si no responde «no verificable con esta versión» (salida 5, como `NO_REPRODUCIBLE`) | ADR-0002 |
>
> — `sad.md §8, fila «Versión del formato», verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** […] el informe nunca presenta el expediente como aprobado
>
> — `spec.md §5, AC-11, abridged` · full text: [spec.md](../spec.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) ·
[cli.md](../contracts/cli.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes. Lee eventos `evaluacion`, `decision`, `visto_bueno` e `indicacion` ya pasados como argumento; no toca el repositorio.

## API contract

> ```python
> @dataclass(frozen=True)
> class Encabezado:                        # entregado por el revisor; nunca se guarda (ADR-0005)
>     tramite: str | None = None           # RLA, RDP, ATC, PDC, …
>     proyecto: str | None = None
>     finca: str | None = None
>     profesional: str | None = None
>     idoneidad: str | None = None         # los ausentes se muestran «no consta»
> ```
>
> `Informe.modelo` es estable y documentado en el propio JSON (`formato_informe`); sus claves de primer nivel: `version`, `formato_informe`, `expediente`, `evaluacion`, `encabezado`, `estado`, `aviso_no_vigente`, `observaciones`, `resultados` (solo revisor), `cumplimientos`, `alcance`, `cobertura`, `normas_consultadas`, `version_motor`, `nota_preliminar`.
>
> — `contracts/public-api.md, Tipos, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-01 — happy

> **Given** un Revisor DOYC y un expediente con una evaluación registrada, con reglas aprobadas y no aprobadas
> **When** el revisor pide la versión del revisor de esa evaluación
> **Then** el sistema le entrega un informe marcado «uso interno» con cada resultado (incluidos NO_APLICA), su cita literal, versión de regla, valores usados con su procedencia y confianza, el indicativo de cada regla no aprobada marcado «no oficial» en texto, la cobertura por norma, las advertencias «sin CEUS», las decisiones humanas con su motivo y la huella de la evaluación
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-02 — happy

> **Given** un expediente pendiente de revisión humana
> **When** el Revisor DOYC pide la versión del revisor
> **Then** el informe declara «pendiente de revisión humana» (el mismo término que usa el estado del expediente) y enumera lo que falta: resultados por decidir, normas sin reglas por decidir, visto bueno e indicaciones al profesional pendientes
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-22 — domain invariant

> **Given** un expediente con una evaluación posterior a la que el revisor indica
> **When** el Revisor DOYC pide la versión del revisor de la evaluación anterior
> **Then** el informe muestra el estado y las decisiones de esa evaluación y un aviso visible de que no es la evaluación vigente, con la referencia a la vigente
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

«Indicaciones al profesional pendientes» de AC-02 usa un punto de extensión que completa T5 (hasta entonces, toda observación sin evento `indicacion` propio cuenta como pendiente).

## Checklist

- [ ] `FORMATO_INFORME = "1.0.0"`, `Encabezado` (frozen) y los tipos del modelo — `precheck/informe/modelo.py`
- [ ] `proyectar(eventos_expediente, estado_reglas, evaluacion_seq, version, encabezado)`: pura; para `version="revisor"` arma `resultados` con todo (incluido NO_APLICA): cita, versión, valores con procedencia y confianza, `oficial`/«no oficial» en texto, advertencias «sin CEUS»; `cobertura`; decisiones con motivo; `hash_evaluacion`
- [ ] `estado`: «pendiente de revisión humana» con la lista de faltantes (decisiones, `norma:X`, visto bueno, indicaciones) o «revisado», con la misma regla que `expediente.servicio.estado`, calculado sobre la evaluación pedida y los eventos recibidos
- [ ] `aviso_no_vigente`: `None` o `{vigente: <seq>}` si en los eventos hay una evaluación posterior
- [ ] Corte temporal: el modelo solo depende de los eventos y del `estado_reglas` recibidos (el servicio los recorta)
- [ ] `precheck/informe/__init__.py`
- [ ] Pruebas con eventos armados en memoria — `tests/test_informe_modelo_revisor.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Evaluación sin ninguna regla aprobada | todos los resultados salen, cada indicativo con «no oficial» en texto |
| Expediente revisado | `estado` = revisado, sin lista de faltantes |
| Evaluación anterior | estado y decisiones de esa evaluación, más `aviso_no_vigente` con la vigente |
| Eventos recortados en un `seq` | una indicación o decisión posterior no aparece |
| `encabezado=None` o campos ausentes | cada campo sale «no consta» |
| Mismos argumentos dos veces | modelos iguales (función pura) |

## Definition of Done

- [ ] `tests/test_informe_modelo_revisor.py` cubre AC-01, AC-02 y AC-22 y pasa
- [ ] `modelo.py` no importa el repositorio ni hace E/S
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde; `ruff` y `mypy` limpios
