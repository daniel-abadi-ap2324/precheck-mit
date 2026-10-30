---
status: Draft
owner: "desconocido@correo.invalid"
updated_at: "2026-09-27"
feature_size: "M"
contract_version: "0.2.0"
---

# Contrato de biblioteca — motor-reglas-auditable

> **0.2.0 (2026-09-27):** enmendado por `informe-precheck` (ADR-0003 de esa funcionalidad): `decidir` acepta `--indicacion` / `indicacion=`, y el puerto `RepositorioBitacora` suma `anexar_lote` y `cadenas`, y `anexar` acepta `cabezas` (control de concurrencia optimista: seq esperado de cada cadena, comprobado en la misma transacción; `emitir` y `evaluar` lo usan). `evaluar` puede lanzar `expediente.evaluacion_concurrente` (re-revisión N1). Los subcomandos y métodos del informe están en `docs/features/informe-precheck/contracts/`.

Superficie pública del núcleo (`library-sdk`, ADR-0001). Es lo único que la CLI, las pruebas y la futura API pueden importar; el resto de `precheck.*` es interno. Solo biblioteca estándar.

## Punto de entrada

```python
from precheck import PreCheck, abrir

pc: PreCheck = abrir(ruta_bitacora: str | os.PathLike,
                     normativa: Sequence[os.PathLike] | None = None,   # por defecto: NORMATIVA_POR_DEFECTO
                     resolutor: ResolutorIdentidad | None = None,      # por defecto: ResolutorCuentaSO
                     destino_anclaje: DestinoAnclaje | None = None)
...
pc.cerrar()                                   # cierra la conexión con la bitácora
```

`abrir` crea la bitácora si no existe, aplica las migraciones pendientes y activa `foreign_keys`. Sin `normativa`, usa `precheck.NORMATIVA_POR_DEFECTO` (Acuerdo 110, fichas del Anexo 4 del PLOT, Acuerdo 128 de 2026 y Acuerdo 270 con su Anexo 2), contra la que `proponer` verifica las citas.

## Puertos (`typing.Protocol`)

```python
class RepositorioBitacora(Protocol):
    def anexar(self, cadena_id: str, evento: EventoNuevo, usos: Sequence[UsoRegla] = (),
               contenidos: Sequence[Mapping] = (),
               cabezas: Mapping[str, int] | None = None) -> EventoRegistrado: ...   # todo en una transacción
    # cabezas (enmienda 0.2.0, informe-precheck): {cadena_id: seq esperado, 0 si vacía}; se comprueba dentro
    # de la misma transacción exclusiva (BEGIN IMMEDIATE); si alguna avanzó, no anexa nada y lanza
    # CadenaAvanzada (precheck.errores). Lo usan `emitir` y `evaluar`.
    def anexar_lote(self, cadena_id: str, eventos: Sequence[EventoNuevo]) -> list[EventoRegistrado]: ...  # 0.2.0
    def cadenas(self) -> list[str]: ...                                   # 0.2.0
    def leer(self, cadena_id: str, desde: int = 1) -> Iterator[EventoRegistrado]: ...
    def evento(self, cadena_id: str, seq: int) -> EventoRegistrado | None: ...
    def cabezas(self) -> dict[str, str]: ...                              # cadena_id -> hash
    def guardar_contenido(self, contenido: ContenidoRegla) -> str: ...    # devuelve hash; idempotente
    def contenido(self, hash_: str) -> ContenidoRegla: ...
    def usos(self, regla_id: str, version: int) -> list[tuple[str, int]]: ...

class ResolutorIdentidad(Protocol):
    def cuenta_actual(self) -> str: ...

class DestinoAnclaje(Protocol):
    def exportar(self, sello: Sello) -> str: ...     # devuelve una referencia al sello exportado
    def ultimo(self) -> Sello | None: ...
```

Adaptadores incluidos: `RepositorioSQLite` (ADR-0002; además expone `cadenas()` y `contenidos_alterados()`, que usa `verificar`), `ResolutorCuentaSO` (cuenta del UID efectivo con `pwd.getpwuid(os.geteuid())`; no usa `getpass.getuser()`, que lee `LOGNAME`/`USER` y permitiría suplantar a otra persona; si el UID no tiene cuenta, `identidad.cuenta_no_vinculada`) y `DestinoArchivo(directorio, crear=True)` (ADR-0007; `crear=False` no crea el directorio). Las pruebas inyectan un `ResolutorIdentidad` falso.

