"""PreCheck MUPA: núcleo auditable del motor de reglas (contracts/public-api.md).

    from precheck import abrir
    pc = abrir("bitacora.sqlite3", normativa=[...])
    evaluacion = pc.evaluar("EXP-0001", hechos)
"""
import pathlib

from precheck.auditoria import sello as _sello
from precheck.auditoria.sqlite_repo import RepositorioSQLite
from precheck.contexto import Contexto
from precheck.expediente import servicio as _exp
from precheck.informe import servicio as _inf
from precheck.informe.modelo import Encabezado
from precheck.informe.servicio import Emision, Informe, VerificacionInforme
from precheck.informe.vigencia import Afectacion, EstadoEmision
from precheck.personas import servicio as _per
from precheck.personas.registro import ResolutorCuentaSO
from precheck.reglas import servicio as _reglas

__all__ = ["PreCheck", "abrir", "Encabezado", "Informe", "Emision", "EstadoEmision", "Afectacion",
           "VerificacionInforme", "NORMATIVA_POR_DEFECTO"]

_RAIZ = pathlib.Path(__file__).resolve().parent.parent
NORMATIVA_POR_DEFECTO = (
    _RAIZ / "normativa/acuerdo-110/texto-completo.md",
    _RAIZ / "normativa/zonificacion/textos/anexo4_fichas_plot.txt",
    _RAIZ / "normativa/zonificacion/textos/acuerdo128_2026_compensacion.txt",
    _RAIZ / "normativa/zonificacion/textos/acuerdo270_sf_y_anexo2.txt",
    # Articulado del PLOT y Decreto 88 (accesibilidad): fundamentos y cláusulas de subsanación de ADR-0017.
    _RAIZ / "normativa/zonificacion/textos/acuerdo61_2021_plot_gaceta.txt",
    _RAIZ / "normativa/ley42-discapacidad/decreto88_2002_texto_ocr.txt",
    # Normas del MIVIOT y de la Ley 21 que el PLOT mantiene (Art. 3): transcripciones cotejadas con el PDF escaneado.
    *sorted((_RAIZ / "normativa/zonas-exceptuadas/textos").glob("*.txt")),
)


class PreCheck:
    """Fachada del núcleo: cada método resuelve la persona, valida y anexa su evento."""

    def __init__(self, ctx: Contexto):
        self.ctx = ctx

    def cerrar(self):
        self.ctx.repo.cerrar()

    # expedientes
    def evaluar(self, expediente_id, hechos, umbral=0.85):
        return _exp.evaluar(self.ctx, expediente_id, hechos, umbral)

    def decidir(self, expediente_id, evaluacion, regla_id, accion, motivo, veredicto=None, indicacion=None):
        return _exp.decidir(self.ctx, expediente_id, evaluacion, regla_id, accion, motivo, veredicto, indicacion)

    def listar_visto_bueno(self, expediente_id, evaluacion):
        return _exp.listar_visto_bueno(self.ctx, expediente_id, evaluacion)

    def dar_visto_bueno(self, expediente_id, evaluacion, confirmar_sin_ceus=False):
        return _exp.dar_visto_bueno(self.ctx, expediente_id, evaluacion, confirmar_sin_ceus)

    def estado(self, expediente_id):
        return _exp.estado(self.ctx, expediente_id)

    def reproducir(self, expediente_id, evaluacion):
        return _exp.reproducir(self.ctx, expediente_id, evaluacion)

    # informe
    def informe_revisor(self, expediente_id, evaluacion, encabezado=None):
        return _inf.informe_revisor(self.ctx, expediente_id, evaluacion, encabezado)

    def emitir(self, expediente_id, evaluacion, encabezado=None):
        return _inf.emitir(self.ctx, expediente_id, evaluacion, encabezado)

    def indicar(self, expediente_id, evaluacion, regla_id, texto):
        return _inf.indicar(self.ctx, expediente_id, evaluacion, regla_id, texto)

    def verificar_informe(self, contenido):
        return _inf.verificar_informe(self.ctx, contenido)

    def verificar_codigo(self, expediente_id, codigo):
        return _inf.verificar_codigo(self.ctx, expediente_id, codigo)

    def emitidos(self, expediente_id):
        return _inf.emitidos(self.ctx, expediente_id)

    # integridad
    def verificar(self, cadena_id=None, sello=None):
        return _sello.verificar(self.ctx, cadena_id, sello)

    def sellar(self):
        return _sello.sellar(self.ctx)

    # gobierno de reglas
    def proponer(self, catalogo):
        return _reglas.proponer(self.ctx, catalogo)

    def aprobar(self, regla_id, version):
        return _reglas.aprobar(self.ctx, regla_id, version)

    def rechazar(self, regla_id, version, motivo):
        return _reglas.rechazar(self.ctx, regla_id, version, motivo)

    def retirar(self, regla_id, version, motivo):
        return _reglas.retirar(self.ctx, regla_id, version, motivo)

    def proponer_suspension(self, norma, motivo):
        return _reglas.proponer_suspension(self.ctx, norma, motivo)

    def proponer_levantamiento(self, norma, motivo):
        return _reglas.proponer_levantamiento(self.ctx, norma, motivo)

    def confirmar(self, propuesta_seq):
        return _reglas.confirmar(self.ctx, propuesta_seq)

    def estado_regla(self, regla_id, version, en=None):
        return self.ctx.estado_reglas(en).estado(regla_id, version)

    # personas
    def inicializar(self, persona_id, nombre, segunda_persona_id, segundo_nombre, segunda_cuenta):
        return _per.inicializar(self.ctx, persona_id, nombre, segunda_persona_id, segundo_nombre, segunda_cuenta)

    def vincular_cuenta(self, persona_id, nombre, cuenta):
        return _per.vincular_cuenta(self.ctx, persona_id, nombre, cuenta)

    def designar(self, persona_id, rol, motivo):
        return _per.designar(self.ctx, persona_id, rol, motivo)


def abrir(ruta_bitacora, normativa=None, resolutor=None, destino_anclaje=None) -> PreCheck:
    """Abre (o crea y migra) la bitácora y devuelve la fachada."""
    ctx = Contexto(RepositorioSQLite(ruta_bitacora), resolutor or ResolutorCuentaSO(),
                   list(normativa or NORMATIVA_POR_DEFECTO), destino_anclaje=destino_anclaje)
    return PreCheck(ctx)
