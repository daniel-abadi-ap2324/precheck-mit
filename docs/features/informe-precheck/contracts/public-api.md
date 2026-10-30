---
status: Draft
owner: "desconocido@correo.invalid"
updated_at: "2026-09-27"
feature_size: "M"
contract_version: "0.3.0"
---

# Contrato de biblioteca — informe-precheck

> **0.3.0 (2026-09-27, re-revisión 1):** se listan los códigos de error de cada método (incluidos los que agregaron las revisiones: `informe.emision_concurrente`, `informe.archivo_no_verificable`, `informe.indicacion_vacia`) y `expediente.evaluacion_concurrente` del núcleo (N1). `verificar_informe` tolera un BOM UTF-8 inicial (N3). Sin cambios de firmas.

Amplía la fachada `PreCheck` del núcleo (`motor-reglas-auditable/contracts/public-api.md`, que pasa a 0.2.0 por las enmiendas del final). Solo biblioteca estándar. Derivado de `spec.md` §4/§5, `sad.md` §5/§6 (flujos 1–9) y ADR-0001…0005; sin cambios de esquema (data-model omitido: no hay tablas ni columnas nuevas).

## Métodos nuevos de `PreCheck`

Todos resuelven la persona y exigen el rol `revisor_doyc` (flujo 9 · AC-07); si no, `identidad.cuenta_no_vinculada` o `identidad.sin_rol`, sin leer el expediente.

| Método | Retorno | US / AC · flujo |
|---|---|---|
| `informe_revisor(expediente_id, evaluacion: int, encabezado: Encabezado \| None = None)` | `Informe` (`version="revisor"`) | US-01 · AC-01, AC-02, AC-03, AC-11, AC-22 · flujo 3 |
| `emitir(expediente_id, evaluacion: int, encabezado: Encabezado \| None = None)` | `Emision` | US-02, US-03, US-04 · AC-04–06, AC-08–11, AC-16, AC-18–20, AC-23 · flujos 1, 4 |
| `indicar(expediente_id, evaluacion: int, regla_id: str, texto: str)` | `EventoRegistrado` | US-07 · AC-17, AC-21 · flujo 5 |
| `verificar_informe(contenido: str \| bytes)` | `VerificacionInforme` | US-05 · AC-12, AC-13 · flujo 2 |
| `verificar_codigo(expediente_id, codigo: str)` | `VerificacionInforme` | US-05 · AC-12 · flujo 7 |
| `emitidos(expediente_id)` | `tuple[EstadoEmision, ...]` | US-06 · AC-14, AC-15, AC-16 · flujo 8 |

`informe_revisor` no registra nada; `emitir` anexa `informe_emitido` y `indicar` anexa `indicacion` (sad §8).

## Tipos

```python
VersionInforme = Literal["revisor", "profesional"]
Vigencia       = Literal["vigente", "reemplazado", "sustituida"]

@dataclass(frozen=True)
class Encabezado:                        # entregado por el revisor; nunca se guarda (ADR-0005)
    tramite: str | None = None           # RLA, RDP, ATC, PDC, …
    proyecto: str | None = None
    finca: str | None = None
    profesional: str | None = None
    idoneidad: str | None = None         # los ausentes se muestran «no consta»

@dataclass(frozen=True)
class Informe:
    version: VersionInforme
    expediente_id: str
    evaluacion: int
    huella: str                          # SHA-256 hex del modelo canónico (ADR-0002)
    formato_informe: str                 # FORMATO_INFORME
    modelo: Mapping                      # contenido completo; fuente del documento y de la huella
    documento: str                       # HTML autocontenido con el modelo embebido
    estructurada: str                    # JSON del modelo (misma huella)

@dataclass(frozen=True)
class Emision:
    evento: EventoRegistrado             # informe_emitido: quién y cuándo en el sobre
    informe: Informe                     # version="profesional"
    codigo: str                          # huella en bloques de 4 para imprimir

@dataclass(frozen=True)
class Afectacion:
    tipo: Literal["retiro", "suspension"]
    referencia: str                      # "<regla_id> v<version>" o la norma
    desde: str                           # ISO 8601 UTC
    hasta: str | None                    # levantamiento, si lo hubo

@dataclass(frozen=True)
class EstadoEmision:
    expediente_id: str
    evaluacion: int
    seq: int                             # evento informe_emitido
    huella: str
    formato_informe: str
    emitido_por: str                     # persona_id
    emitido_en: str
    vigencia: Vigencia
    sustituida_por: int | None           # seq de la emisión posterior (vigencia "sustituida")
    reemplazado_por: int | None          # seq de la evaluación posterior (vigencia "reemplazado")
    afectaciones: tuple[Afectacion, ...] # vacía si no está afectada; con `hasta` si la suspensión se levantó

@dataclass(frozen=True)
class VerificacionInforme:
    resultado: Literal["coincide", "no_coincide", "no_verificable_version"]
    emisiones: tuple[EstadoEmision, ...] # las que coinciden (vacía si no_coincide)
    trazabilidad_coincide: bool | None   # solo por archivo: bloque de trazabilidad vs evento
    regenerado: Informe | None           # solo por código y mismo formato; encabezado «no conservado»,
                                         # huella = la de la emisión y marca «Contenido regenerado para comparación»
    aviso: str | None                    # p. ej. «el código prueba que la emisión existe, no que la copia esté íntegra»
```

