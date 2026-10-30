---
status: Draft
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-27"
feature_size: "M"
---

# Spec — motor-reglas-auditable

> **Glossary:** [CONTEXT](../../../CONTEXT.md) (nivel raíz; esta funcionalidad no tiene términos propios)
> **Reference module / docs / channels used:** `docs/idea-brief.md`, `docs/architecture-map.md`, `docs/contexto/esquema-reglas.md`, `docs/contexto/atc.md`, skill `mupa-auditoria-revision`, `precheck/motor/motor.py`, `precheck/auditoria/verificar_cadena.py`.

**Idea (línea base literal):** «Que cada evaluación del PreCheck quede registrada en una bitácora inalterable con la regla, la versión, la cita y los datos que la produjeron; que solo las reglas aprobadas emitan CUMPLE o NO_CUMPLE, y que un revisor pueda reproducir y confirmar cada resultado.»

## 1. Context

El revisor DOYC necesita que el PreCheck le entregue conclusiones que pueda defender ante una impugnación: cada observación debe llevar el artículo que la respalda, los datos de los que salió y la versión exacta de la regla aplicada. El motor actual evalúa y firma cada resultado por separado, pero no guarda una bitácora encadenada, no registra quién confirmó qué y descarta en silencio las 648 reglas en borrador (ninguna está aprobada), así que en modo normal no concluye nada y en modo prueba concluye con reglas sin validar.

El Acuerdo 110 (abril de 2025) y la A270-2025 en San Francisco cambiaron los requisitos que los revisores aplican hoy a mano, con los plazos cortos de la ATC. Además, la demanda de nulidad contra el PLOT obliga a poder identificar y suspender reglas por vigencia sin perder la historia de lo ya evaluado.

**Enfoque comprometido:** un motor que evalúa cada expediente con la versión de regla vigente a su fecha de presentación. Solo las reglas aprobadas con cuatro ojos emiten resultado oficial; las demás dan REQUIERE_REVISION con su resultado indicativo. Cada evaluación, aprobación y confirmación humana queda en una bitácora encadenada, atribuida a una persona y reproducible, y la cobertura se declara siempre. La investigación de mercado no encontró ningún producto (Archistar AI PreCheck, CORENET X, Solibri, UpCodes) que reúna cita legal por regla, degradación de borradores, confirmación humana encadenada y aprobación de cuatro ojos. El análisis de fallas señaló el CUMPLE sin firma humana como el riesgo más grave. El criterio de éxito de la entrevista es cero falsos CUMPLE con trazabilidad completa.

- Fuentes de trazabilidad: principios 1 a 5 de `CLAUDE.md`; flujo de revisión y separación de funciones de la skill `mupa-auditoria-revision`; esquema de regla y hecho de `docs/contexto/esquema-reglas.md`.

## 2. Goals

- Ningún resultado oficial sale de una regla no aprobada, y ningún expediente queda como revisado sin que un revisor DOYC haya firmado cada resultado bloqueante y dado su visto bueno al resto; el expediente nunca se presenta como aprobado, porque el dictamen es de la DOYC.
- Todo resultado registrado se puede reproducir con la misma versión de regla, los mismos datos y la misma fecha de presentación, y cualquier alteración de la bitácora es detectable.
- Las reglas pasan de borrador a aprobadas con control de cuatro ojos, y la suspensión de una norma completa o el retiro de una versión identifica los resultados afectados sin reescribirlos.

## 3. Non-goals

- **Cola de revisión con pantalla, asignación y estados**: es otra funcionalidad; aquí solo se registran las decisiones humanas.
- **Portal del profesional o ciudadano**: queda fuera de la v1 según el brief; un falso CUMPLE ante el público es el error más caro.
- **Extracción automática de datos desde CAD, BIM o PDF**: la v1 evalúa sobre datos declarados y la zona del GIS; la extracción es verificación cruzada posterior.
- **Informe final para el profesional**: lo produce la funcionalidad de informe a partir de lo que esta registra.

## 4. User stories

### US-01: Evaluar expediente con norma vigente

**As a** Revisor DOYC
**I want** evaluar un expediente con las versiones de regla vigentes a su fecha de presentación
**So that** cada resultado se base en la norma que regía cuando el profesional presentó el trámite

