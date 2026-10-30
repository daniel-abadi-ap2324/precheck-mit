---
status: Draft
owner: "desconocido@correo.invalid"
reviewers: ["implementing engineer", "Tech Lead"]
updated_at: "2026-09-27"
feature_size: "M"
---

# Test plan — informe-precheck

El informe es una proyección pura de la bitácora y tiene dos versiones:

- **Versión del revisor:** interna, completa, con los indicativos marcados «no oficial». No se registra.
- **Versión del profesional:** solo se emite con el expediente revisado y desde la evaluación vigente sin resultados afectados. Lleva observaciones con su indicación al profesional y la sección de alcance. Su emisión queda registrada con una huella del contenido, verificable por archivo o por código.

## Levels

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | Funciones puras: proyección del modelo (revisor y profesional), indicación vigente y traslado, huella y normalización, código en bloques y prefijo, vigencia de emisiones, render determinista y extracción del modelo. | En memoria, con listas de eventos construidas en la prueba; sin bitácora. |
| Integration | Servicio del informe y `decidir`/`indicar` contra la bitácora real: `anexar_lote` transaccional, reglas de emisión, verificación que busca en todas las cadenas. | Dependencia real y descartable: un archivo SQLite nuevo en un directorio temporal por prueba, con las migraciones aplicadas. Nunca un almacén simulado. |
| Contract | La CLI frente a `contracts/cli.md` (subcomandos `informe`, `emitir`, `indicar`, `verificar-informe`, `emitidos` y `decidir --indicacion`; códigos de salida 0/1/2/3/5/6/7; errores `informe.*`; esquema `--json`) y la fachada frente a `contracts/public-api.md`. | La CLI se invoca como subproceso y se valida su salida contra el contrato. |
| E2E | Flujo completo por la entrada real: evaluar → decidir con indicación → visto bueno → emitir → verificar por archivo y por código → retirar una regla → emitidos afectado → reevaluar → emitir otra vez. | Subproceso sobre una bitácora descartable, con dos cuentas simuladas mediante el resolutor de identidad de pruebas. |
| Load | NFR «≤ 2 s p95 por operación» con el catálogo completo (~650 resultados). | La herramienta de medición que ya use el repo, o p. ej. k6 o Locust. Aquí basta cronometrar 20 repeticiones de cada operación desde la suite. |
| Component | <!-- N/A: no UI surface (target_surfaces: [library-sdk, cli]) --> | — |
| Visual-regression | <!-- N/A: no UI surface --> | — |
| E2E-through-UI | <!-- N/A: no UI surface --> | — |

## AC coverage

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-01 happy | la versión del revisor muestra todo, con indicativos marcados no oficiales | unit + integration | incluye cada resultado (también NO_APLICA), la cita, la versión, los valores con su procedencia y confianza, los indicativos «no oficial», la cobertura, «sin CEUS», las decisiones con su motivo, la huella de la evaluación y la marca «uso interno»; no se registra ningún evento |
| AC-02 happy | la versión del revisor de un expediente pendiente enumera lo que falta | unit | declara «pendiente de revisión humana» y lista los resultados por decidir, las normas sin reglas, el visto bueno y las indicaciones pendientes |
| AC-03 error | no se genera informe de un expediente o evaluación inexistentes | integration + contract | no se genera nada; el revisor lee que no están registrados |
| AC-04 happy | emitir la versión del profesional registra la emisión y devuelve la huella | integration + e2e | queda un evento de emisión con la evaluación de origen, la huella del informe y la del encabezado, quién y cuándo; se entregan el documento, la forma estructurada y el código |
| AC-05 domain invariant | no se emite la versión del profesional con el expediente pendiente | integration + contract | no hay evento de emisión; se explica que falta revisión humana y se listan los pendientes |
| AC-06 domain invariant | no se emite desde una evaluación que no es la vigente | integration | no se emite; se indica cuál es la evaluación vigente (una reproducción no cuenta como evaluación nueva) |
| AC-07 authorization | una persona sin rol de revisor no puede generar, emitir, verificar, listar ni indicar | integration + contract | cada operación se deniega sin revelar el contenido; también sin persona vinculada |
| AC-08 happy | cada observación dice qué, dónde, por qué con cita y qué hacer | unit | «falta el dato» si no se declaró; requisito sin límite en reglas de criterio; «ubicación no consta» si no hay hoja; bloqueantes primero; ningún motivo de decisión |
| AC-09 domain invariant | la versión del profesional no contiene nada sin respaldo | unit | sin indicativos, sin NO_APLICA, sin resultados de reglas no aprobadas sin veredicto humano; los cumplimientos solo como conteo por norma y tema |
| AC-10 cross-context | las observaciones que dependen de la zona sin CEUS lo dicen | unit | cada una indica que la zona se tomó del Documento Gráfico sin certificación |
| AC-11 happy | la primera página lleva nota preliminar, encabezado, normas con vigencia y código | unit | nota del Art. 3 con la aclaración del dictamen, «no consta» en los datos no entregados, normas con vigencia, versión del motor, código de huella en cada página; nunca «aprobado» |
| AC-12 happy | un informe emitido se verifica por archivo y por código e informa su vigencia | integration + e2e | coincide con una o más emisiones, lista expediente, evaluación, quién, cuándo y vigencia; por archivo compara la trazabilidad; por código regenera el contenido sin encabezado y avisa que el código no prueba la integridad de la copia |
| AC-13 error | un archivo alterado, una versión del revisor o un informe nunca emitido no se validan | unit + integration + contract | «no coincide»; si no es un original, se pide verificar por código |
| AC-14 cross-context | un retiro o una suspensión posteriores dejan afectado el informe emitido | unit + integration | marcado afectado con la regla o la norma y la fecha; al levantar la suspensión deja de estarlo y se conserva el período; el informe no se altera |
| AC-15 cross-context | una evaluación nueva deja reemplazado el informe; otra emisión con distinta huella lo deja sustituido | unit + integration | «reemplazado por una evaluación posterior» o «sustituida por la emisión de …»; una emisión con la misma huella no marca nada |
| AC-16 domain invariant | emitir dos veces lo mismo da la misma huella; una indicación nueva la cambia | unit + integration | misma huella con quién o cuándo distintos; dos entregas registradas; tildes compuestas o espacios no cambian la huella; una indicación posterior sí la cambia |
| AC-17 happy | la indicación al profesional se registra al decidir o después, sin tocar la decisión | integration + contract | decisión e indicación en una sola transacción; el complemento queda atribuido; la decisión y su motivo no cambian; vale para NO_CUMPLE no bloqueantes con o sin visto bueno |
| AC-18 domain invariant | no se emite mientras alguna observación no tenga indicación | integration | no se emite; se listan las observaciones sin indicación |
| AC-19 domain invariant | la sección de alcance sale siempre y nunca declara cumplimiento global | unit | declara las normas evaluadas, las reglas no evaluadas, las normas decididas a mano, la zona sin CEUS y el criterio del revisor; también sin limitaciones; nunca un «cumple» global |
| AC-20 cross-context | no se emite desde una evaluación con resultados afectados, y reevaluar desbloquea | unit + integration | se rechaza nombrando la regla o la norma; tras reevaluar (instantánea con el estado nuevo) la emisión procede |
| AC-21 error | no se indica sobre un resultado favorable, un descarte, un NO_APLICA ni una evaluación antigua | unit + integration | no se registra; se explica que solo se indica sobre observaciones de la evaluación vigente |
| AC-22 domain invariant | la versión del revisor de una evaluación antigua avisa que no es la vigente | unit | muestra el estado de esa evaluación y la referencia a la vigente |
| AC-23 domain invariant | una norma sin reglas decidida en contra es observación sin cita, con indicación obligatoria | unit + integration | rotulada «norma sin reglas cargadas: decisión del revisor», sin cita inventada; sin indicación, no se emite |
| AC-24 cross-context | la indicación se traslada al reevaluar solo si nada cambió | unit | se traslada si coinciden regla, versión, resultado y valores, y se marca «trasladada»; si algo cambió, queda como faltante |

