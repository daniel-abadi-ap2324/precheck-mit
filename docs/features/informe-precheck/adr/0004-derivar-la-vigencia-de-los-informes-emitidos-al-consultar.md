---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "informe-precheck"
---

# 0004 — Derivar la vigencia de los informes emitidos al consultar

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Tech Lead + responsable del proyecto (pasada socrática de design)

## Context

Un informe emitido puede quedar en uno de tres estados (AC-12, AC-14, AC-15, AC-20):

- **Reemplazado:** hay una evaluación posterior.
- **Sustituido:** hay otra emisión de la misma evaluación con distinta huella.
- **Afectado:** un retiro o una suspensión toca algún resultado. Deja de estarlo si la suspensión se levanta.

El núcleo ya escribe marcas `afectado_suspension`, y la revisión anterior encontró que marcar no era atómico (hallazgo B2).

## Decision drivers

- La vigencia debe ser correcta también después de un levantamiento, y debe mostrar los períodos.
- No agregar escrituras en la funcionalidad anterior que puedan quedar a medias.

## Considered options

1. **Derivar al consultar,** desde la cadena del expediente y la cadena de reglas.
2. **Escribir eventos de marca** en cada expediente cuando cambia algo.

## Decision outcome

**Chosen:** opción 1. `informe.vigencia` es pura. Recibe los eventos del expediente, los eventos de reglas y los resultados de la evaluación de origen, y devuelve el estado de cada emisión con sus períodos de afectación.

- **Corte por instantánea** (enmienda de la revisión 2026-09-27, hallazgo A2): decide el `estado_regla` que guardó la evaluación, no el reloj, que tiene resolución de segundos. Un retiro afecta si la versión no estaba ya `retirada` en la instantánea. Una suspensión afecta los resultados de su norma (o de una derivada) que no estaban ya `suspendida`; las confirmadas en un segundo anterior al de la evaluación ya están en ella. Como una regla en borrador no muestra la suspensión, en el mismo segundo se la toma por anterior si algún resultado tocado ya figura `suspendida`. Una evaluación hecha después de un retiro, o durante una suspensión, ya lleva ese estado (la regla da REQUIERE_REVISION o no oficial), así que no queda afectada y reevaluar desbloquea la emisión (AC-20).
- **Evaluación sin carreras** (enmienda de la re-revisión 1, hallazgo N1): `evaluar` toma la cabeza de la cadena de reglas antes de leer su estado y la exige al anexar dentro de `BEGIN IMMEDIATE` (el mismo `cabezas` que usa `emitir`). Si cualquier evento entró en la cadena de reglas mientras se calculaba —no solo un retiro o una suspensión: también propuestas, aprobaciones, altas o designaciones de personas y sellos, porque todos comparten esa cadena—, no registra la evaluación (`expediente.evaluacion_concurrente`, reintentable; enmienda N7 de la re-revisión 2). Es deliberadamente conservador: se prefiere un reintento de más a registrar una instantánea que no sea la del instante del registro. Así la instantánea es siempre la del estado anterior al registro. Como defensa adicional, una suspensión confirmada en un segundo anterior al de la evaluación también afecta si algún resultado tocado figura `aprobada` en la instantánea y la suspensión seguía abierta al evaluar: una regla aprobada de una norma suspendida se registra `suspendida`, así que esa instantánea no la reflejaba. Si se levantó antes de la evaluación, no afecta.
- **Resultados que cuentan:** todos los de la evaluación de origen menos los NO_APLICA (igual que los usos del núcleo): observaciones, cumplimientos y veredictos humanos.
- **Retiro:** afecta si toca la regla y la versión de algún resultado que cuenta.
- **Suspensión:** afecta si es de la norma de algún resultado que cuenta, o de una norma de su linaje (`gobierno.norma_de` y `linaje`), mientras no se levante.
- **Suspensiones y levantamientos:** se derivan recorriendo la cadena de reglas una sola vez (`gobierno.recorrer`, la misma aplicación evento a evento que `estado_de_reglas`), para no contar confirmaciones que el gobierno ignora (cuatro ojos).
- **Por emisión:** la lista de emitidos omite los períodos cerrados antes de la emisión; un período levantado después se muestra como «estuvo afectada (levantada …)».

## Consequences

**Positive**
- Sin escrituras nuevas ni marcas que se desincronicen. El levantamiento se resuelve solo.
- La misma función bloquea la emisión cuando la evaluación vigente tiene resultados afectados después de registrarse (AC-20); como la reevaluación lleva el estado nuevo, reevaluar siempre desbloquea.

**Negative**
- Cada consulta recorre la cadena de reglas una vez por evaluación de origen. Es aceptable a la escala de SQLite (sad §7).

**Neutral**
- Las marcas `afectado_suspension` del núcleo siguen existiendo para sus propios fines. El informe no depende de ellas.

## Links

- Spec: [[../spec.md]] AC-12, AC-14, AC-15, AC-20
- SAD: [[../sad.md]] §8
- Relacionado: ADR-0008 de `motor-reglas-auditable` (suspensión)
