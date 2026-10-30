---
status: Draft
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-27"
feature_size: "M"
---

# Spec — informe-precheck

> **Glossary:** [CONTEXT](../../../CONTEXT.md) (nivel raíz; los términos de esta funcionalidad se agregaron allí: informe PreCheck, versión del revisor, versión del profesional, observación, informe emitido, profesional idóneo, expediente revisado, indicación al profesional)
> **Reference module / docs / channels used:** `docs/idea-brief.md`, `docs/roadmap.md` (fila 2), `docs/architecture-map.md`, skill `mupa-informe-precheck`, `docs/features/motor-reglas-auditable/` (spec, sad, `contracts/public-api.md`), `normativa/acuerdo-110/texto-completo.md` (Arts. 3, 43, 56, 68 y 81), investigación de mercado y análisis de fallas de la etapa de ideación.

**Idea (línea base literal):** «Informe estandarizado de una evaluación del PreCheck: resultado por regla con cita literal de la norma, datos usados y su procedencia, cobertura por norma, advertencia "sin CEUS", decisiones humanas y un hash verificable contra la bitácora. Dos versiones: una para el Revisor DOYC y otra para el profesional idóneo que presenta.»

## 1. Context

El PreCheck ya evalúa expedientes, registra cada resultado en una bitácora inalterable y exige decisión humana sobre todo lo desfavorable, pero el Revisor DOYC no tiene nada que leer ni que entregar: los resultados solo existen como salida técnica de la línea de comandos. Hoy el revisor redacta a mano las observaciones para el profesional idóneo, sin garantía de que citen la norma literal, de que lleguen completas en la primera ronda (el Acuerdo 110 prohíbe agregar requisitos nuevos en la subsanación, Arts. 43, 56, 68 y 81) ni de que se pueda probar después qué se entregó.

Ahora que el núcleo auditable ya está entregado (roadmap, fila 1), el informe es la pieza que convierte lo registrado en un documento útil para el revisor y para quien presenta, sin esperar respuestas externas: se construye sobre la bitácora, más los datos de encabezado que el revisor entrega al generarlo. Las 648 reglas siguen en borrador, así que el informe debe servirle al revisor desde el primer día sin que un resultado no validado llegue nunca al profesional.

**Enfoque comprometido:** un informe derivado siempre de una evaluación registrada, en dos versiones. La versión del revisor es de uso interno, muestra todo (incluidos los indicativos marcados «no oficial») y se regenera sin registrarse. La versión del profesional solo existe cuando el expediente está revisado, contiene solo resultados oficiales o veredictos humanos redactados como observaciones (qué, dónde, por qué con la cita literal y qué hacer según la indicación al profesional que escribe el revisor, separada del motivo de auditoría), declara siempre el alcance de lo verificado y su emisión queda registrada en la cadena del expediente con una huella calculada sobre su contenido, impresa en cada página y verificable también después de imprimirse; la vigencia de un informe emitido (afectado, reemplazado o sustituido) se consulta siempre en el sistema, no se imprime. Cada versión se genera como documento autocontenido e imprimible y como forma estructurada estable con la misma huella; al profesional se le entrega el documento. La investigación de mercado no encontró ningún producto (Archistar AI PreCheck, Symbium, UpCodes, CORENET X) que separe dos audiencias con reglas de emisión distintas ni que ancle el documento emitido a un registro verificable: todos se limitan a citar la norma y advertir que no sustituyen el juicio profesional. El análisis de fallas señaló como riesgo más grave que la versión del profesional se lea como un permiso o como una verificación completa (un informe sin observaciones parece un proyecto limpio aunque cientos de reglas no se evaluaron), con el agravante de que el Acuerdo 110 impide agregar requisitos en la subsanación; por eso el informe declara siempre su alcance y que no es la lista de observaciones del dictamen. El criterio de éxito es que ninguna observación llegue al profesional sin respaldo oficial o humano y que todo informe emitido sea verificable.

- Fuentes de trazabilidad: estructura y redacción de observaciones del skill `mupa-informe-precheck`; nota de carácter preliminar según el Art. 3 del Acuerdo 110; estados del expediente y decisiones de `motor-reglas-auditable` (AC-13 a AC-16).

