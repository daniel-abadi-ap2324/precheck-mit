# Reporte de sincronización del contrato — motor-reglas-auditable (2026-09-27)

Forma del contrato: `cli` → `contracts/cli.md`; `library-sdk` → `contracts/public-api.md` (leído de `sad.md` `target_surfaces`). No hay flujos asíncronos (`sellar` es un comando programado, no un mensaje), así que no hay `events.md`. Entradas: `data-model.md` (presente), `sad.md` §6 flujos 1–10 (presente), `spec.md` §4/§5 (presente).

## A. Origen de los campos

| schema_path | origin | confidence |
|---|---|---|
| evaluar.expediente_id | data-model.md → cadena.id (`expediente:<id>`) | high |
| evaluar.hechos | docs/contexto/esquema-reglas.md «Hecho del proyecto» → payload de `evaluacion` | high |
| evaluar.hechos.expediente.fecha_presentacion | spec AC-02/AC-03 → payload de `evaluacion` | high |
| evaluar.hechos.lote.ceus / lote.codigo_zona | spec AC-04 → payload de `evaluacion` | medium (nombres de hecho nuevos) |
| evaluar.umbral | spec AC-05 + §8 (default 0.85) → payload | high |
| Evaluacion.seq / hash | data-model.md → evento.seq / evento.hash | high |
| Evaluacion.version_motor | sad §8 «Versión del motor» → payload | high |
| ResultadoRegla.regla_id / version / hash_contenido | data-model.md → contenido_regla / uso_regla | high |
| ResultadoRegla.estado_regla | ADR-0005 (derivado de la cadena de reglas) | high |
| ResultadoRegla.resultado / indicativo / motivo / valores_usados | esquema-reglas «Resultado por regla» + AC-06 | high |
| ResultadoRegla.cita_textual / fuente_norma / articulo | contenido_regla.contenido → `fuente.*` | high |
| ResultadoRegla.advertencias | spec §8 (sin CEUS) + AC-04 (discrepancia) | medium |
| Cobertura.* | spec AC-21 | medium (campo solo de respuesta) |
| decidir.accion / veredicto / motivo | spec AC-13/AC-14 + sad §8 «Decisión humana» → payload de `decision` | high |
| EstadoExpediente.estado / pendientes | spec AC-16, derivado de los eventos | high |
| Reproduccion.* | spec AC-17/AC-18 + sad §8 → payload de `reproduccion` | high |
| Verificacion.* / Sello.* | spec AC-19/AC-19b, ADR-0007 → evento `sello` | high |
| proponer.catalogo | esquema-reglas «Regla» → contenido_regla.contenido | high |
| aprobar/rechazar/retirar.regla_id, version, motivo | data-model.md → contenido_regla + eventos de la cadena de reglas | high |
| suspender/levantar.norma, motivo · confirmar.propuesta | ADR-0008 → eventos `suspension_*` / `levantamiento_*` (seq de la propuesta) | high |
| inicializar/vincular-cuenta/designar.* | ADR-0006 → eventos `designacion_*`, `vinculo_cuenta` | medium (sin flujo en §6, ver OQ) |
| EventoRegistrado.* | data-model.md → evento.* | high |

## B. Checklist de desfase

1. **Comando ↔ data-model** (core): ✓. Cada subcomando lee o anexa eventos de `cadena`/`evento`, y `proponer` y `evaluar` escriben además `contenido_regla` y `uso_regla`.
2. **Código de error ↔ registro del repo** (core): ✓ con nota. El repo no tiene registro central de errores (hoy solo existe `DatoFaltante`, `motor.py:20`). Los 21 códigos son la propuesta del contrato; `implement` crea `ErrorPreCheck` y sus subclases con esta tabla.
3. **Validación ↔ restricción** (core): ✓. `version ≥ 1`, hash de 64 caracteres y JSON válido coinciden con los CHECK de las migraciones. Motivo obligatorio (AC-14) y umbral en [0, 1] se validan en el núcleo.
4. **Contrato ↔ secuencias** (soporte): ✓. Cada rama `alt` de los flujos 1–10 tiene un código o un resultado. Ver la cobertura inversa.