`Informe.modelo` es estable y documentado en el propio JSON (`formato_informe`); sus claves de primer nivel: `version`, `formato_informe`, `expediente`, `evaluacion`, `encabezado`, `estado`, `aviso_no_vigente`, `observaciones`, `resultados` (solo revisor), `cumplimientos`, `alcance`, `cobertura`, `normas_consultadas`, `version_motor`, `nota_preliminar`.

## Cambios en métodos existentes (enmienda al núcleo, ADR-0003)

| Método | Cambio |
|---|---|
| `decidir(expediente_id, evaluacion, regla_id, accion, motivo, veredicto=None, indicacion: str \| None = None)` | Con `indicacion`, anexa la decisión y el evento `indicacion` en una sola transacción; devuelve el evento de la decisión. Sin `indicacion`, igual que en 0.1.1 |

## Puertos (enmienda)

```python
class RepositorioBitacora(Protocol):
    ...                                                                   # igual que 0.1.1
    def anexar_lote(self, cadena_id: str, eventos: Sequence[EventoNuevo]) -> list[EventoRegistrado]: ...  # una transacción
    def cadenas(self) -> list[str]: ...                                   # ya existía en RepositorioSQLite; pasa al puerto
    def anexar(self, cadena_id, evento, usos=(), contenidos=(),
               cabezas: Mapping[str, int] | None = None) -> EventoRegistrado: ...
    # cabezas: {cadena_id: seq esperado (0 si vacía)}, comprobado en la misma transacción exclusiva;
    # si alguna cadena avanzó, no anexa nada y lanza CadenaAvanzada (precheck.errores)
```

`Contexto.anexar_lote(cadena_id, [(tipo, actor, rol, payload), …])` aplica el mismo reloj y el mismo actor que `anexar`. `Contexto.anexar(..., cabezas=...)` pasa las cabezas al repositorio.

`emitir` toma las cabezas de la cadena del expediente y de la de reglas antes de validar y las exige al anexar: si otra escritura entró entre validar y registrar, lanza `informe.emision_concurrente` y no registra nada (revisión 2026-09-27, M6).

## Errores nuevos

`ErrorPreCheck` con los códigos `informe.*` de la tabla de `contracts/cli.md`. Por método (además de `identidad.cuenta_no_vinculada` / `identidad.sin_rol`, que todos lanzan antes de leer el expediente):

| Método | Códigos |
|---|---|
| `informe_revisor` | `informe.expediente_inexistente`, `informe.evaluacion_inexistente` |
| `emitir` | `informe.expediente_inexistente`, `informe.evaluacion_inexistente`, `informe.evaluacion_no_vigente`, `informe.expediente_pendiente`, `informe.resultados_afectados`, `informe.sin_indicacion`, `informe.emision_concurrente` |
| `indicar` | `informe.indicacion_vacia`, `informe.expediente_inexistente`, `informe.evaluacion_inexistente`, `informe.evaluacion_no_vigente`, `informe.indicacion_no_aplicable` |
| `decidir(..., indicacion=...)` | los del núcleo, más `informe.indicacion_vacia` e `informe.indicacion_no_aplicable` |
| `verificar_informe` | `informe.archivo_no_verificable` |
| `verificar_codigo` | `informe.codigo_corto` |
| `emitidos` | ninguno propio |
| `evaluar` (núcleo) | suma `expediente.evaluacion_concurrente`: la cadena de reglas (gobierno de reglas, personas o sello) cambió mientras se evaluaba; no se registra nada (re-revisión N1, N7) |

La CLI suma `informe.emision_sin_archivos` (solo en la salida `--json` de `emitir`, salida 7), que no es un `ErrorPreCheck`.

 `verificar_informe` y `verificar_codigo` no lanzan por «no coincide»: lo informan en `VerificacionInforme.resultado`.