## 2. Goals

- El Revisor DOYC obtiene de cualquier evaluación registrada un informe completo y trazable que le sirve para decidir, aun cuando ninguna regla esté aprobada.
- El profesional idóneo recibe en la primera ronda todas las observaciones accionables con su respaldo normativo literal, y nunca una conclusión que no respalden una regla aprobada o una persona.
- Todo informe emitido se puede verificar contra la bitácora y se sabe cuándo dejó de reflejar el estado vigente del expediente.

## 3. Non-goals

- **Entrega al profesional por un portal o por la Ventanilla Única**: el revisor entrega el archivo por los canales actuales; el portal está fuera de la v1 según el brief.
- **Formato PDF generado por el sistema**: el documento autocontenido se imprime o guarda como PDF con las herramientas habituales; un PDF propio complica que la huella sea reproducible.
- **Miniaturas del recorte del plano junto a cada observación**: requieren la extracción desde CAD, BIM o PDF, que es otra funcionalidad del roadmap.
- **Redacción automática del «qué hacer»**: la indicación al profesional la escribe el revisor; el sistema no genera texto normativo propio.
- **Verificación pública por terceros** (banco, comprador, Junta Comunal): en la v1 verifica un Revisor DOYC; exponer la verificación fuera del Municipio requiere la API autenticada del roadmap.

## 4. User stories

### US-01: Consultar la versión del revisor

**As a** Revisor DOYC
**I want** obtener la versión del revisor de cualquier evaluación registrada de un expediente
**So that** vea en un solo documento todos los resultados, su respaldo, los datos usados y lo que falta decidir

### US-02: Emitir la versión del profesional

**As a** Revisor DOYC
**I want** emitir la versión del profesional cuando el expediente esté revisado
**So that** entregue al profesional idóneo un informe que quede registrado y que no pueda contener nada sin respaldo

### US-03: Recibir observaciones accionables

**As a** Profesional idóneo
**I want** recibir cada observación con qué falla, dónde, por qué según la norma y qué hacer
**So that** pueda corregir el proyecto en una sola ronda de subsanación

### US-04: Reconocer el carácter preliminar

**As a** Profesional idóneo
**I want** que el informe declare de forma visible que es una verificación preliminar y qué normas consultó
**So that** no lo confunda con un registro de plano, una autorización o un permiso

### US-05: Verificar un informe emitido

**As a** Revisor DOYC
**I want** comprobar si un archivo de informe que me presentan coincide con uno emitido
**So that** pueda detectar un informe alterado o que el sistema nunca emitió

### US-06: Saber si un informe emitido quedó desactualizado

**As a** Revisor DOYC
**I want** ver los informes emitidos de un expediente y si alguno dejó de reflejar su estado vigente
**So that** no se sostenga una observación después de una reevaluación, un retiro de regla o una suspensión de norma

### US-07: Escribir la indicación al profesional

**As a** Revisor DOYC
**I want** escribir, al decidir o después, una indicación para el profesional separada del motivo de mi decisión
**So that** el profesional reciba una instrucción útil sin que salga del sistema el criterio interno que dejo para la auditoría

## 5. Acceptance criteria

### AC-01 (US-01) — happy

**Given** un Revisor DOYC y un expediente con una evaluación registrada, con reglas aprobadas y no aprobadas
**When** el revisor pide la versión del revisor de esa evaluación
**Then** el sistema le entrega un informe marcado «uso interno» con cada resultado (incluidos NO_APLICA), su cita literal, versión de regla, valores usados con su procedencia y confianza, el indicativo de cada regla no aprobada marcado «no oficial» en texto, la cobertura por norma, las advertencias «sin CEUS», las decisiones humanas con su motivo y la huella de la evaluación

### AC-02 (US-01) — happy

**Given** un expediente pendiente de revisión humana
**When** el Revisor DOYC pide la versión del revisor
**Then** el informe declara «pendiente de revisión humana» (el mismo término que usa el estado del expediente) y enumera lo que falta: resultados por decidir, normas sin reglas por decidir, visto bueno e indicaciones al profesional pendientes

### AC-03 (US-01) — error