### US-02: Ver indicativo de reglas no aprobadas

**As a** Revisor DOYC
**I want** ver lo que concluiría cada regla no aprobada, marcado como indicativo
**So that** tenga una pista útil sin que una regla sin validar decida el expediente

### US-03: Proponer una versión de regla

**As a** Redactor de reglas
**I want** proponer una versión nueva de una regla con su fuente, cita literal y vigencia
**So that** entre al circuito de aprobación sin alterar las versiones ya aprobadas

### US-04: Aprobar una versión de regla

**As a** Revisor aprobador
**I want** aprobar o rechazar una versión de regla redactada por otra persona
**So that** solo reglas validadas por un segundo par de ojos emitan resultados oficiales

### US-05: Confirmar o descartar resultados

**As a** Revisor DOYC
**I want** confirmar o descartar con un motivo cada NO_CUMPLE bloqueante y cada REQUIERE_REVISION
**So that** ninguna conclusión desfavorable quede sin decisión humana registrada

### US-06: Dar visto bueno al resto

**As a** Revisor DOYC
**I want** dar un visto bueno único a los CUMPLE y a los NO_CUMPLE de observación de un expediente, viendo de qué datos declarados depende cada uno
**So that** ningún resultado oficial del expediente quede sin firma humana

### US-07: Reproducir una evaluación

**As a** Revisor DOYC
**I want** volver a ejecutar una evaluación registrada y saber si coincide con la original
**So that** pueda defender o corregir una observación impugnada meses después

### US-08: Verificar la integridad de la bitácora

**As a** Revisor DOYC
**I want** comprobar que la bitácora de un expediente no fue alterada
**So that** el registro tenga valor probatorio

### US-09: Suspender una norma o retirar una versión

**As a** Revisor aprobador
**I want** suspender en bloque todas las versiones de una norma, o retirar una versión de regla aprobada, y ver qué resultados registrados dependen de ellas
**So that** una nulidad o un cambio de norma se gestione sin reescribir la historia

### US-10: Conocer la cobertura de la evaluación

**As a** Revisor DOYC
**I want** ver qué normas y temas se evaluaron, cuáles no tienen reglas y cuántas reglas estaban sin aprobar
**So that** no confunda la ausencia de NO_CUMPLE con un expediente limpio

## 5. Acceptance criteria

### AC-01 (US-01) — happy

**Given** un expediente con datos declarados completos, fecha de presentación registrada y zona obtenida del GIS, y reglas aprobadas vigentes a esa fecha
**When** el Revisor DOYC evalúa el expediente
**Then** el sistema muestra por cada regla su resultado oficial, la cita textual, la versión aplicada y los valores usados con su fuente, y registra la evaluación en la bitácora atribuida a ese revisor

### AC-02 (US-01) — domain invariant

**Given** una regla con una versión cuya vigencia terminó antes de la fecha de presentación y otra versión vigente a esa fecha
**When** el Revisor DOYC evalúa el expediente
**Then** el sistema aplica solo la versión vigente a la fecha de presentación y nunca la vigente a la fecha de evaluación

### AC-03 (US-01) — error

**Given** un expediente sin fecha de presentación registrada
**When** el Revisor DOYC intenta evaluarlo
**Then** el sistema no evalúa y le indica que falta la fecha de presentación, porque sin ella no puede determinar la norma aplicable

### AC-04 (US-01) — cross-context

**Given** un expediente cuyo código de zona leído del Documento Gráfico difiere del que indica la CEUS registrada del lote
**When** el Revisor DOYC evalúa el expediente
**Then** el sistema determina la norma aplicable con la CEUS, muestra la discrepancia y registra ambos valores con su fuente

### AC-05 (US-01) — error

**Given** un dato requerido por una regla que falta o tiene confianza bajo el umbral
**When** el Revisor DOYC evalúa el expediente
**Then** esa regla resulta REQUIERE_REVISION con el motivo en lenguaje llano y el sistema no rellena el dato faltante

### AC-06 (US-02) — domain invariant

**Given** una regla vigente en estado borrador cuya condición no se cumple con los datos del expediente
**When** el Revisor DOYC evalúa el expediente
**Then** el resultado oficial de esa regla es REQUIERE_REVISION con el resultado indicativo NO_CUMPLE visible y marcado como no oficial