## Cobertura inversa

- **AC → operación:** los 23 AC están cubiertos. AC-01–06 y AC-21 → `evaluar`; AC-07, AC-08 y AC-12 → `proponer`; AC-09–11 → `aprobar`; AC-13 y AC-14 → `decidir`; AC-15 → `visto-bueno`; AC-16 → `estado`; AC-17 y AC-18 → `reproducir`; AC-19 y AC-19b → `verificar`; AC-20 → `suspender` + `confirmar`; AC-20b → `retirar`.
- **Operación → US:** todas mapean a una historia, salvo `inicializar`, `vincular-cuenta` y `designar`, que vienen de ADR-0006 y de spec §8 (identidad), sin historia propia.
- **Huecos detectados arriba** (resueltos con el usuario como Save-as-OQ con dueño en la etapa de origen):
  - `identidad.sin_rol`: ningún AC ni flujo cubre la autorización del Revisor DOYC para evaluar, decidir o dar visto bueno. El contrato ya lo exige. OQ para `specify` (AC) y `sequences` (rama), antes de sdd:tasks.
  - Registro de personas: no hay flujo de `inicializar`, `vincular-cuenta` ni `designar`, ni historia de usuario. OQ para `sequences` (y `specify` si hace falta una historia), antes de sdd:tasks.

## Lint

No aplica `spectral`: no hay OpenAPI. Se verificó que cada subcomando tiene un método en `public-api.md` y cada código aparece en la tabla de errores.

## Reconciliación 2026-09-27

Modo reconcile: el código pasó la revisión (`_review/review-2026-09-27.md`), así que los documentos del contrato siguen al código. No se modificó código. `contract_version` de `cli.md` y `public-api.md` pasa de 0.1.0 a 0.1.1: solo aclaraciones y correcciones de la documentación, sin cambios de interfaz.

### Qué se comparó

- `precheck/cli.py`: subcomandos, opciones de argparse (obligatorias, repetibles, excluyentes, `choices`), códigos de salida y formato de los errores y de la salida en texto.
- `precheck/__init__.py`: firma de `abrir` y métodos de `PreCheck`. También `precheck/auditoria/puertos.py`, `precheck/personas/registro.py` (`ResolutorCuentaSO`) y los dataclasses de retorno.
- `precheck/errores.py`: los 24 códigos de `CODIGOS` contra la tabla de errores de `cli.md`. Coinciden código por código y mensaje por mensaje. No hay desvíos.
- Qué errores lanza cada servicio (`expediente`, `reglas`, `personas`, `auditoria/sello`) contra las listas de errores de cada subcomando.
- El ejemplo de `evaluar`, ejecutado contra el código con `tests/casos/plot_1zm6_excede.json` más la fecha de presentación.

### Desvíos corregidos en `cli.md`