**Given** un Revisor DOYC
**When** pide un informe de un expediente o de una evaluación que no existen en la bitácora
**Then** el sistema no genera nada y le explica que ese expediente o esa evaluación no están registrados

### AC-04 (US-02) — happy

**Given** un expediente revisado cuya evaluación vigente tiene decisiones y visto bueno
**When** el Revisor DOYC emite la versión del profesional
**Then** el sistema entrega el informe, registra la emisión en la cadena del expediente con la huella del informe, la evaluación de origen, quién lo emitió y cuándo, y le muestra esa huella

### AC-05 (US-02) — domain invariant

**Given** un expediente pendiente de revisión humana
**When** el Revisor DOYC intenta emitir la versión del profesional
**Then** el sistema no la emite, explica que la versión del profesional solo existe con el expediente revisado y enumera lo que falta

### AC-06 (US-02) — domain invariant

**Given** un expediente con una evaluación posterior a la que el revisor indica
**When** el Revisor DOYC intenta emitir la versión del profesional de la evaluación anterior
**Then** el sistema no la emite y explica que solo se emite de la evaluación vigente (la última evaluación registrada del expediente; una reproducción no cuenta como evaluación nueva)

### AC-07 (US-01, US-02, US-05, US-06, US-07) — authorization

**Given** una persona sin el rol de Revisor DOYC (por ejemplo, un Redactor de reglas) o una cuenta sin persona vinculada
**When** pide cualquiera de las dos versiones, intenta emitir la del profesional, verificar un informe, consultar los informes emitidos o escribir una indicación al profesional
**Then** el sistema lo deniega, explica que se necesita el rol de Revisor DOYC y no revela el contenido del expediente

### AC-08 (US-03) — happy

**Given** un expediente revisado con NO_CUMPLE bloqueantes confirmados, REQUIERE_REVISION resueltos con veredicto humano desfavorable y NO_CUMPLE no bloqueantes oficiales cubiertos por el visto bueno
**When** el Revisor DOYC emite la versión del profesional
**Then** cada observación dice qué no cumple (el valor declarado y el límite de la norma; «falta el dato <nombre>» si el profesional no lo declaró; el requisito citado, sin límite numérico, si la regla es de criterio), dónde (la hoja o página si el dato la declara, o «ubicación no consta en los datos declarados»), por qué (la cita literal con su norma y artículo) y qué hacer (la indicación al profesional); las bloqueantes aparecen primero, después las no bloqueantes (un veredicto humano toma la severidad que declara su regla), y ningún motivo de decisión aparece en el informe

### AC-09 (US-03) — domain invariant

**Given** un expediente revisado con resultados de reglas no aprobadas
**When** el Revisor DOYC emite la versión del profesional
**Then** el informe no contiene ningún indicativo, ningún NO_APLICA ni ningún resultado sin respaldo de una regla aprobada o de un veredicto humano; los cumplimientos (oficiales y por veredicto humano) aparecen solo como conteo por norma y tema, sin detalle por regla

### AC-10 (US-03) — cross-context

**Given** un expediente revisado cuyo visto bueno se dio confirmando resultados que dependen de la zona sin CEUS
**When** el Revisor DOYC emite la versión del profesional
**Then** cada observación que depende de la zona dice que la zona se tomó del Documento Gráfico sin certificación de uso de suelo

### AC-11 (US-04) — happy

**Given** cualquier informe, de cualquiera de las dos versiones
**When** se abre o se imprime
**Then** la primera página muestra la nota de carácter preliminar del Art. 3 del Acuerdo 110 (que además dice que el informe no es la lista de observaciones del dictamen de la DOYC y que el dictamen puede incluir otras), el encabezado con los datos del expediente que el revisor entregó al generarlo (con «no consta» en los que no entregó, nunca inventados), las normas consultadas con su vigencia, la versión del motor, el código de huella junto al expediente en cada página y el aviso de que la vigencia del informe se verifica con la DOYC; el informe nunca presenta el expediente como aprobado

### AC-12 (US-05) — happy