### AC-07 (US-03) — happy

**Given** un Redactor de reglas con una versión nueva de una regla cuya cita textual aparece literal en la normativa cargada
**When** la propone para aprobación
**Then** el sistema la registra como borrador con número de versión nuevo y deja intactas las versiones anteriores

### AC-08 (US-03) — error

**Given** un Redactor de reglas con una versión cuya cita textual no aparece literal en la normativa cargada
**When** la propone para aprobación
**Then** el sistema la rechaza y le indica que la cita no se encuentra en el texto fuente

### AC-09 (US-04) — happy

**Given** una versión en borrador redactada por otra persona
**When** el Revisor aprobador la aprueba
**Then** el sistema la registra como aprobada con su nombre y fecha en la bitácora, y desde entonces emite resultados oficiales en expedientes presentados dentro de su vigencia

### AC-10 (US-04) — authorization

**Given** una versión en borrador redactada por el mismo Revisor aprobador
**When** intenta aprobarla
**Then** el sistema lo impide y le explica que nadie puede aprobar una regla que redactó

### AC-11 (US-04) — authorization

**Given** un Revisor DOYC o un Redactor de reglas sin la designación de aprobador
**When** intenta aprobar una versión de regla
**Then** el sistema lo impide y le indica que solo un revisor aprobador designado puede aprobar reglas

### AC-12 (US-04) — domain invariant

**Given** una versión de regla ya aprobada
**When** alguien intenta modificar su condición, cita o vigencia
**Then** el sistema lo impide y le indica que una regla aprobada no se edita, y que un cambio requiere una versión nueva

### AC-13 (US-05) — happy

**Given** un expediente evaluado con un NO_CUMPLE bloqueante
**When** el Revisor DOYC lo confirma o lo descarta con un motivo
**Then** el sistema registra la decisión, el motivo y su nombre en la bitácora, enlazados al resultado original, sin modificar ese resultado

### AC-14 (US-05) — error

**Given** un NO_CUMPLE bloqueante o un REQUIERE_REVISION pendiente
**When** el Revisor DOYC intenta descartarlo sin escribir un motivo
**Then** el sistema no registra la decisión y le indica que el motivo es obligatorio

### AC-15 (US-06) — happy

**Given** un expediente evaluado con varios CUMPLE oficiales y NO_CUMPLE de severidad observación
**When** el Revisor DOYC revisa esa lista con los datos declarados de los que depende cada resultado y da su visto bueno
**Then** el sistema registra el visto bueno con su nombre en la bitácora y marca esos resultados como confirmados

### AC-16 (US-06) — domain invariant

**Given** un expediente con NO_CUMPLE bloqueantes o REQUIERE_REVISION sin decisión, o con CUMPLE u observaciones sin visto bueno
**When** alguien consulta el estado del expediente
**Then** el sistema lo presenta como pendiente de revisión humana, y solo lo presenta como revisado cuando todo tiene decisión o visto bueno; en ningún caso lo presenta como aprobado

### AC-17 (US-07) — happy

**Given** una evaluación registrada
**When** el Revisor DOYC pide reproducirla
**Then** el sistema la vuelve a ejecutar con los datos, las versiones de regla, la versión del motor y la fecha de presentación registradas, e indica si cada resultado coincide con el original

### AC-18 (US-07) — error

**Given** una evaluación registrada cuya reproducción da un resultado distinto en alguna regla
**When** el Revisor DOYC la reproduce
**Then** el sistema señala cada discrepancia con el valor original y el nuevo, la registra en la bitácora y no altera el registro original

### AC-19 (US-08) — domain invariant

**Given** una bitácora de expediente en la que se alteró, insertó o eliminó un evento
**When** el Revisor DOYC verifica su integridad
**Then** el sistema indica que la bitácora fue alterada y en qué evento se rompe la cadena

### AC-19b (US-08) — cross-context

**Given** una bitácora reescrita por completo con una cadena recalculada que es coherente consigo misma
**When** el Revisor DOYC la verifica contra el último anclaje externo
**Then** el sistema indica que la bitácora no coincide con el anclaje y desde qué punto dejó de ser confiable

### AC-20 (US-09) — cross-context

