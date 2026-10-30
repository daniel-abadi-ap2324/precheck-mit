---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "informe-precheck"
---

# 0003 — Registrar la indicación al profesional como evento propio

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Tech Lead + responsable del proyecto (pasada socrática de design)

## Context

El motivo de una decisión es texto de auditoría y nunca sale del sistema. El «qué hacer» de cada observación es la indicación al profesional (spec US-07). La indicación puede escribirse al decidir o después. También aplica a los NO_CUMPLE no bloqueantes, que no tienen decisión individual, y a las normas sin reglas (AC-17, AC-23).

## Decision drivers

- No reescribir decisiones: la cadena es de solo anexar.
- Un único mecanismo para todos los tipos de observación.
- Poder trasladar la indicación al reevaluar (AC-24).

## Considered options

1. **Evento `indicacion` propio en todos los casos.** `decidir --indicacion` anexa la decisión y la indicación en una sola transacción, y `indicar` agrega o complementa una indicación después.
2. **Campo en la decisión,** más un evento solo para los complementos y los no bloqueantes.

## Decision outcome

**Chosen:** opción 1.

- **Evento:** `indicacion` {evaluacion_seq, hash_evaluacion, regla_id o `norma:X`, texto}, en la cadena del expediente.
- **Qué rige:** la última indicación por observación. El traslado entre evaluaciones se deriva en la proyección, sin eventos nuevos.
- **Repositorio:** gana `anexar_lote` para escribir varios eventos en una sola transacción.
- **Contrato de `decidir`:** pasa a la versión 0.2.0 con la opción `--indicacion`.
- **Qué se puede indicar:** solo observaciones de la evaluación vigente. Se rechazan los resultados favorables, los NO_CUMPLE descartados, los NO_APLICA y los resultados de una evaluación no vigente (AC-21).

## Consequences

**Positive**
- La proyección lee un solo tipo de evento y el historial queda completo.
- El motivo de auditoría nunca se mezcla con el texto que ve el profesional.

**Negative**
- Enmienda la funcionalidad anterior: `decidir`, el puerto del repositorio, el contexto, los errores y los dos contratos (ver Links).

**Neutral**
- Cualquier Revisor DOYC puede indicar. Queda atribuido en el sobre del evento.

## Links

- Spec: [[../spec.md]] US-07, AC-17, AC-18, AC-21, AC-23, AC-24
- SAD: [[../sad.md]] §8
- Enmienda a `motor-reglas-auditable`: `contracts/cli.md` (`decidir --indicacion`, subcomando `indicar`), `contracts/public-api.md` (firma y retorno de `decidir`, método `indicar`, puerto `RepositorioBitacora` con `anexar_lote` y `cadenas`), `precheck/auditoria/puertos.py`, `precheck/contexto.py` (`anexar_lote` con actor y reloj) y `precheck/errores.py` (códigos `informe.*`)