## Edge cases / error paths

- Código impreso con menos de 16 caracteres → se rechaza como código demasiado corto.
- Código con espacios o guiones → se normaliza antes de buscar.
- Prefijo que coincide con dos emisiones del mismo expediente → se listan ambas.
- Archivo con otro `formato_informe` → «no verificable con esta versión» (salida 5), nunca «alterado».
- Documento con el texto visible editado y el modelo embebido intacto → «no coincide» (al volver a renderizar se detecta).
- Bloque de trazabilidad editado (otro emisor u otra fecha) → coincide la huella, pero se avisa que la trazabilidad no coincide (salida 3).
- Forma estructurada (JSON) sin cambios → coincide con la misma huella que el documento.
- Encabezado sin ningún dato → se emite con «no consta» en todos los campos.
- Indicación vacía o solo espacios → se rechaza.
- `decidir --indicacion` con `--descartar` o `--veredicto CUMPLE` → se rechaza sin registrar la decisión (transacción completa).
- Fallo a mitad de `anexar_lote` → no queda ni la decisión ni la indicación.
- Suspensión levantada antes de emitir → la evaluación no queda afectada y la emisión procede.
- Retiro anterior a la evaluación → no afecta (la instantánea ya lo refleja).
- Regenerar por código con eventos posteriores (indicación nueva) → el contenido regenerado es el de la emisión (corte temporal), no el actual.
- Bitácora bloqueada al emitir → salida 6, sin evento a medias.
- Texto con `<script>` o comillas en una indicación o en el encabezado → aparece escapado y no se ejecuta.

## Test data

- **Datos de partida:** se reutilizan los expedientes de `tests/casos/` y los ayudantes de `tests/apoyo.py`. Un constructor de escenario arma el registro génesis con dos aprobadores, un revisor DOYC y las reglas propuestas y aprobadas que la prueba necesite.
- **Proyección y vigencia puras:** listas de eventos construidas en memoria con la misma forma que el sobre de la bitácora.
- **Dependencia de integración:** archivo SQLite real y descartable con las migraciones; nunca un almacén simulado.
- **Aislamiento:** por prueba, con un directorio temporal nuevo y un resolutor de identidad de prueba para cambiar de cuenta.

## NFR validation (load)

- NFR «≤ 2 s p95 por operación (generar cualquiera de las versiones, emitir con su registro, verificar por archivo o por código) con el catálogo completo (~650 resultados)».
  - **Escenario:** una evaluación con el catálogo completo; 20 repeticiones de cada operación.
  - **Criterio:** el p95 de cada operación es ≤ 2 s.
  - **Disparador interno de §7:** si verificar supera 1 s, se registra una advertencia (no un fallo).
- NFR «100 % de regeneraciones … producen la misma huella».
  - **Escenario:** 50 regeneraciones de la misma emisión.
  - **Criterio:** una sola huella distinta.

## CI placement

- **En cada PR:** unit, integration y contract (la suite actual corre completa en torno a 1 min).
- **Programadas o antes de publicar:** e2e y load. Mientras la suite total siga por debajo de 90 s, pueden correr también en cada PR.
