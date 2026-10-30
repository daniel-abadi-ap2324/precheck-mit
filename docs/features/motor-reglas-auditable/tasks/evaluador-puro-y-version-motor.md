---
id: T3
title: "Extraer el evaluador puro de motor.py y fijar VERSION_MOTOR"
layer: "domain"
deps: []
blocks: ["T10"]
acs: ["AC-05"]
files_hint: ["precheck/motor/evaluador.py", "precheck/motor/version.py", "precheck/motor/motor.py"]
owner: "<TBD lead>"
estimate: "S"
context_budget: "S"
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T3 — Extraer el evaluador puro de motor.py y fijar VERSION_MOTOR

## Place in the sequence

- **Blocked by:** — · **Blocks:** T10 — Implementar evaluar expediente con degradación, CEUS, cobertura e instantánea · **Wave:** 1 (empieza cuando terminan sus dependencias).
- **Lane:** carril propio.

## Why (user story)

> **As a** Revisor DOYC
> **I want** evaluar un expediente con las versiones de regla vigentes a su fecha de presentación
> **So that** cada resultado se base en la norma que regía cuando el profesional presentó el trámite
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

Extraer el evaluador puro de motor.py y fijar VERSION_MOTOR: aporta la parte de US-01 que cubren AC-05.

## Inlined context

> **Chosen:** CLI + biblioteca. Da un núcleo que se prueba en proceso y se reutiliza, sin la infraestructura de un servicio que la spec no pide.
>
> — `adr/0001-construir-nucleo-como-biblioteca-con-cli-delgada.md, Decision outcome, verbatim` · full text: [0001-construir-nucleo-como-biblioteca-con-cli-delgada.md](../adr/0001-construir-nucleo-como-biblioteca-con-cli-delgada.md)

> | Versión del motor | `VERSION_MOTOR` semver + commit en cada evaluación. Reproducir solo compara si corre la misma versión registrada; si no, responde «no reproducible con esta versión» y lo registra, sin comparar | `motor/version.py` |
>
> — `sad.md §8, verbatim` · full text: [sad.md](../sad.md)

> | Errores | Excepciones de dominio (`DatoFaltante`, `SinFechaPresentacion`, `AutoAprobacion`, `SinDesignacion`, `ReglaInmutable`, `SinSegundaPersona`) → la CLI las traduce a mensajes en español; los fallos de evaluación nunca son excepción, siempre REQUIERE_REVISION | `motor/evaluador.py`, `cli.py` |
>
> — `sad.md §8, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-05 — error

> **Given** un dato requerido por una regla que falta o tiene confianza bajo el umbral
> **When** el Revisor DOYC evalúa el expediente
> **Then** esa regla resulta REQUIERE_REVISION con el motivo en lenguaje llano y el sistema no rellena el dato faltante
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Mover `obtener_hecho`, el evaluador AST, `en_borde`, `vigente` y `evaluar_regla` a `precheck/motor/evaluador.py`, sin E/S
- [ ] `evaluar_regla` recibe el umbral efectivo = max(umbral global, umbral de la regla) (spec §8, default)
- [ ] `precheck/motor/version.py`: `VERSION_MOTOR = "1.0.0"` y `commit()` (lee git si está, si no `"desconocido"`)
- [ ] `motor.py` queda como envoltorio de compatibilidad que importa de `evaluador.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Regla con umbral menor al global | se usa el global |
| Expresión maliciosa | REQUIERE_REVISION, nunca ejecución |
| Dato faltante | REQUIERE_REVISION con motivo, sin rellenar |

## Definition of Done

- [ ] Las 10 pruebas existentes pasan sin cambios
- [ ] Prueba nueva de umbral efectivo en `tests/test_evaluador.py`
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
