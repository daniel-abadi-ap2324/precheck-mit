---
status: Draft
owner: "desconocido@correo.invalid"
updated_at: "2026-09-27"
feature_size: "M"
contract_version: "0.2.0"
---

# Contrato CLI — motor-reglas-auditable

> **0.2.0 (2026-09-27):** enmendado por `informe-precheck` (ADR-0003 de esa funcionalidad): `decidir` acepta `--indicacion` / `indicacion=`, y el puerto `RepositorioBitacora` suma `anexar_lote` y `cadenas`, y `anexar` acepta `cabezas` (control de concurrencia optimista: seq esperado de cada cadena, comprobado en la misma transacción; `emitir` y `evaluar` lo usan). `evaluar` puede lanzar `expediente.evaluacion_concurrente` (re-revisión N1). Los subcomandos y métodos del informe están en `docs/features/informe-precheck/contracts/`.

Derivado de `data-model.md`, `sad.md` §6 (flujos 1–14) y `spec.md` §4/§5. La CLI es delgada: cada subcomando llama a un método de la fachada `PreCheck` (ver `public-api.md`) y solo traduce argumentos, salida y códigos de salida.

## Invocación y opciones globales

```
python3 -m precheck [--bitacora RUTA] [--json] <subcomando> [opciones]
```

| Opción | Por defecto | Descripción |
|---|---|---|
| `--bitacora RUTA` | variable `PRECHECK_BITACORA`, si no `./bitacora.sqlite3` | Archivo SQLite de la bitácora. Si no existe, se crea con las migraciones aplicadas. |
| `--json` | apagado | Salida JSON estable (el esquema de cada subcomando es el tipo de retorno en `public-api.md`). Sin la opción, texto en español para el revisor. |

**Identidad.** La CLI no recibe la persona por argumento: el núcleo la resuelve desde la cuenta del sistema operativo (UID efectivo del proceso, no `LOGNAME`/`USER`) con `ResolutorIdentidad` (ADR-0006, sad §8). Una cuenta sin vínculo recibe `identidad.cuenta_no_vinculada` en todo subcomando que exige persona (todos salvo `verificar` y `sellar`). Los subcomandos de expediente exigen el rol `revisor_doyc` (sad §6 flujo 14).

**`--motivo`.** En todos los subcomandos que lo piden, su ausencia o un motivo en blanco se rechaza como error de negocio (`decision.motivo_obligatorio` o `gobierno.motivo_obligatorio`, salida 2), no como error de uso.

## Códigos de salida

| Código | Significado |
|---|---|
| 0 | Operación completada (una evaluación con NO_CUMPLE también sale con 0: es un resultado, no un error) |
| 1 | Error de uso: argumentos inválidos, archivo ilegible o valor inválido (`ValueError`); también si no se puede abrir la bitácora por un error del sistema de archivos |
| 2 | Rechazo de negocio (cualquier `codigo` de la tabla de errores) |
| 3 | Integridad comprometida: bitácora alterada, que no coincide con el sello, `verificar` sin sello en el destino habiendo sellos registrados, o la base rechaza la operación (error de SQLite que no es de bloqueo) |
| 4 | Reproducción con discrepancias |
| 5 | No reproducible con esta versión del motor |
| 6 | Operación no disponible: la bitácora está bloqueada u ocupada, también al abrirla; reintentar (no es una alarma de integridad). Con `--json`: `{"codigo": "operacion.bitacora_no_disponible", …}` |

Los errores de negocio salen por stderr como `ERROR <codigo>: <mensaje>`; con `--json`, `{"codigo": ..., "mensaje": ..., "detalles": {...}}`. Los de integridad salen como `ERROR integridad: …` o `ERROR bitácora: …` (sin JSON); los de uso, como `ERROR: …`.

## Subcomandos: expedientes (rol `revisor_doyc`)

### `evaluar` — US-01, US-02, US-10 · flujos 1 y 3

