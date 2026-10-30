---
status: Draft
owner: "desconocido@correo.invalid"
updated_at: "2026-09-27"
feature_size: "M"
contract_version: "0.3.0"
---

# Contrato CLI — informe-precheck

Amplía `motor-reglas-auditable/contracts/cli.md` (opciones globales `--bitacora` y `--json` e identidad sin cambios; los códigos de salida 0–6 conservan su significado y se suma el 7). Cada subcomando llama a un método de `public-api.md`. Todos exigen el rol `revisor_doyc` (flujo 9 · AC-07).

## Códigos de salida (los 0–6 sin cambios de significado; el 7 es nuevo)

| Código | En los subcomandos del informe |
|---|---|
| 0 | Informe generado o emitido; indicación registrada; verificación `coincide` (aunque la emisión esté reemplazada, sustituida o afectada: es información, no error); lista de emitidos |
| 1 | Error de uso: argumentos inválidos, archivo de encabezado ilegible, directorio de salida inexistente o sin permiso de escritura (se comprueba antes de llamar al servicio: no se registra nada) |
| 2 | Rechazo de negocio (tabla de errores) |
| 3 | Verificación `no_coincide`, o bloque de trazabilidad distinto del evento de emisión |
| 5 | `no_verificable_version`: la emisión existe pero su formato es de otra versión |
| 6 | Bitácora no disponible |
| 7 | Solo `emitir`: la emisión quedó registrada, pero sus archivos no se pudieron escribir. El mensaje da el número de la emisión y su código; volver a emitir con el mismo encabezado da la misma huella (otra entrega del mismo documento). Con `--json`, código `informe.emision_sin_archivos` y `detalles.evento`, `detalles.huella` |

## Archivos de salida

- `<ID>` en los nombres de archivo es el id del expediente si solo tiene `[A-Za-z0-9._-]` y ocupa como mucho 100 bytes; si no, cada otro carácter pasa a `_`, se acota a 100 bytes y se agrega `-` + 8 caracteres de su SHA-256 (determinista, sin choques entre ids distintos). Ningún id puede sacar un archivo del directorio `--salida`. Antes de llamar al servicio se comprueba que cada nombre final (y su temporal) quepa en el máximo del sistema de archivos (`PC_NAME_MAX`); si no, salida 1 sin registrar nada (re-revisión N2).
- Los dos archivos (HTML y JSON) se escriben primero en temporales del mismo directorio; los destinos que ya existían se respaldan (enlace duro o copia) y recién después se renombra con `os.replace`. Si algo falla, se borran los temporales y lo que esta escritura creó y se devuelven los respaldos a su lugar: el directorio queda exactamente como estaba, con el par previo intacto o sin archivos, nunca un par mezclado. El mensaje lo dice («no quedó ningún archivo» o «se conservan sin cambios los archivos previos: …»; si la restauración misma fallara, enumera lo que quedó y advierte que puede no formar un par). Si todo sale bien, se borran los respaldos (re-revisión N4, N4-bis).

## Subcomandos nuevos

### `informe` — US-01 · flujo 3

```
informe --expediente ID --evaluacion SEQ --salida DIRECTORIO [--encabezado ARCHIVO.json]
```
- Escribe `informe-revisor-<ID>-<SEQ>.html` y `.json` (versión del revisor, «uso interno»). No registra nada.
- `--encabezado`: JSON con `tramite`, `proyecto`, `finca`, `profesional`, `idoneidad` (todas opcionales; las ausentes salen «no consta»).
- Errores: `informe.expediente_inexistente` (expediente sin evaluaciones) e `informe.evaluacion_inexistente` (evaluación no registrada en el expediente), AC-03.

### `emitir` — US-02, US-03, US-04 · flujos 1 y 4

```
emitir --expediente ID --evaluacion SEQ --salida DIRECTORIO [--encabezado ARCHIVO.json]
```
- Escribe `informe-profesional-<ID>-<SEQ>-<huella[:8]>.html` y `.json`, registra la emisión e imprime el código de huella en bloques.
- Validar y registrar ocurren contra el mismo estado: si otra escritura entra en el expediente o en las reglas entre la validación y el registro, no se registra nada (`informe.emision_concurrente`).
- Errores: `informe.expediente_inexistente`, `informe.evaluacion_inexistente`, `informe.evaluacion_no_vigente` (AC-06; `detalles.vigente`), `informe.expediente_pendiente` (AC-05; `detalles.pendientes`), `informe.sin_indicacion` (AC-18; `detalles.observaciones`), `informe.resultados_afectados` (AC-20; `detalles.afectaciones`), `informe.emision_concurrente`. Salida 7 si la emisión quedó registrada y los archivos no se pudieron escribir.

### `indicar` — US-07 · flujo 5

```
indicar --expediente ID --evaluacion SEQ --regla ID|norma:NORMA --texto TEXTO
```
- Acepta NO_CUMPLE bloqueantes confirmados, veredictos desfavorables, NO_CUMPLE no bloqueantes oficiales (con o sin visto bueno) y normas sin reglas decididas en contra.
- Errores: `informe.indicacion_vacia`, `informe.expediente_inexistente`, `informe.evaluacion_inexistente`, `informe.evaluacion_no_vigente`, `informe.indicacion_no_aplicable` (resultado favorable, NO_CUMPLE descartado, NO_APLICA o regla sin resultado; AC-21).