## Métodos de `PreCheck`

Cada método que registra una acción humana resuelve la persona con el resolutor, valida rol y reglas de dominio, anexa el evento y devuelve un valor inmutable (`dataclass(frozen=True)`). `verificar`, `sellar` y `estado_regla` no resuelven persona; `estado`, `listar_visto_bueno` y `reproducir` sí (exigen `revisor_doyc`). Los fallos de negocio lanzan `ErrorPreCheck`.

| Método | Retorno | US / AC |
|---|---|---|
| `evaluar(expediente_id, hechos: Mapping, umbral: float = 0.85)` | `Evaluacion` (si la cadena de reglas avanzó mientras se evaluaba —por cualquier evento: gobierno de reglas (propuestas, aprobaciones, retiros, suspensiones), personas o sello—, `expediente.evaluacion_concurrente` y no registra nada; enmienda informe-precheck N1, N7) | US-01, US-02, US-10 · AC-01–06, AC-21 |
| `decidir(expediente_id, evaluacion: int, regla_id, accion: Accion, motivo: str, veredicto: Resultado \| None = None)` | `EventoRegistrado` | US-05 · AC-13, AC-14 |
| `listar_visto_bueno(expediente_id, evaluacion: int)` | `list[ResultadoRegla]` | US-06 · AC-15 |
| `dar_visto_bueno(expediente_id, evaluacion: int, confirmar_sin_ceus: bool = False)` | `EventoRegistrado` | US-06 · AC-15 |
| `estado(expediente_id)` | `EstadoExpediente` | US-06 · AC-16 |
| `reproducir(expediente_id, evaluacion: int)` | `Reproduccion` | US-07 · AC-17, AC-18 |
| `verificar(cadena_id: str \| None = None, sello: Sello \| None = None)` | `Verificacion` | US-08 · AC-19, AC-19b |
| `sellar()` | `Sello` | US-08 |
| `proponer(catalogo: Sequence[Mapping])` | `list[ResultadoPropuesta]` | US-03 · AC-07, AC-08, AC-12 |
| `aprobar(regla_id, version)` / `rechazar(regla_id, version, motivo)` / `retirar(regla_id, version, motivo)` | `EventoRegistrado` (retirar: `Retiro` con usos) | US-04, US-09 · AC-09–12, AC-20b |
| `proponer_suspension(norma, motivo)` / `proponer_levantamiento(norma, motivo)` | `EventoRegistrado` | US-09 · AC-20 |
| `confirmar(propuesta_seq: int)` | `Confirmacion` (suspensión: `afectados` = `({"expediente", "evaluaciones": {seq: [regla_id]}}, …)`; idempotente sobre una suspensión ya confirmada). Confirma también vínculos y designaciones (sad §6 flujos 12, 13) | US-09 · AC-20 |
| `inicializar(persona_id, nombre, segunda_persona_id, segundo_nombre, segunda_cuenta)` / `vincular_cuenta(persona_id, nombre, cuenta)` / `designar(persona_id, rol, motivo)` | `EventoRegistrado` (las propuestas se confirman con `confirmar`) | ADR-0006 · sad §6 flujos 11–13 |
| `estado_regla(regla_id, version, en: date \| datetime \| str \| None = None)` | `Estado \| None` (`None` si la versión no existe) | ADR-0005 (`en`: `datetime` con zona horaria o ISO 8601 con desfase, normalizado a UTC; o fecha civil de Panamá, que incluye todo ese día; otro formato → `ValueError`) |

## Tipos