```
evaluar --expediente ID --hechos ARCHIVO.json [--umbral-confianza 0.85]
```
- `--hechos`: hechos con el formato del esquema de reglas (`{valor, confianza, fuente}`). Hechos requeridos: `expediente.fecha_presentacion` en formato `AAAA-MM-DD` y con confianza no menor al umbral (si no, `expediente.fecha_invalida`). Hechos opcionales con tratamiento especial: `lote.ceus` (prevalece) y `lote.codigo_zona` (leído del Documento Gráfico; es el hecho que usan las reglas en `aplica_si`).
- `--umbral-confianza`: umbral global; una regla puede subirlo pero nunca bajarlo (spec §8, default).
- Salida: `Evaluacion` con resultado oficial, indicativo, cita, versión, valores y fuente por regla; `Cobertura`; estado `pendiente`; `hash` del evento.
- Errores: `expediente.sin_fecha_presentacion` (AC-03), `expediente.fecha_invalida`, `expediente.evaluacion_concurrente` (la cadena de reglas —gobierno de reglas, personas o sello— cambió mientras se evaluaba: no se registra nada; reintentar), `identidad.sin_rol`, `identidad.cuenta_no_vinculada`.
- Concurrencia (enmienda informe-precheck, re-revisión N1): la cabeza de la cadena de reglas se toma antes de leer su estado y se exige al registrar dentro de la misma transacción exclusiva.

### `decidir` — US-05 · flujo 7

```
decidir --expediente ID --evaluacion SEQ --regla ID (--confirmar | --descartar | --veredicto CUMPLE|NO_CUMPLE) --motivo TEXTO
```
- `--confirmar` o `--descartar` para un NO_CUMPLE bloqueante; `--veredicto` para un REQUIERE_REVISION, o para una norma sin reglas cargadas con `--regla norma:<NORMA>` (p. ej. `norma:MIVIOT`).
- Errores: `decision.motivo_obligatorio` (AC-14), `decision.accion_no_aplicable` (por ejemplo, un veredicto sobre un NO_CUMPLE), `expediente.evaluacion_inexistente`, `expediente.evaluacion_no_vigente` (hay una evaluación más reciente), `identidad.sin_rol`.

### `visto-bueno` — US-06 · flujo 8

```
visto-bueno --expediente ID --evaluacion SEQ (--listar | --dar [--confirmar-sin-ceus])
```
- `--listar`: CUMPLE y NO_CUMPLE de observación, con los datos declarados de los que depende cada uno.
- `--dar`: registra el visto bueno único. Es obligatorio aun sin resultados aplicables. Si algún resultado depende de la zona sin CEUS, exige `--confirmar-sin-ceus` (error `decision.confirmacion_sin_ceus`).
- `--confirmar-sin-ceus` solo tiene efecto con `--dar`.
- Errores: `expediente.evaluacion_inexistente`, `expediente.evaluacion_no_vigente` (hay una evaluación más reciente), `identidad.sin_rol`.

### `estado` — US-06 · flujo 8 (AC-16)

```
estado --expediente ID
```
- Salida: `pendiente` (con la lista de lo que falta: reglas por decidir, `norma:<NORMA>` sin reglas y `visto bueno`) o `revisado`. Nunca «aprobado».
- Errores: `expediente.evaluacion_inexistente` (el expediente no tiene evaluaciones), `identidad.sin_rol`.

### `reproducir` — US-07 · flujo 9

```
reproducir --expediente ID --evaluacion SEQ
```
- Salida: `coincide`, `discrepancias` (por regla: original y nuevo) o `no_reproducible_version`. Siempre registra el intento.
- Acepta cualquier evaluación registrada, no solo la vigente.
- Salida 4 con discrepancias; salida 5 con otra versión del motor.
- Errores: `expediente.evaluacion_inexistente`, `identidad.sin_rol`.

## Subcomandos: integridad

### `verificar` — US-08 · flujo 10

