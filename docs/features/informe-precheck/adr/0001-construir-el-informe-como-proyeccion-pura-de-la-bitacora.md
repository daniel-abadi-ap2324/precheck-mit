---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "informe-precheck"
---

# 0001 — Construir el informe como proyección pura de la bitácora

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Tech Lead + responsable del proyecto (pasada socrática de design)

## Context

El informe presenta una evaluación registrada, en dos versiones (spec §1). La bitácora ya guarda la instantánea completa de cada evaluación (ADR-0004 de `motor-reglas-auditable`) y las decisiones humanas. Hay que decidir si el informe se calcula cada vez o si se guarda el documento emitido.

## Decision drivers

- La misma evaluación, con las mismas decisiones, siempre debe producir la misma huella (spec §6).
- El encabezado con datos personales no puede quedar guardado (ADR-0005).
- No agregar migraciones ni hacer crecer la bitácora con documentos.

## Considered options

1. **Proyección pura:** una función sin efectos arma el modelo a partir de los eventos. Al emitir solo se registra la huella.
2. **Guardar el documento emitido,** o su contenido estructurado, en una tabla nueva.

## Decision outcome

**Chosen:** opción 1. `informe.modelo.proyectar(eventos_expediente, estado_reglas, evaluacion_seq, version, encabezado)` es pura. El servicio lee la bitácora, llama a la proyección y, solo al emitir, anexa `informe_emitido`.

- **Corte temporal:** para regenerar una emisión, el servicio le pasa los eventos del expediente hasta el `seq` de la emisión y `ctx.estado_reglas(en=ocurrido_en)` de la emisión. Así una indicación posterior o un cambio de estado de reglas no altera lo regenerado (AC-12).
- **Vigencia de las normas consultadas:** sale del contenido de cada versión de regla usada, direccionado por su hash (`repo.contenido`) e inmutable; la instantánea no la guarda.

## Consequences

**Positive**
- Se prueba sin disco ni bitácora; regenerar es gratis y determinista.
- No hay migración ni crecimiento de la bitácora por documentos.

**Negative**
- Si cambia la lógica de la proyección, un informe viejo deja de regenerarse igual. Se mitiga guardando `FORMATO_INFORME` en cada emisión y respondiendo «no regenerable con esta versión» (ADR-0002).

**Neutral**
- Sigue el mismo patrón que la reproducción de evaluaciones del núcleo.

## Links

- Spec: [[../spec.md]] §1, §6
- SAD: [[../sad.md]] §4, §5