### `verificar-informe` — US-05 · flujos 2 y 7

```
verificar-informe (--archivo RUTA | --expediente ID --codigo CODIGO) [--salida DIRECTORIO]
```
- `--archivo`: documento o forma estructurada originales; busca en todas las emisiones y dice a qué expediente pertenece.
- `--codigo`: huella completa o sus primeros ≥ 16 caracteres (se ignoran espacios y guiones); con `--salida` escribe el contenido regenerado (`regenerado-<ID>-<seq>.html`), con el código de la emisión y la marca «Contenido regenerado para comparación — encabezado no conservado». El aviso dice además cuál es la emisión vigente.
- Salida: resultado, emisiones con quién, cuándo y vigencia (`vigente`, `reemplazado`, `sustituida`, afectaciones), y el aviso correspondiente.
- Errores: `informe.codigo_corto`, `informe.archivo_no_verificable` (no es un original del sistema: usar `--codigo`).

### `emitidos` — US-06 · flujo 8

```
emitidos --expediente ID
```
- Lista cada emisión con evaluación, huella, quién, cuándo, vigencia y afectaciones con su período: «afectada» si sigue en pie, «estuvo afectada (levantada …)» si se levantó; no lista los períodos cerrados antes de la emisión.

## Cambio en un subcomando existente (enmienda, ADR-0003)

### `decidir`

```
decidir --expediente ID --evaluacion SEQ --regla ID (--confirmar | --descartar | --veredicto CUMPLE|NO_CUMPLE) --motivo TEXTO [--indicacion TEXTO]
```
- `--indicacion`: indicación al profesional, registrada en la misma transacción que la decisión. Solo con `--confirmar` o con `--veredicto NO_CUMPLE`; si no, `informe.indicacion_no_aplicable` y no se registra nada.

## Tabla de errores nuevos

| `codigo` | Mensaje (plantilla) | AC / flujo |
|---|---|---|
| `informe.expediente_inexistente` | El expediente {expediente} no está registrado en la bitácora: no tiene ninguna evaluación. | AC-03 · flujos 1, 3 y 5 |
| `informe.evaluacion_inexistente` | La evaluación {evaluacion} no está registrada en el expediente {expediente}. | AC-03 · flujos 1, 3 y 5 |
| `informe.evaluacion_no_vigente` | La evaluación {evaluacion} no es la vigente del expediente {expediente}: la versión del profesional y las indicaciones solo se hacen sobre la evaluación vigente, la {vigente} (la última registrada; una reproducción no cuenta). | AC-06, AC-21 · flujos 1 y 5 |
| `informe.expediente_pendiente` | La versión del profesional solo se emite con el expediente revisado; falta: {pendientes}. | AC-05 · flujo 1 |
| `informe.sin_indicacion` | Toda observación necesita su indicación al profesional; faltan: {observaciones}. | AC-18 · flujo 1 |
| `informe.resultados_afectados` | La evaluación tiene resultados afectados por un retiro o una suspensión ({afectaciones}); reevalúe el expediente. Cada afectación: `<tipo> <regla vN o norma> desde <fecha>`. | AC-20 · flujo 1 |
| `informe.indicacion_no_aplicable` | Solo se escriben indicaciones sobre observaciones de la evaluación vigente. | AC-21 · flujo 5 |
| `informe.indicacion_vacia` | La indicación al profesional no puede estar vacía. | flujo 5 |
| `informe.emision_concurrente` | El expediente o las reglas cambiaron mientras se emitía; no se registró la emisión: vuelva a emitir. | M6 de la revisión · flujo 1 |
| `informe.codigo_corto` | El código de huella debe tener al menos 16 caracteres. | AC-12 · flujo 7 |
| `informe.archivo_no_verificable` | El archivo no es un documento ni una forma estructurada del PreCheck; verifíquelo con el código impreso. | AC-13 · flujo 2 |

Se reutilizan `identidad.cuenta_no_vinculada` e `identidad.sin_rol`. Desde la revisión 2026-09-27 (B2), `informe`, `emitir` e `indicar` usan códigos propios para el expediente o la evaluación inexistentes y la evaluación no vigente, con mensajes que nombran el expediente, la evaluación y la vigente; `decidir` sigue con `expediente.evaluacion_*`.

El estado del expediente se muestra como «pendiente de revisión humana» (el mismo término del informe, AC-02); en `--json`, `estado` sigue valiendo `pendiente`.

## Ejemplos (datos de prueba)

```
$ python3 -m precheck emitir --expediente EXP-TEST-0001 --evaluacion 1 --salida /tmp/inf
ERROR informe.expediente_pendiente: La versión del profesional solo se emite con el expediente revisado; falta: PLOT-ZM6-LOTE-FRENTE, visto bueno.   (salida 2)

$ python3 -m precheck emitir --expediente EXP-TEST-0001 --evaluacion 3 --salida /tmp/inf --encabezado enc.json
Emitido: evento 9 · informe-profesional-EXP-TEST-0001-3-4f1c9a2e.html
Código: 4f1c 9a2e 77d0 1b3c 58aa …

$ python3 -m precheck verificar-informe --expediente EXP-TEST-0001 --codigo "4f1c 9a2e 77d0 1b3c"
coincide · emisión 9 · evaluación 3 · P-0002 · 2026-09-27T15:04:11Z · vigente
Aviso: el código prueba que la emisión existe, no que la copia esté íntegra.
```