```
verificar (--expediente ID | --reglas | --todo) [--sello ARCHIVO] [--destino DIRECTORIO]
```
- Recalcula las cadenas y, con `--todo`, el contenido de cada regla: cada fila contra su hash y cada propuesta de la cadena contra el contenido que referencia (detecta filas reemplazadas con el hash recalculado y filas borradas). Con `--sello`, compara las cabezas con ese sello (AC-19b), que prevalece sobre `--destino`; sin él, usa el último sello del destino de anclaje (`--destino` o la variable `PRECHECK_ANCLAJE`), sin crear el directorio. Si hay sellos registrados y no se encuentra ninguno en el destino (no indicado, mal escrito o vacío), sale con 3: no se da por buena una bitácora sin compararla con el anclaje externo.
- Salida 3 si la cadena se rompe (indica el evento), si hay contenido de reglas alterado o si no coincide con el sello (indica la cadena). Una cadena que no estaba sellada se informa «sin sello», no «coincide». No resuelve persona: cualquiera puede verificar, aun sin cuenta vinculada.

### `sellar` — flujo 10 (programado a diario)

```
sellar --destino DIRECTORIO
```
- Calcula el hash conjunto de las cabezas, lo registra en la cadena de reglas y escribe `sello-<fecha>.json` en el destino (adaptador de archivo de `DestinoAnclaje`, ADR-0007). El actor es `sistema:precheck@<version>` con rol `sistema`; no resuelve persona.

## Subcomandos: gobierno de reglas

### `proponer` — US-03 · flujo 4 (rol `redactor`)

```
proponer --catalogo ARCHIVO.json [--normativa TEXTO.md ...]
```
- Registra como borrador cada versión del catálogo cuya cita aparezca literal en la normativa. También sirve para cargar los catálogos existentes de `reglas/`.
- `--normativa` es repetible y opcional; sin ella se usan los textos por defecto (`NORMATIVA_POR_DEFECTO`: Acuerdo 110, fichas del PLOT, Acuerdo 128 de 2026 y Acuerdo 270 con su Anexo 2).
- Salida: por regla, `registrada` o el error. Una versión ya registrada con el mismo contenido se informa como `sin_cambios`.
- Errores por regla (van en la salida con estado `error`, salida 0): `regla.cita_no_encontrada` (AC-08), `regla.expresion_invalida` (condición o `aplica_si` fuera de la gramática), `regla.inmutable` (misma regla y versión con otro contenido, AC-12), y desde ADR-0017 `regla.valor_no_permitido`, `regla.clasificacion_incoherente` y `regla.fundamento_no_encontrado` (severidad, subsanación y fundamento, solo si la regla trae esos campos).
- Errores del subcomando (salida 2): `identidad.sin_rol` (sin rol `redactor`), `identidad.cuenta_no_vinculada`.

### `aprobar` · `rechazar` · `retirar` — US-04, US-09 · flujos 2 y 5 (rol `aprobador` designado)

```
aprobar  --regla ID --version N
rechazar --regla ID --version N --motivo TEXTO
retirar  --regla ID --version N --motivo TEXTO
```
- Errores: `gobierno.auto_aprobacion` (AC-10), `gobierno.sin_designacion` (AC-11), `regla.version_inexistente`, `regla.vigencia_solapada` (otra versión aprobada cubre el mismo rango), `regla.estado_invalido` (por ejemplo, retirar un borrador), `gobierno.motivo_obligatorio`.
- `retirar` devuelve la lista de resultados registrados que usaron la versión (AC-20b).

### `suspender` · `levantar` · `confirmar` — US-09 · flujo 6 (rol `aprobador` designado)

