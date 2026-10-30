---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead", "DOYC"]
updated_at: "2026-10-19"
feature_size: "M"
ticket: "motor-reglas-auditable"
supersedes: []
amends: ["0012"]
---

# 0013 — Revisión con IA en dos pasos (reglas vigentes, luego evaluación rígida) con un contrato común para todos los modelos

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** responsable del proyecto (Daniel) tras el análisis de 56 desacuerdos de DeepSeek con Opus y Fable

## Context

En la comparación del 19-oct, DeepSeek se apartó del consenso de Opus y Fable en 56 reglas de 4 planos. La mayoría de esas diferencias venía del sistema, no del juicio del modelo.

1. **Instrucciones distintas.** Claude recibía el agente `revisor-planos.md` (unos 59 KB), `CLAUDE.md` y el prompt de `promptClaudeCode()`. DeepSeek recibía unos 7 KB. A DeepSeek le faltaban:
   - la determinación de norma y zona;
   - los hallazgos tipificados;
   - la medida decisiva;
   - las lecciones de `conocimiento/`. Estas solo le llegaban a Claude, y solo si el agente corría el paso 0.
2. **Permisos distintos.** Claude cambiaba `lote.norma_aplicable` a mano en `lote.json`. DeepSeek tenía esas claves bloqueadas por código. En Tocumen eso bastaba para que uno evaluara con ML2 y el otro con el PLOT.
3. **Cada modelo evaluaba una lista de reglas distinta.** No había un archivo con las reglas vigentes de la corrida.
4. **Los permisos especiales no tenían mecanismo.** En CASO-A, Opus encontró la nota DPU-OT-1091-2026 (adosamiento lateral, Res. 13-91) y la aplicó dentro de una justificación. No había un lugar donde registrar «este permiso cambia estas reglas».

## Decision drivers

- Todos los modelos trabajan con el mismo contrato, las mismas reglas vigentes y los mismos permisos.
- **Más autonomía para la IA.** Decide la norma, la zona, los datos de alcance y los permisos especiales sin tope a su criterio. Lo único que se exige es la fuente, por el principio 1.
- **Prevalece el motor.** Ningún modelo cambia una decisión que el motor ya tomó con los datos (ver «El dictamen como producto», 13-oct).
- `reglas/` no lo modifica la IA. Un permiso que el catálogo no recoge deja una propuesta de regla.

## Considered options

1. **Dos pasos con lista cerrada y contrato común.** Primero se fijan las reglas vigentes con su fuente; después cada una se evalúa de forma rígida. Las instrucciones normativas se escriben una sola vez y se inyectan a todos los proveedores.
2. **Copiar el agente de Claude en el prompt de DeepSeek.** Iguala el texto, pero no los permisos ni la lista de reglas, y duplica el mantenimiento.
3. **Fijar la norma automáticamente por el código de zona.** No sirve: `MP-C2` existe en ML1 y en ML2. Elegir entre las dos exige leer el plano (el polígono del Metro en la localización regional).

## Decision outcome

**Chosen:** opción 1.

### Paso 0 — Ficha de alcance (determinista)
`precheck/planos/alcance.py` escribe `alcance_base.json` en cada evaluación. Contiene:
- las normas candidatas: la declarada y las que contienen el código de zona (`validar_datos.normas_con_codigo`);
- la zona del usuario y la del plano, con los avisos de discrepancia y de código inexistente;
- las claves de los `aplica_si`, agrupadas por norma;
- los documentos complementarios, con su tipo probable (CEUS, nota DPU, resolución, carta, memoria);
- la fecha de presentación.

### Paso 1 — Reglas vigentes (la IA, con su fuente)
- **Quién escribe qué.** La IA escribe `alcance_ia.json`, con la forma `FORMA_ALCANCE_IA` de `contrato.ts`:
  - la norma, el código de zona, el sector y la unidad territorial de San Francisco;
  - los datos de alcance, incluidos los `expediente.*` (`requiere_bcbrp`, `propiedad_arrendada`, `zona_intervenida_mupa`);
  - los permisos especiales.
  Cada valor va con documento, página y cita literal.
  - Claude Code escribe el archivo.
  - DeepSeek usa la herramienta `fijar_alcance`.
  - La API de Anthropic, que no ve el plano, lo deja en los supuestos.
- **El motor comprueba cada cita** contra la capa de texto o el OCR de esa página (`alcance.aplicar`), con la misma normalización que `verificar_citas`.
  - Si una cita no aparece, el valor no entra. El error vuelve a la IA para que lo corrija: DeepSeek lo recibe en la respuesta de `fijar_alcance`; Claude, en una retoma con `--resume` (`retomaDeAlcance`, 15 minutos como máximo).
  - Las variables que definió el arquitecto siguen mandando sobre la IA.
- **Permisos.** Se aplican en `evaluar()`:
  - `exceptua`: la regla da NO_APLICA «exceptuada por PERM-n: <cita>».
  - `condiciona`: la regla queda en revisión con el permiso, y la IA la decide en el paso 2.
  - `norma_especial`: sustituye la norma.
- **Propuestas de regla.** Cada `propuesta_regla` va a `propuestas_reglas.json`, y `scripts/analisis/propuestas_reglas.py` las junta todas.
- **Datos «solo si existe»** (`existe(proyecto.resolucion_edificabilidad)` y similares):
  - «no tiene» borra la clave, y la regla aplica;
  - «tiene» escribe el valor con su fuente.