| Tema | Antes | Ahora (según el código) |
|---|---|---|
| `proponer --normativa` | Obligatoria | Opcional y repetible. Sin ella se usa `NORMATIVA_POR_DEFECTO`. |
| `proponer`, errores | Solo errores por regla | Los errores por regla van en la salida con estado `error` y salida 0. Además, `identidad.sin_rol` y `identidad.cuenta_no_vinculada` salen con 2. |
| `verificar --sello / --destino` | Excluyentes | Se pueden combinar. `--sello` prevalece. |
| `verificar` y `sellar` | «Cualquier rol puede verificar» | No resuelven persona. `sellar` usa el rol `sistema`. |
| `decidir`, errores | Sin `expediente.evaluacion_no_vigente` | Se agregó. |
| `visto-bueno`, errores | Sin `expediente.evaluacion_inexistente` | Se agregó. `--confirmar-sin-ceus` solo tiene efecto con `--dar`. |
| `estado` y `reproducir`, errores | No figuraban | `expediente.evaluacion_inexistente` e `identidad.sin_rol`. `reproducir` acepta evaluaciones que no son la vigente. |
| `suspender`, `levantar` y `confirmar`, errores | Faltaban `gobierno.motivo_obligatorio` y `gobierno.sin_designacion` | Se agregaron. Se aclara que `confirmar` también confirma vínculos y designaciones. |
| `inicializar`, `vincular-cuenta` y `designar`, errores | Faltaban `gobierno.motivo_obligatorio` e `identidad.cuenta_no_vinculada` | Se agregaron, con el subcomando al que aplica cada uno. `designar` exige que el sujeto esté en el registro. |
| Códigos de salida 1 y 3 | 1: uso. 3: alteración o sello. | 1 también por `ValueError` y por un `OSError` al abrir. 3 también si `verificar` no encuentra un sello en el destino y hay sellos registrados, o si SQLite rechaza la operación sin que sea un bloqueo. |
| Formato de los errores | Solo `ERROR <codigo>` | Además `ERROR integridad: …`, `ERROR bitácora: …` y `ERROR: …`, sin JSON. |
| Identidad | «Cuenta del SO» | UID efectivo, no `LOGNAME`/`USER`. `verificar` y `sellar` no la exigen. Los subcomandos de expediente exigen `revisor_doyc`. |
| Ejemplo de `evaluar` | `plot_1zm6_excede.json` sin fecha (en realidad sale `expediente.sin_fecha_presentacion`) y un formato de cobertura que no es el real | Salida real (abreviada) con la fecha agregada: cobertura, temas, zona usada y hash de 12 caracteres. |
| Referencias a flujos | sad §6 flujos 1–10. `identidad.sin_rol` → «OQ en spec §8». | Flujos 1–14. La tabla de errores apunta a los flujos 11–14. |

### Desvíos corregidos en `public-api.md`

| Tema | Antes | Ahora (según el código) |
|---|---|---|
| `abrir(normativa=…)` | Obligatorio | Opcional. Por defecto, `NORMATIVA_POR_DEFECTO`. |
| `PreCheck.cerrar()` | No figuraba | Se documenta. |
| `ResolutorCuentaSO` | `getpass.getuser()` | `pwd.getpwuid(os.geteuid())` (review A1). |
| `RepositorioBitacora` | Sin `evento(cadena_id, seq)` | Se agregó. También se mencionan `cadenas()` y `contenidos_alterados()` del adaptador SQLite. |
| `DestinoArchivo` | `(directorio)` | `(directorio, crear=True)`. |
| «Cada método resuelve la persona» | Todos | `verificar`, `sellar` y `estado_regla` no la resuelven. |
| `estado_regla` | Retorna `EstadoRegla` y `en: date \| str` | Retorna `Estado \| None`. `en` también acepta `datetime`. |
| Tipos | `fecha_presentacion: date`, `norma_aplicable: str`, `severidad` no opcional, `temas_evaluados` obligatorio | `str`, `str \| None`, `… \| None` y `… \| None = None`. `advertencias` vale `()` por defecto. `pendientes` incluye `norma:<NORMA>` y `visto bueno`. |
| Tipos de retorno sin definir | `ResultadoPropuesta`, `Retiro` y `Confirmacion` | Se agregaron a la sección Tipos. |
| Errores | Sin `IntegridadComprometida` ni `ValueError` | Se documentan los dos, y `CODIGOS`. |
| `confirmar`, `inicializar`, `vincular_cuenta` y `designar` | Sin flujo | Apuntan a los flujos 11–13 de sad §6. |

### Huecos de la sección anterior que quedan cerrados

- `identidad.sin_rol`: la rama de secuencia está en el flujo 14 de sad §6. El AC propio sigue pendiente, a cargo de `specify`.
- Registro de personas: está en los flujos 11 a 13 de sad §6. No tiene historia propia; se adopta el default de spec §8.

### Fuera del alcance (se informa, no se cambia)

- El contenedor CLI del C4 L2 en sad §5 no lista `estado`, `inicializar` ni `vincular-cuenta`.