```
suspender --norma NORMA --motivo TEXTO
levantar  --norma NORMA --motivo TEXTO
confirmar --propuesta SEQ
```
- `suspender` y `levantar` crean una propuesta que no rige hasta que otra persona la confirma con `confirmar`.
- Al confirmarse una suspensión, se listan los expedientes afectados con sus evaluaciones y las reglas que dependían oficialmente de la norma (versión aprobada al evaluar, AC-20); los expedientes donde la norma no aplicó no se marcan. Repetir `confirmar` sobre una suspensión ya confirmada (exige un aprobador) completa un marcado interrumpido sin duplicarlo, y no hace nada si la suspensión ya se levantó.
- `confirmar` es genérico: confirma también las propuestas de `vincular-cuenta` y `designar` (ver abajo).
- Errores: `gobierno.sin_segunda_persona`, `gobierno.propuesta_inexistente`, `gobierno.propuesta_ya_resuelta`, `gobierno.norma_desconocida`, `gobierno.motivo_obligatorio`, `gobierno.sin_designacion`.

### `inicializar` · `vincular-cuenta` · `designar` — personas (ADR-0006) · flujos 11–13

```
inicializar     --persona ID --nombre TEXTO --segunda-persona ID --segundo-nombre TEXTO --segunda-cuenta CUENTA
vincular-cuenta --persona ID --nombre TEXTO --cuenta CUENTA
designar        --persona ID --rol redactor|revisor_doyc|aprobador --motivo TEXTO
```
- `inicializar`: solo con la cadena de reglas vacía de personas. Registra a quien lo ejecuta y a una segunda persona (distinta y con otra cuenta) como los dos aprobadores génesis. Es deuda aceptada (sad §11).
- `vincular-cuenta` y `designar` crean propuestas que se confirman con `confirmar` (cuatro ojos). El vínculo de una persona nueva lo acepta ella misma ejecutando `confirmar` desde la cuenta propuesta; el vínculo de una persona existente y toda designación los confirma un aprobador distinto del proponente y del sujeto.
- `vincular-cuenta` y `designar` exigen que quien propone sea aprobador. `designar` exige que la persona sujeto ya esté en el registro.
- Errores: `gobierno.ya_inicializado` y `gobierno.sin_segunda_persona` (`inicializar`); `identidad.cuenta_ya_vinculada` (`vincular-cuenta` y su `confirmar`); `gobierno.motivo_obligatorio` (`designar`); `identidad.cuenta_no_vinculada` (quien ejecuta sin vínculo, o `designar` sobre una persona que no está en el registro); `gobierno.sin_designacion` y `gobierno.sin_segunda_persona` (al proponer o confirmar).

## Tabla de errores