**Given** reglas aprobadas de la norma PLOT-A61-2021 con resultados registrados en varios expedientes
**When** el Revisor aprobador suspende en bloque esa norma con un motivo (por ejemplo, una nulidad dictada por la Corte Suprema)
**Then** el sistema deja de emitir resultados oficiales con todas sus versiones (desde entonces dan REQUIERE_REVISION), lista los expedientes y resultados que dependen de ellas y los marca como afectados sin modificarlos

### AC-20b (US-09) — happy

**Given** una versión de regla aprobada que resultó mal interpretada
**When** el Revisor aprobador la retira con un motivo
**Then** el sistema deja de aplicarla a nuevas evaluaciones, conserva su historia y lista los resultados registrados que dependen de ella

### AC-21 (US-10) — happy

**Given** un expediente en una zona exceptuada del MIVIOT, sin reglas cargadas, más reglas aprobadas y en borrador de otras normas
**When** el Revisor DOYC evalúa el expediente
**Then** el sistema declara qué normas y temas se evaluaron, que la norma MIVIOT no tiene reglas (lo que va a revisión) y cuántas reglas estaban sin aprobar, y nunca muestra un veredicto global de «cumple»

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Reproducibilidad | 100 % de resultados reproducidos coinciden con el original cuando no cambió nada | prueba automática que reproduce todas las evaluaciones del lote de validación |
| Detección de alteración | 100 % de alteraciones, inserciones o eliminaciones de eventos anteriores al último anclaje externo; la ventana hasta el siguiente anclaje es un riesgo aceptado | prueba automática de manipulación de la bitácora y de reescritura completa contra el anclaje |
| Tiempo de evaluación | ≤ 10 s por expediente con el catálogo completo (~650 reglas) | medición en las pruebas con los casos de `tests/casos/` |
| Falsos CUMPLE | 0 en el lote de expedientes ya dictaminados | comparación contra el dictamen humano |
| Integridad de citas | 100 % de reglas con cita verificable antes de poder aprobarse | verificación de citas en cada propuesta y en las pruebas |

## 6.1 Security / privacy

- **Data classification:** confidencial: los expedientes contienen datos de propiedad y personales, y los registros tienen efectos en un trámite administrativo.
- **Personal data touched:** nombre del revisor, redactor o aprobador en cada evento de la bitácora; los datos del expediente (finca, propietario) solo por referencia, no copiados en la bitácora.
- **AuthZ/AuthN impact:** tres capacidades nuevas y separadas: redactar reglas, aprobar reglas (designación explícita, nunca las propias) y evaluar y decidir sobre expedientes. Todo evento queda atribuido a una persona identificada, nunca a una credencial compartida.
- **Abuse cases:**
  - Autoaprobación con dos identidades: se deniega por persona, no por cuenta. Vigilar patrones de aprobación queda para una funcionalidad de métricas.
  - Reescritura de la bitácora con recálculo de la cadena completa: se detecta porque la cabeza de la cadena se ancla periódicamente fuera del alcance de quien opera el sistema.
  - Descartes masivos con motivos genéricos: el motivo es obligatorio y queda atribuido. Detectar motivos repetidos queda para una funcionalidad de métricas.
  - El indicativo usado como conclusión: siempre se presenta como no oficial y nunca sale del sistema como resultado.
  - Inyección mediante la condición de una regla: la condición solo admite la gramática restringida del esquema de reglas.
- **Security review:** Required, porque es tamaño M, introduce un límite de autorización nuevo (aprobación de cuatro ojos) y el registro tiene valor probatorio.

## 7. Metrics / KPIs

- **Falsos CUMPLE en el lote de validación**: línea base TBD (no hay reglas aprobadas); meta 0, medida en la primera validación con reglas aprobadas dentro de los 90 días siguientes a la designación del revisor aprobador.
- **Reglas aprobadas con cuatro ojos**: línea base 0 de 648; meta: todas las reglas del Acuerdo 110 y las de las zonas de mayor demanda aprobadas dentro de los 90 días siguientes a la designación del aprobador.
- **Resultados desfavorables con decisión humana registrada**: línea base 0 %; meta 100 % de NO_CUMPLE bloqueantes y REQUIERE_REVISION con decisión y motivo antes del dictamen, desde el primer expediente real.
- **Coincidencia al reproducir**: línea base 0 % (no existe); meta 100 % en la reproducción mensual de una muestra de evaluaciones.