**Given** una versión del profesional emitida por el sistema, como archivo original (documento o forma estructurada) sin cambios de contenido, o como copia impresa o convertida con su código de huella (la huella completa, impresa en bloques junto al expediente)
**When** el Revisor DOYC la verifica con el archivo, o con el expediente y el código impreso (completo o con al menos sus primeros 16 caracteres)
**Then** el sistema busca entre todas las emisiones registradas, confirma que coincide con una o más, lista para cada una el expediente al que pertenece, la evaluación de origen, quién la emitió y cuándo, y dice si sigue vigente, si fue afectada por un retiro o una suspensión, si fue reemplazada por una evaluación posterior o si fue sustituida por una emisión posterior de la misma evaluación, e indica cuál es la emisión vigente; con el archivo, además compara el bloque de trazabilidad (quién emitió y cuándo, que queda fuera de la huella) con el registro de la emisión y avisa si no coincide; con el código impreso, el sistema además regenera el contenido emitido (sin los datos de encabezado, que no guarda) para que el revisor lo compare con la copia, y aclara que el código prueba que la emisión existe, no que la copia esté íntegra

### AC-13 (US-05) — error

**Given** un archivo de informe con su contenido alterado en cualquier parte, una versión del revisor o un informe que el sistema nunca emitió
**When** el Revisor DOYC lo verifica con el archivo
**Then** el sistema informa que no coincide con ninguna emisión registrada y no lo presenta como válido; si el archivo no es un documento original ni una forma estructurada del sistema (por ejemplo, una conversión), explica que debe verificarse con el código impreso

### AC-14 (US-06) — cross-context

**Given** un informe emitido y, después, un retiro de una versión de regla o una suspensión de una norma que toca cualquier resultado de su evaluación de origen (observaciones, cumplimientos del resumen o veredictos humanos sobre reglas de esa norma)
**When** el Revisor DOYC consulta los informes emitidos del expediente
**Then** el sistema marca ese informe como afectado, dice qué regla o norma cambió y cuándo, y no altera el informe ya emitido; si la suspensión se levanta, el informe deja de estar afectado y el sistema sigue mostrando el período en que lo estuvo

### AC-15 (US-06) — cross-context

**Given** un informe emitido y, después, una evaluación nueva del mismo expediente
**When** el Revisor DOYC consulta los informes emitidos
**Then** el sistema marca ese informe como reemplazado por una evaluación posterior; si en cambio hay una emisión posterior de la misma evaluación con otra huella (por una indicación nueva o un encabezado corregido), marca la anterior como sustituida por esa emisión; una emisión posterior con la misma huella no marca nada, porque es otra entrega del mismo documento

### AC-16 (US-02, US-05) — domain invariant

**Given** la misma evaluación con las mismas decisiones, las mismas indicaciones al profesional y los mismos datos de encabezado (dos escrituras que solo difieren en tildes compuestas o en espacios cuentan como el mismo dato)
**When** se emite la versión del profesional más de una vez, por la misma o por otra persona
**Then** todas las emisiones producen el mismo contenido y la misma huella (quién emite y cuándo quedan en el registro de cada emisión, fuera del contenido con huella), y cada emisión queda registrada como una entrega distinta; si después se agrega una indicación, la emisión siguiente tiene otra huella

### AC-17 (US-07) — happy

**Given** un Revisor DOYC que confirma un NO_CUMPLE bloqueante, da un veredicto desfavorable sobre un REQUIERE_REVISION o tiene un NO_CUMPLE no bloqueante oficial cubierto por el visto bueno
**When** escribe la indicación al profesional al decidir, o la agrega después como complemento de ese resultado
**Then** el sistema la registra atribuida a él, sin reescribir la decisión ni su motivo, y la usa como «qué hacer» de esa observación; cualquier Revisor DOYC puede escribirla; si hay varias, la versión del profesional usa la última y la del revisor muestra el historial

### AC-18 (US-02, US-07) — domain invariant

**Given** un expediente revisado con alguna observación que no tiene indicación al profesional
**When** el Revisor DOYC intenta emitir la versión del profesional
**Then** el sistema no la emite, explica que toda observación necesita su indicación al profesional y enumera las que faltan

### AC-19 (US-04) — domain invariant