- **Lista cerrada.** El motor escribe `reglas_a_evaluar.json` con las reglas que aplican, las exceptuadas, las que no se puede determinar si aplican y los errores del alcance. Fuera de esa lista no hay reglas que decidir en esa corrida. Las de otras zonas agrupadas (ADR-0012) no entran: dependen de confirmar la zona, que es tarea del paso 1.
- **Reinicio por corrida.** `prepararEntradas` borra los cuatro archivos de alcance al empezar cada corrida (`ARCHIVOS_DE_ALCANCE`). `reevaluar` no los borra.

### Paso 2 — Evaluación rígida
- El motor decide con los datos. La IA, en cada regla que sigue en revisión, hace una de dos cosas:
  - escribe el dato que falta, con su fuente, y reevalúa;
  - o decide la regla, si es de criterio, de un documento externo o de un permiso con condición.
- **Prevalece el motor.** Si la IA cree que el motor se equivoca, corrige el dato con su fuente o deja una **objeción** en el dictamen (`objeciones`: regla, motivo, cita). Las objeciones se muestran en el resumen y en el informe, pero no cambian el estado.
- **Cobertura del 100 %.** Toda regla de la lista que siga en revisión debe tener una decisión. Si falta alguna, el dictamen vuelve a la IA:
  - DeepSeek recibe una devolución sin herramientas; se juntan las decisiones de las dos respuestas.
  - Claude recibe una retoma (`retomaDeCobertura`).
  - Si la retoma falla, queda el dictamen anterior.

### Contrato común
`web/src/server/ia/contrato.ts` contiene las secciones `[C-…]`:
- principios, pasos, estados, jerarquía y escala de confianza;
- zona y norma, permisos y documentos complementarios;
- datos (el criterio de `hechos_documentales` es obligatorio), ausencia y medición;
- densidad (prohibido inventar el factor de habitantes);
- datos externos (BCBRP = Bomberos; la idoneidad en la JTIA no se lee del plano);
- hallazgos tipificados, decisión, cobertura, marcas, objeciones y veredicto.

Cada proveedor recibe el mismo texto con sus propios verbos (`Verbos`): Claude con pymupdf, `medir_dibujo.py` y `alcance_ia.json`; DeepSeek con sus herramientas, entre ellas `fijar_alcance`; la API sin herramientas.

El servidor inyecta a los tres el conocimiento vigente: las secciones «Lecciones» y «Criterios computables vigentes» de `python -m precheck.aprendizaje contexto`. Una prueba de Vitest exige que el prompt de cada proveedor contenga todos los ids de sección.

### Controles de DeepSeek (`escribir_hecho`)
- **Ausencia.** Un false con confianza de 0.85 o más exige haber ampliado esa lámina antes (`ver_recorte` a 150 ppp o más).
- **Medidas.** Con `PRECHECK_DEEPSEEK_MEDIR=1`, una medida con confianza menor a 0.85, o un 0 sin «no hay…» en el detalle, exige haber pasado `medir_dibujo` sobre esa lámina.
- **Excepciones:** las láminas escaneadas, los documentos complementarios y los métodos `expediente` y `declarado`.
- **Claves permitidas.** `clavesPermitidas` se recalcula después de cada reevaluación, y `escribir_hecho` guarda el documento real de donde salió el dato.

## Consequences

**Positive**
- En Tocumen (ronda 77) DeepSeek y Opus eligen la misma norma y zona (MIVIOT-ML2, MP-C2), con 68 y 69 reglas vigentes. Antes DeepSeek evaluaba con el PLOT. Entran las 9 reglas de ML2.
- El permiso especial queda registrado con su cita y su efecto, y se ve en la sección «Reglas vigentes de esta corrida» del resumen y del informe.
- Las instrucciones normativas se mantienen en un solo lugar.

**Negative**
- **Costo.** El prompt de DeepSeek pasa de unos 5.5 KB a unos 34 KB (con prefijo en caché). Una corrida en Tocumen costó 0.63 USD.
- **Tiempo.** Claude puede encadenar tres retomas: alcance (15 min), segunda pasada (20 min) y cobertura (15 min). Por eso el lote usa `--limite-min 100`.
- **Vía API.** No tiene un equivalente de `fijar_alcance`: el alcance queda en los supuestos y el motor no lo reevalúa.
- **CLI.** En `expedientes/` no hay `plano.pdf`, así que las citas del alcance no se pueden comprobar ahí.
- **Agente de Claude.** `revisor-planos.md` solo se recortó un poco. Se le agregó la precedencia del contrato y el paso 0 quedó condicional, para no arriesgar la calidad de la referencia.

## Links

- Plan: `~/.claude/plans/haz-un-plan-para-delightful-comet.md` (copia local de trabajo)
- Guía: [[../../../demo/revision-dos-pasos-19oct.md]]
- Enmienda: [[0012-agrupar-las-revisiones-de-otras-zonas-cuando-el-codigo-es-dudoso.md]]
- Código: `precheck/planos/alcance.py`, `precheck/planos/revisar.py`, `web/src/server/ia/contrato.ts`, `web/src/server/ia/alcance.ts`, `web/src/server/ia/revisar.ts`, `web/src/server/ia/deepseek.ts`, `web/src/server/ia/herramientas-deepseek.ts`, `web/src/server/prechecks/motor.ts`
- Pruebas: `tests/test_planos_alcance.py`, `web/src/server/ia/contrato.test.ts`, `web/src/server/ia/alcance.test.ts`, `web/src/server/ia/deepseek.test.ts`
- Commits: `e46af53`, `71a2acb`, `2a345c7`, `0efa789`, `4d7b904`