```python
Resultado = Literal["CUMPLE", "NO_CUMPLE", "REQUIERE_REVISION", "NO_APLICA"]
Estado    = Literal["borrador", "aprobada", "rechazada", "retirada", "suspendida"]
Accion    = Literal["confirmar", "descartar", "veredicto"]
Rol       = Literal["redactor", "revisor_doyc", "aprobador"]

@dataclass(frozen=True)
class ResultadoRegla:
    regla_id: str; version: int; hash_contenido: str
    estado_regla: Estado                 # a la fecha de evaluación
    resultado: Resultado                 # oficial
    indicativo: Resultado | None         # solo si la regla no está aprobada
    motivo: str
    severidad: Literal["bloqueante", "observacion"] | None
    cita_textual: str; fuente_norma: str; articulo: str
    valores_usados: Mapping[str, Hecho]  # valor, confianza, fuente
    advertencias: tuple[str, ...] = ()   # p. ej. "sin CEUS", "discrepancia CEUS/Documento Gráfico"

@dataclass(frozen=True)
class Cobertura:
    normas_evaluadas: Mapping[str, int]        # norma -> reglas aplicadas
    normas_sin_reglas: tuple[str, ...]         # p. ej. MIVIOT
    reglas_sin_aprobar: int
    temas_evaluados: Mapping[str, tuple[str, ...]] | None = None   # norma -> temas (último segmento del id de regla)

@dataclass(frozen=True)
class Evaluacion:
    expediente_id: str; seq: int; hash: str
    fecha_presentacion: str; norma_aplicable: str | None   # fecha AAAA-MM-DD
    zona: Mapping[str, str]                    # ceus, documento_grafico, usada
    umbral: float; version_motor: str
    resultados: tuple[ResultadoRegla, ...]; cobertura: Cobertura

@dataclass(frozen=True)
class EstadoExpediente:
    expediente_id: str; evaluacion: int
    estado: Literal["pendiente", "revisado"]
    pendientes: tuple[str, ...]                # regla_id sin decisión, "norma:<NORMA>" sin veredicto, "visto bueno"

@dataclass(frozen=True)
class Reproduccion:
    resultado: Literal["coincide", "discrepancias", "no_reproducible_version"]
    discrepancias: tuple[tuple[str, Resultado, Resultado], ...]   # regla, original, nuevo (contenido alterado → REQUIERE_REVISION; el motivo va en el evento)
    evento: EventoRegistrado

@dataclass(frozen=True)
class Verificacion:
    integra: bool
    rota_en: tuple[str, int] | None            # cadena, seq
    coincide_sello: bool | None                # None: sin sello, o la cadena no estaba sellada
    sello_fecha: str | None
    contenido_alterado: tuple = ()             # (regla_id, version) cuyo contenido no coincide con su hash
    cadenas_sin_coincidir: tuple[str, ...] = ()

@dataclass(frozen=True)
class Sello:
    fecha: str; cabezas: Mapping[str, str] = {}; hash: str = ""

@dataclass(frozen=True)
class ResultadoPropuesta:                      # uno por regla del catálogo en proponer()
    regla_id: str; version: int
    estado: Literal["registrada", "sin_cambios", "error"]
    hash: str | None = None; codigo: str | None = None; mensaje: str | None = None

@dataclass(frozen=True)
class Retiro:
    evento: EventoRegistrado
    usos: list[tuple[str, int]]                # (cadena_id, seq) de los resultados que usaron la versión

@dataclass(frozen=True)
class Confirmacion:
    evento: EventoRegistrado
    afectados: tuple = ()                      # solo suspensiones: ({"expediente", "evaluaciones": {seq: [regla_id]}}, …)

@dataclass(frozen=True)
class EventoRegistrado:
    cadena_id: str; seq: int; tipo: str; actor: str; rol: str
    ocurrido_en: str; payload: Mapping; hash_previo: str; hash: str
```

## Errores

```python
class ErrorPreCheck(Exception):
    codigo: str          # "<modulo>.<error>", ver la tabla de contracts/cli.md
    mensaje: str
    detalles: Mapping
```

Subclases por módulo (`ErrorExpediente`, `ErrorDecision`, `ErrorRegla`, `ErrorGobierno`, `ErrorIdentidad`). Los códigos válidos están en `precheck.errores.CODIGOS`; un código desconocido lanza `ValueError`. Los fallos de evaluación de una regla nunca son excepción: producen REQUIERE_REVISION (sad §8).

`IntegridadComprometida(Exception)` no es un error de negocio: indica que la bitácora o el contenido de una regla no coincide con su hash (salida 3 en la CLI). Un argumento inválido (p. ej. `rol` fuera de `Rol` en `designar`, o `en` mal formado en `estado_regla`) lanza `ValueError`.

## Compatibilidad

- `precheck/motor/motor.py` conserva su CLI actual (`--reglas`, `--proyecto`, `--modo-prueba`) como envoltorio sin bitácora, para las pruebas existentes.
- `precheck/auditoria/verificar_cadena.py` conserva su CLI sobre exportaciones JSON.