**Given** cualquier expediente revisado, tenga o no reglas no aprobadas, normas sin reglas decididas a mano, zona sin CEUS o puntos resueltos por criterio del revisor
**When** el Revisor DOYC emite la versión del profesional
**Then** el informe incluye una sección de alcance que declara qué normas se evaluaron con reglas aprobadas, cuántas reglas no se evaluaron (reglas sin aprobar que el sistema no pudo aplicar oficialmente), qué normas se decidieron a mano, si la zona se tomó sin CEUS y qué puntos se resolvieron por criterio del revisor (los veredictos favorables como conteo por norma y tema, sin detalle por regla, según AC-09; los NO_CUMPLE descartados, uno por uno; con o sin dato declarado); la sección sale siempre, también cuando no hay limitaciones; el informe nunca declara que el proyecto cumple en forma global, aunque no tenga observaciones

### AC-20 (US-02) — cross-context

**Given** un expediente revisado cuya evaluación vigente tiene cualquier resultado afectado por el retiro de una versión de regla o por una suspensión de norma vigente (no levantada)
**When** el Revisor DOYC intenta emitir la versión del profesional
**Then** el sistema no la emite, explica que la evaluación tiene resultados afectados, dice qué regla o norma cambió, y le indica que reevalúe el expediente

### AC-21 (US-07) — error

**Given** un resultado favorable, un NO_CUMPLE descartado, un NO_APLICA o un resultado de una evaluación que ya no es la vigente
**When** el Revisor DOYC intenta escribir una indicación al profesional sobre él
**Then** el sistema no la registra y explica que solo se escriben indicaciones sobre observaciones de la evaluación vigente

### AC-22 (US-01) — domain invariant

**Given** un expediente con una evaluación posterior a la que el revisor indica
**When** el Revisor DOYC pide la versión del revisor de la evaluación anterior
**Then** el informe muestra el estado y las decisiones de esa evaluación y un aviso visible de que no es la evaluación vigente, con la referencia a la vigente

### AC-23 (US-03) — domain invariant

**Given** un expediente revisado con una norma sin reglas decidida a mano en forma desfavorable
**When** el Revisor DOYC emite la versión del profesional
**Then** esa decisión aparece como observación rotulada «norma sin reglas cargadas: decisión del revisor»; el «por qué» nombra la norma y dice que el sistema no tiene su texto, sin inventar ninguna cita; su indicación al profesional es obligatoria como en cualquier observación

### AC-24 (US-07) — cross-context

**Given** una observación con indicación al profesional y, después, una evaluación nueva del mismo expediente
**When** la evaluación nueva produce para esa regla la misma versión, el mismo resultado y los mismos valores usados
**Then** la indicación se traslada a la observación de la evaluación nueva y la versión del revisor muestra que fue trasladada; si cambió cualquiera de esos elementos, la observación queda sin indicación y figura entre las que faltan

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Tiempo de generación, emisión y verificación | ≤ 2 s p95 por operación (generar cualquiera de las versiones, emitir con su registro, verificar por archivo o por código) con el catálogo completo (~650 resultados) | medición en la suite de pruebas con los casos de `tests/casos/` |
| Reproducibilidad de la huella | 100 % de regeneraciones de la misma evaluación con las mismas decisiones, indicaciones y datos de encabezado producen la misma huella | prueba automática que regenera y compara |
| Autocontenido | 0 referencias a recursos externos en el documento; se abre y se imprime sin red | prueba automática sobre el documento generado |
| Detección de alteración (verificación por archivo) | 100 % de archivos originales (documento o forma estructurada) con un solo carácter de contenido alterado se reportan como no coincidentes; 0 falsos rechazos del mismo contenido en su otra forma original; las copias impresas o convertidas se verifican por código | prueba automática de manipulación y de cambio de presentación |
| Accesibilidad | 100 % de estados (CUMPLE, NO_CUMPLE, REQUIERE_REVISION, no oficial) expresados en texto, no solo con color; impresión en carta y legal sin cortar tablas | revisión automática del documento + revisión manual de impresión |

## 6.1 Security / privacy