| `codigo` | Mensaje (plantilla) | AC / flujo |
|---|---|---|
| `expediente.sin_fecha_presentacion` | Falta la fecha de presentación; sin ella no se puede determinar la norma aplicable. | AC-03 · flujo 1 |
| `expediente.fecha_invalida` | La fecha de presentación no es una fecha AAAA-MM-DD confiable. | review M6 · flujo 1 |
| `expediente.evaluacion_inexistente` | La evaluación indicada no existe en la bitácora del expediente. | flujos 7–9 |
| `expediente.evaluacion_no_vigente` | Hay una evaluación más reciente; decida sobre ella. | flujos 7, 8 |
| `expediente.evaluacion_concurrente` | La cadena de reglas cambió mientras se evaluaba el expediente {expediente} (gobierno de reglas, personas o sello); no se registró la evaluación: vuelva a evaluar. | informe-precheck re-revisión N1 · flujo 1 |
| `decision.motivo_obligatorio` | El motivo es obligatorio. | AC-14 · flujo 7 |
| `decision.accion_no_aplicable` | Esa acción no aplica al resultado indicado. | flujo 7 |
| `decision.confirmacion_sin_ceus` | Hay resultados que dependen de la zona sin CEUS: confirme explícitamente el visto bueno. | review M7 · flujo 8 |
| `regla.cita_no_encontrada` | La cita no se encuentra en el texto fuente. | AC-08 · flujo 4 |
| `regla.expresion_invalida` | La condición o el aplica_si no respeta la gramática de reglas. | review A3 · flujo 4 |
| `regla.inmutable` | Una regla registrada no se edita; cree una versión nueva. | AC-12 · flujo 5 |
| `regla.valor_no_permitido` | La severidad, la subsanación, el tipo o el criterio del fundamento no es un valor permitido (ADR-0017). | ADR-0017 · flujo 4 |
| `regla.clasificacion_incoherente` | La severidad, la subsanación y el criterio no son coherentes entre sí (ADR-0017). | ADR-0017 · flujo 4 |
| `regla.fundamento_no_encontrado` | La cita del fundamento no se encuentra en el texto fuente. | ADR-0017 · flujo 4 |
| `regla.version_inexistente` | La versión indicada no existe. | flujos 2, 5 |
| `regla.vigencia_solapada` | Ya hay una versión aprobada cuya vigencia se solapa. | ADR-0005 |
| `regla.estado_invalido` | La acción no es válida en el estado actual de la versión. | flujo 5 |
| `gobierno.auto_aprobacion` | Nadie puede aprobar una regla que redactó. | AC-10 · flujo 2 |
| `gobierno.sin_designacion` | Solo un revisor aprobador designado puede hacerlo. | AC-11 · flujos 2, 12, 13 |
| `gobierno.sin_segunda_persona` | Requiere la confirmación de otra persona. | flujos 6, 11–13 |
| `gobierno.motivo_obligatorio` | El motivo es obligatorio. | flujos 5, 6, 13 |
| `gobierno.propuesta_inexistente` | La propuesta indicada no existe. | flujos 6, 12, 13 |
| `gobierno.propuesta_ya_resuelta` | La propuesta ya fue confirmada. | flujos 6, 12, 13 |
| `gobierno.norma_desconocida` | La norma indicada no existe en la configuración de normas. | flujo 6 |
| `gobierno.ya_inicializado` | El registro de personas ya fue inicializado. | ADR-0006 · flujo 11 |
| `identidad.cuenta_no_vinculada` | Su cuenta no está vinculada a una persona del registro. | ADR-0006 · flujos 12–14 |
| `identidad.cuenta_ya_vinculada` | La cuenta ya está vinculada a otra persona. | ADR-0006 · flujo 12 |
| `identidad.sin_rol` | Su persona no tiene el rol necesario para esta acción. | spec §6.1 · flujo 14 |

## Ejemplos (datos de prueba)

```
$ python3 -m precheck evaluar --expediente EXP-TEST-0001 --hechos hechos.json   # plot_1zm6_excede.json + expediente.fecha_presentacion
Expediente EXP-TEST-0001 · presentado 2025-06-01 · evaluación #1 · pendiente de revisión
  …
  REQUIERE_REVISION  PLOT-ZM6-LOTE-FRENTE v1  (indicativo: NO_CUMPLE; regla en borrador)
      «16 m» · lote.norma_aplicable = PLOT-A61-2021 (gis, confianza 0.95), lote.codigo_zona = 1ZM6 (gis, confianza 0.97), lote.frente_m = 15.2 (s/f, confianza 0.95)
      regla en borrador: resultado no oficial (condición evaluada) · sin CEUS
  …
Cobertura: A110-2025 (9 reglas), PLOT-A61-2021 (7 reglas) · sin reglas: — · reglas sin aprobar: 16
  Temas PLOT-A61-2021: ACERA, ALTURA, AREA, DENSIDAD, FRENTE, OCUPACION, RETIROS
Zona usada: 1ZM6 (CEUS: —; Documento Gráfico: 1ZM6)
Registrado: evento 1 · hash dca48b6f92c7…

$ python3 -m precheck decidir --expediente EXP-TEST-0001 --evaluacion 1 --regla PLOT-ZM6-LOTE-FRENTE --descartar
ERROR decision.motivo_obligatorio: El motivo es obligatorio.          (salida 2)

$ python3 -m precheck --json aprobar --regla A110-TEST-X --version 1
{"codigo": "gobierno.auto_aprobacion", "mensaje": "Nadie puede aprobar una regla que redactó.", "detalles": {"persona": "P-0001"}}
```