## 8. Open questions

- [ ] ¿Quién es el revisor aprobador designado en la DOYC/DPUOT y cómo se registra su designación? Default now: la designación la carga el responsable del proyecto y queda en la bitácora. — owner: DOYC, due: before sdd:design
- [ ] ¿Dónde y con qué frecuencia se ancla la cabeza de la cadena fuera del sistema? Default now: al cierre de cada día, en un registro controlado por una unidad distinta de la que opera el PreCheck. — owner: Security Lead, due: before sdd:design
- [ ] ¿Cómo se rectifica un dato personal o un expediente cargado por error sin romper la cadena? Default now: con un evento de anulación que referencia al original, sin borrar nada. — owner: asesoría legal del MUPA, due: before sdd:data-model
- [ ] ¿Cuántos REQUIERE_REVISION puede cerrar un revisor en el plazo de una ATC antes de abandonar la herramienta? Default now: se mide con los primeros expedientes y, si supera la capacidad, se prioriza aprobar las reglas con más REQUIERE_REVISION. — owner: DOYC, due: before sdd:tasks
- [ ] ¿Existe un lote de expedientes ya dictaminados con el Acuerdo 110, anonimizado, para medir los falsos CUMPLE? ¿De cuántos? Default now: al menos 30 expedientes presentados después de abril de 2025. — owner: DOYC, due: before sdd:plan-tests
- [ ] ¿El umbral de confianza de AC-05 es único o puede fijarlo cada regla? Default now: umbral global de 0.85, que una regla puede subir pero nunca bajar; el umbral aplicado queda registrado. — owner: Tech Lead, due: before sdd:data-model
- [ ] ¿Qué pasa en AC-04 si el lote no tiene CEUS registrada? Default now: se usa la zona del GIS, cada resultado que depende de la zona lleva la advertencia «sin CEUS» y no puede recibir visto bueno sin que el revisor lo confirme de forma explícita. — owner: DPUOT, due: before sdd:design
- [x] ¿Qué pasa con las decisiones y el visto bueno si el expediente se reevalúa (dato corregido, regla nueva aprobada)? Default now: la nueva evaluación es un evento aparte, el expediente vuelve a «pendiente» y las decisiones anteriores se conservan enlazadas a la evaluación que firmaron. — owner: DOYC, due: before sdd:design **Resuelto en design (2026-09-27): se adopta el default — sad.md §8.**
- [x] ¿La suspensión en bloque de AC-20 alcanza también a los expedientes presentados antes de ella? Default now: sí; desde la suspensión ninguna evaluación nueva emite resultado oficial con esa norma, sea cual sea la fecha de presentación, y los resultados previos se marcan como afectados. — owner: asesoría legal del MUPA, due: before sdd:design **Resuelto en design (2026-09-27): se adopta el default — ADR-0008.**
- [x] ¿La suspensión en bloque se compara con la fecha de evaluación o con una fecha de efecto frente a la fecha de presentación, y cómo convive con la inmutabilidad de la vigencia (AC-12)? Default now: la suspensión es un evento aparte, sin tocar la vigencia; rige para toda evaluación posterior, sea cual sea la fecha de presentación. — owner: asesoría legal del MUPA, due: before sdd:design §4 **Resuelto en design (2026-09-27): se adopta el default — ADR-0008.**
- [x] ¿La suspensión abarca las normas derivadas (A270-2025 sobre el PLOT), exige cuatro ojos y se puede levantar? Default now: abarca las derivadas; exige cuatro ojos; se levanta con un evento que la revierte, sin crear versiones nuevas. — owner: DOYC, due: before sdd:design §4 **Resuelto en design (2026-09-27): se adopta el default — ADR-0008.**
- [x] ¿Reproducir usa el estado de aprobación, suspensión o retiro que tenía la regla al evaluar la primera vez? Default now: sí; reproducir reconstruye ese estado, y la comparación con el estado actual es un informe aparte («qué cambiaría hoy»). — owner: Tech Lead, due: before sdd:design §4 **Resuelto en design (2026-09-27): se adopta el default — ADR-0004.**
- [x] ¿Qué versión se aplica cuando varias versiones de una regla tienen vigencias que se solapan? Default now: la versión aprobada más reciente que cubre la fecha; un borrador nuevo nunca quita el resultado oficial de la aprobada, solo agrega su indicativo; dos aprobadas no pueden solaparse. — owner: Tech Lead, due: before sdd:design **Resuelto en design (2026-09-27): se adopta el default — ADR-0005.**
- [x] ¿Qué resultado da una regla tras retirar su versión? Default now: REQUIERE_REVISION, sin volver a la versión anterior. — owner: DOYC, due: before sdd:design **Resuelto en design (2026-09-27): se adopta el default — ADR-0005.**
- [x] ¿Qué significa confirmar un REQUIERE_REVISION y entra la acción «corregir el dato y reevaluar»? Default now: el revisor fija un veredicto humano (CUMPLE o NO_CUMPLE) con motivo obligatorio; corregir el dato crea un hecho nuevo y una evaluación nueva. — owner: DOYC, due: before sdd:design **Resuelto en design (2026-09-27): se adopta el default — sad.md §8.**
- [x] ¿Qué estado y motivo tiene una versión rechazada? Default now: estado final «rechazada», motivo obligatorio y atribuido; no se evalúa ni da indicativo. — owner: DOYC, due: before sdd:design **Resuelto en design (2026-09-27): se adopta el default — ADR-0005.**
- [x] ¿Dónde se encadenan los eventos de gobierno de reglas (aprobar, rechazar, suspender, retirar, designar)? Default now: en una cadena de reglas propia, con su anclaje y su verificación. — owner: Tech Lead, due: before sdd:design §4 **Resuelto en design (2026-09-27): se adopta el default — ADR-0003.**
- [x] ¿Cuál es la fuente de identidad de persona para negar la autoaprobación? Default now: un registro de personas designadas (identificador personal) al que se vinculan las cuentas, mantenido por la DOYC. — owner: DOYC, due: before sdd:design §8 **Resuelto en design (2026-09-27): se adopta el default — ADR-0006.**
- [ ] ¿Un falso CUMPLE se cuenta por regla o por expediente? Default now: por regla, con cada observación del dictamen asociada a una regla; mientras no haya reglas aprobadas, la métrica se reporta como «no medible». — owner: DOYC, due: before sdd:plan-tests
- [x] ¿Qué AC y qué rama de secuencia cubren la autorización del Revisor DOYC para evaluar, decidir, dar visto bueno y reproducir (un redactor no puede descartar un NO_CUMPLE)? Default now: el contrato exige el rol `revisor_doyc` y rechaza con «su persona no tiene el rol necesario». — owner: specify (AC) + sequences (rama), due: before sdd:tasks **Resuelta 2026-09-27: la rama de secuencia está en sad.md §6 flujo 14 (`identidad.cuenta_no_vinculada` / `identidad.sin_rol` / continúa); el AC propio sigue a cargo de specify.**
- [x] ¿Qué historia y qué flujo describen el registro de personas (inicialización génesis, vincular cuenta, designar con cuatro ojos)? Default now: lo que fija el contrato CLI (`inicializar`, `vincular-cuenta`, `designar` + `confirmar`). — owner: sequences (+ specify si hace falta una historia), due: before sdd:tasks **Resuelta 2026-09-27: flujos en sad.md §6 flujos 11 (génesis), 12 (vincular cuenta) y 13 (designar + confirmar); sin historia propia, se adopta el default.**
- [ ] ¿La norma aplicable debe derivarse de la CEUS (hoy solo reemplaza el código de zona y la norma sale de `lote.norma_aplicable`)? Default now: la norma sale del hecho declarado/GIS y la CEUS gobierna la ficha. — owner: DPUOT, due: before sdd:ship (review B7)
- [ ] ¿Hace falta serializar `inicializar` y la confirmación de vínculos concurrentes de una misma cuenta? Default now: no, porque SQLite serializa los escritores y el registro ignora el segundo vínculo; se revisa al pasar a varios escritores. — owner: Tech Lead, due: migración a PostgreSQL (review B8)
- [ ] ¿Cuánto tiempo debe seguir ejecutable una versión antigua del motor para reproducir? Default now: mientras exista algún expediente evaluado con ella dentro del plazo de impugnación. — owner: Tech Lead, due: before sdd:design
