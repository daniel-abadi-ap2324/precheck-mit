---
updated_at: "2026-09-27"
contract_version: "0.2.0"
---

# API sync report — informe-precheck

**Forma del contrato:** `library-sdk` → `public-api.md`; `cli` → `cli.md` (leído de `sad.md` `target_surfaces`). Sin `openapi.yaml` ni `events.md` (sin HTTP ni flujos asíncronos).
**Esquema:** `data-model.md` ausente, omisión legal (sin cambio de esquema: sad §5 no declara tablas; los eventos `indicacion` e `informe_emitido` viven en la tabla `evento` de `precheck/auditoria/migraciones/0002_create_evento.up.sql`, cuyo `payload` es JSON libre).

## Field origins

| Campo | Origen | Confianza |
|---|---|---|
| `Encabezado.*` | spec AC-11, §6.1; ADR-0005 | alta |
| `Informe.huella`, `formato_informe`, `modelo`, `documento`, `estructurada` | ADR-0001, ADR-0002; sad §8 | alta |
| `Informe.modelo` claves | spec AC-01, AC-02, AC-08–11, AC-19, AC-22, AC-23; sad flujos 3–4 | media (el detalle interno se fija en implement con pruebas) |
| `Emision.evento` / `informe_emitido` payload | sad §8 «Eventos nuevos»; tabla `evento` existente | alta |
| `Emision.codigo` | spec AC-12; sad §8 «Código impreso» | alta |
| `EstadoEmision.*`, `Afectacion.*` | spec AC-14–16; ADR-0004; sad flujo 8 | alta |
| `VerificacionInforme.*` | spec AC-12, AC-13; ADR-0002; sad flujos 2, 7 | alta |
| `indicar(...)`, evento `indicacion` payload | spec AC-17, AC-21; ADR-0003; sad flujo 5 | alta |
| `decidir(..., indicacion)` | ADR-0003; sad flujo 5 | alta |
| `anexar_lote`, `cadenas` | ADR-0003; sad §5; `RepositorioSQLite.cadenas` existente | alta |

## Drift checklist

- [x] **Operación ↔ modelo/esquema:** ningún campo sin origen; ninguna tabla nueva.
- [x] **Códigos de error ↔ repo:** los reutilizados existen en `precheck/errores.py`; los 7 `informe.*` son nuevos y se agregan a `CODIGOS` en implement.
- [x] **Validación ↔ restricciones:** código ≥ 16 caracteres (AC-12); indicación no vacía; encabezado con campos opcionales.
- [x] **Contrato ↔ secuencias:** cada rama `alt` de los flujos 1–9 tiene su error o su resultado (tabla abajo).

| Flujo · rama | Contrato |
|---|---|
| 1 · no vigente / pendiente / sin indicación o afectados | `informe.evaluacion_no_vigente`, `informe.expediente_pendiente`, `informe.sin_indicacion`, `informe.resultados_afectados` |
| 2 · no es original / otro formato / alterado / sin emisión | `informe.archivo_no_verificable`; `no_verificable_version` (salida 5); `no_coincide` (salida 3) |
| 3 · inexistente | `informe.expediente_inexistente`, `informe.evaluacion_inexistente` |
| 5 · no vigente / no aplicable | `informe.evaluacion_no_vigente`, `informe.indicacion_no_aplicable` |
| 7 · código corto / sin emisión / otro formato | `informe.codigo_corto`, `no_coincide`, `no_verificable_version` |
| 9 · sin vínculo / sin rol | `identidad.cuenta_no_vinculada`, `identidad.sin_rol` |

## Cobertura inversa

- Las 24 AC tienen operación: AC-01–03, 11, 22 → `informe_revisor`; AC-04–06, 08–11, 16, 18–20, 23 → `emitir`; AC-07 → todas; AC-12–13 → `verificar_informe` / `verificar_codigo`; AC-14–16 → `emitidos`; AC-17, 21, 24 → `indicar` / `decidir` (AC-24 se observa en `emitir` e `informe_revisor`).
- Cada operación mapea a una historia (US-01…US-07). Sin brechas de secuencia.

## Enmiendas al núcleo

`motor-reglas-auditable/contracts/cli.md` y `public-api.md` pasan a 0.2.0: `decidir --indicacion` y el puerto con `anexar_lote`, `cadenas` y `anexar(..., cabezas=...)` (ADR-0003 de esta funcionalidad; `cabezas`, revisión M6); `evaluar` suma `expediente.evaluacion_concurrente` (re-revisión N1). `public-api.md` de esta funcionalidad pasa a 0.3.0 (códigos de error por método).

## Resoluciones

- Flujo 5 · rama «observación válida»: el contrato acepta indicaciones sobre NO_CUMPLE no bloqueantes oficiales con o sin visto bueno (decidido con el usuario; la emisión sigue exigiendo visto bueno e indicaciones). Se ajustó la etiqueta de la rama en `sad.md` §6.
