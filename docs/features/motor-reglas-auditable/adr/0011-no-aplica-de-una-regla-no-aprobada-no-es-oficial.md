---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead", "DOYC"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "motor-reglas-auditable"
supersedes: []
amends: ["0005"]
---

# 0011 — El NO_APLICA de una regla no aprobada filtra, pero no es oficial ni cuenta como uso

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Tech Lead + responsable del proyecto (revisión A5, M5 y M9)

## Context

ADR-0005 establece que solo una versión aprobada emite un resultado oficial y que el resto da REQUIERE_REVISION con su indicativo. Aplicarlo al pie de la letra también a NO_APLICA mandaría a revisión, en cada expediente, las cientos de reglas de otras zonas y normas. Las 648 del catálogo están en borrador. Por otro lado, la revisión encontró dos problemas:

- Con confianza baja en un dato de `aplica_si` se producía NO_APLICA (A5).
- Los usos y la cobertura contaban los NO_APLICA, lo que generaba expedientes afectados falsos (M5).

## Decision drivers

- Principio 2: ante la duda, REQUIERE_REVISION.
- No inundar al revisor con reglas que no le tocan.
- La cobertura y los afectados deben reflejar solo lo que se evaluó de verdad.

## Considered options

1. **NO_APLICA se mantiene como filtro no oficial.** Solo si `aplica_si` es falso con datos de confianza suficiente, y no cuenta en usos, cobertura ni afectados.
2. Todo resultado de una regla no aprobada, incluido NO_APLICA, va a REQUIERE_REVISION.
3. Ocultar las reglas no aplicables sin registrarlas.

## Decision outcome

**Chosen:** opción 1.

- **Cuándo se emite.** NO_APLICA solo sale cuando `aplica_si` es falso y todos sus datos superan el umbral de confianza. Con confianza baja, el resultado es REQUIERE_REVISION (`motor/evaluador.py`).
- **Regla no aprobada.** Su NO_APLICA lleva el motivo «regla no aprobada» y no es oficial (`expediente/servicio.py:_oficializar`).
- **Qué no cuenta.** NO_APLICA se excluye de los usos de regla, que marcan a los expedientes afectados, de la cobertura por norma y tema, y del conteo de reglas sin aprobar.
- **Registro.** Se sigue guardando en la instantánea, así que la evaluación se puede reproducir.

## Consequences

**Positive**
- El revisor solo ve las reglas que corresponden a la norma y la zona del lote.
- Retirar o suspender una regla ya no marca expedientes a los que no se aplicó.

**Negative**
- Una condición `aplica_si` mal redactada en una regla en borrador puede excluirla sin intervención humana. Se mitiga porque aprobar una regla exige cuatro ojos y porque el NO_APLICA queda en la instantánea.

## Links

- SAD: [[../sad.md]] §6 flujo 1, §8
- Enmienda: [[0005-derivar-estado-de-reglas-de-la-cadena-de-reglas.md]]
- Revisión: [[../_review/review-2026-09-27.md]] A5, M5, M9
