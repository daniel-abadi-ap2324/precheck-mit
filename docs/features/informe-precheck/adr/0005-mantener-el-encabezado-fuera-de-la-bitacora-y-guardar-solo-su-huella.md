---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "informe-precheck"
---

# 0005 — Mantener el encabezado fuera de la bitácora y guardar solo su huella

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** responsable del proyecto (decidido en specify al resolver el crítico) + Tech Lead

## Context

El encabezado del informe tiene cuatro datos: el trámite, el proyecto, la finca y el profesional idóneo con su idoneidad. `motor-reglas-auditable` (spec §6.1) exige que los datos del expediente estén en la bitácora solo por referencia, y la bitácora es inalterable.

## Decision drivers

- No copiar datos personales en una cadena inalterable.
- Mantener la verificabilidad del informe emitido.

## Considered options

1. **El revisor entrega el encabezado al generar o emitir.** La emisión guarda solo `huella_encabezado`.
2. **Guardar el encabezado en la instantánea,** con un ADR que enmiende la funcionalidad anterior.
3. **Encabezado seudonimizado:** la bitácora guarda una referencia opaca al expediente en un registro externo de la DOYC, y el informe resuelve los datos desde allí. Mantiene los datos fuera de la cadena y los regenera, pero depende de un sistema externo que no existe.

## Decision outcome

**Chosen:** opción 1.

- **Contenido:** el encabezado forma parte del modelo, así que la huella del informe lo cubre.
- **Emisión:** `informe_emitido` guarda `huella_encabezado`, no los datos.
- **Normalización:** se recortan espacios y el texto se normaliza a NFC antes de calcular la huella.
- **Regenerar por código:** el encabezado se muestra como «no conservado», junto con su huella.
- **Datos faltantes:** se muestran como «no consta».

## Consequences

**Positive**
- Respeta la funcionalidad anterior, y rectificar un nombre no rompe ninguna cadena: se emite de nuevo y la emisión anterior queda sustituida.

**Negative**
- Regenerar exactamente un informe exige volver a entregar el mismo encabezado.

## Links

- Spec: [[../spec.md]] §6.1, AC-11, AC-16
- SAD: [[../sad.md]] §2, §8
- Relacionado: `motor-reglas-auditable` spec §6.1