- **Data classification:** confidencial: la versión del revisor contiene indicativos no oficiales, motivos internos y datos del expediente; la versión del profesional es un documento con efectos en un trámite administrativo.
- **Personal data touched:** trámite, nombre del proyecto, finca y nombre e idoneidad del profesional idóneo, entregados por el revisor al generar o emitir el informe; no se copian en la bitácora (se respeta `motor-reglas-auditable` §6.1: datos del expediente solo por referencia), solo la huella del bloque de encabezado queda en el registro de la emisión. Identificador y nombre del Revisor DOYC que emitió, en el registro de la emisión.
- **AuthZ/AuthN impact:** consultar, emitir y verificar informes exige el rol de Revisor DOYC, igual que evaluar y decidir. La emisión queda atribuida a una persona identificada.
- **Abuse cases:**
  - Versión del revisor reenviada al profesional: cada página dice «uso interno» y que no es un informe emitido; como no se registra, la verificación la reporta como no emitida.
  - Texto libre del revisor con contenido activo o datos que no deben salir: el motivo de la decisión nunca sale del sistema; solo sale la indicación al profesional, escrita para ese fin; todo texto se muestra como texto plano, sin ejecutar nada.
  - Informe tomado por permiso o por verificación completa: nota preliminar reforzada, sección de alcance obligatoria y nunca un «cumple» global.
  - Informe alterado o fabricado presentado como emitido: la verificación contra la bitácora lo detecta en el archivo; sobre copias impresas, el código de huella prueba que la emisión existe y el sistema regenera el contenido emitido para compararlo a mano.
  - Informe obsoleto usado para sostener una observación: la consulta de emitidos lo marca como afectado o reemplazado.
  - Faltante de datos presentado como cumplimiento: los datos no declarados se muestran como «no consta»; un resultado sin respaldo nunca aparece en la versión del profesional.
- **Security review:** Required, porque es tamaño M, emite un documento con valor probatorio hacia fuera del Municipio y agrega datos personales del profesional.

## 7. Metrics / KPIs

- **Observaciones completas en la versión del profesional** (qué, por qué con cita literal y qué hacer) — baseline: 0 % (no existe informe), target: 100 % desde el primer informe emitido; las observaciones de normas sin reglas (sin cita posible) se cuentan aparte, con target 100 % con indicación al profesional.
- **Informes emitidos verificables contra la bitácora** — baseline: 0 %, target: 100 % desde el primer informe emitido.
- **Informes emitidos con resultados sin respaldo oficial o humano** — baseline: no medible, target: 0 en todo momento (medido en cada emisión por las pruebas y en la reproducción mensual de una muestra).
- **Rondas de subsanación por expediente con informe emitido** — baseline: TBD (plan: la DOYC reporta el promedio actual sobre los expedientes de los últimos 3 meses), target: reducción de 20 % en los 6 meses siguientes al primer informe emitido.

## 8. Open questions

- [ ] ¿El nombre del Revisor DOYC que emitió el informe aparece en la versión del profesional? Default now: aparece su identificador de persona y su nombre en la sección de trazabilidad, que se imprime pero queda fuera del contenido con huella. — owner: DOYC, due: before sdd:design
- [ ] ¿El informe lleva identidad institucional (escudo, membrete) del Municipio? Default now: no; lleva el título «Informe PreCheck — verificación preliminar» sin marca institucional hasta que la DOYC lo autorice. — owner: DOYC, due: before sdd:design
- [ ] ¿Cuál es el texto exacto de la nota de carácter preliminar, incluida la aclaración de que el informe no es la lista de observaciones del dictamen (Acuerdo 110, Arts. 43, 56, 68 y 81)? Default now: el texto del skill `mupa-informe-precheck` más esa aclaración. — owner: asesoría legal del MUPA, due: before sdd:tasks
- [ ] ¿Cómo se rectifica un dato personal del encabezado (nombre del profesional) en un informe ya emitido? Default now: el encabezado no está en la bitácora; se emite un informe nuevo con el dato corregido y la emisión anterior queda registrada como sustituida (AC-15). — owner: asesoría legal del MUPA, due: before sdd:data-model
- [ ] ¿Qué tamaño de papel es el oficial? Default now: carta, con estilos que también imprimen en legal. — owner: DOYC, due: before sdd:tasks
