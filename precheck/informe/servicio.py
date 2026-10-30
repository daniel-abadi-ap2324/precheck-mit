"""Servicio del informe PreCheck: versión del revisor, emisión e indicación (sad §6 flujos 1, 3 y 5).

Compone la lectura de la bitácora, la proyección pura (`modelo`), el render (`html`), la huella y la
vigencia. La versión del revisor no escribe nada; la emisión anexa `informe_emitido` con la huella del
modelo y la del encabezado, nunca el encabezado (ADR-0005). La indicación es un evento propio
(`indicacion`) en la cadena `expediente:<id>`: no reescribe la decisión ni su motivo (ADR-0003).
"""
from dataclasses import asdict, dataclass
from typing import Literal, Mapping, Optional

from precheck.auditoria.cadena import EventoRegistrado
from precheck.errores import CadenaAvanzada, ErrorPreCheck, IntegridadComprometida
from precheck.expediente import servicio as exp
from precheck.expediente.observaciones import INDICACION, admite_indicacion, payload_indicacion, texto_indicacion
from precheck.expediente.servicio import NORMA_PREFIJO, cadena_de, exigir_revisor
from precheck.informe import html, vigencia
from precheck.informe import huella as hu
from precheck.informe.modelo import FORMATO_INFORME, FORMATOS_REGENERABLES, Encabezado, proyectar
from precheck.informe.vigencia import EstadoEmision
from precheck.motor.evaluador import NO_APLICA
from precheck.motor.version import VERSION_MOTOR
from precheck.reglas.gobierno import estado_de_reglas

VersionInforme = Literal["revisor", "profesional"]
INFORME_EMITIDO = "informe_emitido"
NO_CONSERVADO = "no conservado"
AVISO_CODIGO = "El código prueba que la emisión existe, no que la copia esté íntegra."
_PREFIJO_EXPEDIENTE = "expediente:"

def indicar(ctx, expediente_id, evaluacion, regla_id, texto):
    """AC-17/AC-21: agrega una indicación al profesional sobre una observación de la evaluación vigente."""
    yo = exigir_revisor(ctx)
    limpio = texto_indicacion(texto)
    eventos = list(ctx.repo.leer(cadena_de(expediente_id)))
    ev = evaluacion_de(eventos, expediente_id, evaluacion, vigente=True)
    if regla_id.startswith(NORMA_PREFIJO):
        existe = regla_id[len(NORMA_PREFIJO):] in ev.payload["cobertura"]["normas_sin_reglas"]
        resultado = None
    else:
        resultado = next((r for r in ev.payload["resultados"] if r["regla_id"] == regla_id), None)
        existe = resultado is not None
    decisiones = [e.payload for e in eventos if e.tipo == "decision" and e.payload.get("evaluacion_seq") == ev.seq
                  and e.payload.get("regla_id") == regla_id]
    if not existe or not admite_indicacion(resultado, decisiones[-1] if decisiones else None):
        raise ErrorPreCheck("informe.indicacion_no_aplicable", regla=regla_id, evaluacion=ev.seq)
    return ctx.anexar(cadena_de(expediente_id), INDICACION, yo, "revisor_doyc",
                      payload_indicacion(ev, regla_id, limpio))


# --- versión del revisor y emisión (flujos 1 y 3) ----------------------------------------------

@dataclass(frozen=True)
class Informe:
    version: VersionInforme
    expediente_id: str
    evaluacion: int
    huella: str                          # SHA-256 hex del modelo canónico (ADR-0002); si es regenerado, la emitida
    formato_informe: str                 # FORMATO_INFORME
    modelo: Mapping                      # contenido completo; fuente del documento y de la huella
    documento: str                       # HTML autocontenido con el modelo embebido
    estructurada: str                    # JSON del modelo (misma huella)


@dataclass(frozen=True)
class Emision:
    evento: EventoRegistrado             # informe_emitido: quién y cuándo en el sobre
    informe: Informe                     # version="profesional"
    codigo: str                          # huella en bloques de 4 para imprimir


def evaluacion_de(eventos, expediente_id, seq, vigente=False):
    """La evaluación `seq` de los eventos del expediente, con mensajes propios del informe (AC-03, AC-06,
    AC-21): expediente sin evaluaciones, evaluación no registrada o, si se exige, no vigente."""
    evaluaciones = [e for e in eventos if e.tipo == "evaluacion"]
    if not evaluaciones:
        raise ErrorPreCheck("informe.expediente_inexistente", expediente=expediente_id)
    ev = next((e for e in evaluaciones if e.seq == seq), None)
    if ev is None:
        raise ErrorPreCheck("informe.evaluacion_inexistente", expediente=expediente_id, evaluacion=seq)
    if vigente and ev.seq != evaluaciones[-1].seq:
        raise ErrorPreCheck("informe.evaluacion_no_vigente", expediente=expediente_id, evaluacion=seq,
                            vigente=evaluaciones[-1].seq)
    return ev


def contenidos_de(repo, evaluacion):
    """hash_contenido -> contenido de cada versión de regla usada (salvo NO_APLICA). Un contenido
    alterado se omite: la evaluación ya lo registró como REQUIERE_REVISION."""
    res = {}
    for r in evaluacion.payload["resultados"]:
        h = r.get("hash_contenido")
        if h and h not in res and r["resultado"] != NO_APLICA:
            try:
                res[h] = repo.contenido(h)
            except IntegridadComprometida:
                continue
    return res


def armar(modelo, expediente_id, huella=None, trazabilidad=None, regenerado=False) -> Informe:
    """Informe con su documento y su forma estructurada; la trazabilidad queda fuera de la huella. Un
    contenido `regenerado` lleva la huella de la emisión que se le da y la marca visible (AC-12)."""
    huella = huella or hu.huella(modelo)
    return Informe(modelo["version"], expediente_id, modelo["evaluacion"]["seq"], huella,
                   modelo["formato_informe"], modelo, html.render(modelo, huella, trazabilidad, regenerado),
                   html.estructurada(modelo, trazabilidad))


def trazabilidad(registro, evento):
    """Bloque de trazabilidad de una emisión: quién (identificador y nombre) y cuándo, desde el evento."""
    persona = registro.personas.get(evento.actor) or {}
    return {"emitido_por": evento.actor, "nombre": persona.get("nombre"), "emitido_en": evento.ocurrido_en}


def informe_revisor(ctx, expediente_id, evaluacion, encabezado=None):
    """AC-01/AC-03: versión «uso interno» de cualquier evaluación registrada. No escribe nada."""
    exigir_revisor(ctx)
    eventos = list(ctx.repo.leer(cadena_de(expediente_id)))
    ev = evaluacion_de(eventos, expediente_id, evaluacion)
    modelo = proyectar(eventos, ctx.estado_reglas(), ev.seq, "revisor", encabezado,
                       contenidos_de(ctx.repo, ev))
    return armar(modelo, expediente_id)


def emitir(ctx, expediente_id, evaluacion, encabezado=None):
    """AC-04/05/06/16/18/20: emite la versión del profesional de la evaluación vigente de un expediente
    revisado, sin resultados afectados y con toda observación indicada; registra `informe_emitido`.

    Toma las cabezas de la cadena del expediente y de la de reglas antes de leer nada y las exige al
    anexar, en la misma transacción exclusiva: si otra escritura entró entre validar y registrar (una
    evaluación, una decisión, un retiro…), la emisión no se registra (informe.emision_concurrente)."""
    cadena = cadena_de(expediente_id)
    eventos_reglas = ctx.eventos_reglas()
    eventos = list(ctx.repo.leer(cadena))
    cabezas = {cadena: eventos[-1].seq if eventos else 0, "reglas": eventos_reglas[-1].seq if eventos_reglas else 0}
    yo = exigir_revisor(ctx)
    ev = evaluacion_de(eventos, expediente_id, evaluacion, vigente=True)
    pendientes = exp.estado(ctx, expediente_id).pendientes
    if pendientes:
        raise ErrorPreCheck("informe.expediente_pendiente", pendientes=list(pendientes))
    afectados = vigencia.afectados_vigentes(ev, eventos_reglas)
    if afectados:
        raise ErrorPreCheck("informe.resultados_afectados", afectaciones=[asdict(a) for a in afectados])
    modelo = proyectar(eventos, estado_de_reglas(eventos_reglas), ev.seq, "profesional", encabezado,
                       contenidos_de(ctx.repo, ev))
    faltan = modelo["estado"]["faltantes"]["indicaciones"]
    if faltan:
        raise ErrorPreCheck("informe.sin_indicacion", observaciones=list(faltan))
    huella = hu.huella(modelo)
    try:
        evento = ctx.anexar(cadena, INFORME_EMITIDO, yo, "revisor_doyc", {
            "evaluacion_seq": ev.seq, "hash_evaluacion": ev.hash, "version": "profesional", "huella": huella,
            "huella_encabezado": hu.huella_encabezado(encabezado), "formato_informe": FORMATO_INFORME,
            "version_motor": VERSION_MOTOR}, cabezas=cabezas)
    except CadenaAvanzada as e:
        raise ErrorPreCheck("informe.emision_concurrente", expediente=expediente_id, cadena=e.cadena_id) from e
    informe = armar(modelo, expediente_id, huella, trazabilidad(ctx.registro(), evento))
    return Emision(evento, informe, hu.codigo(huella))


# --- verificación y emitidos (flujos 2, 7 y 8) -------------------------------------------------

@dataclass(frozen=True)
class VerificacionInforme:
    resultado: Literal["coincide", "no_coincide", "no_verificable_version"]
    emisiones: tuple[EstadoEmision, ...]  # las que coinciden (vacía si no_coincide)
    trazabilidad_coincide: Optional[bool]  # solo por archivo: bloque de trazabilidad vs evento
    regenerado: Optional[Informe]          # solo por código y mismo formato; encabezado «no conservado»
    aviso: Optional[str]


def _estados(eventos, eventos_reglas, expediente_id):
    return vigencia.estados(eventos, eventos_reglas, expediente_id)


def emitidos(ctx, expediente_id) -> tuple[EstadoEmision, ...]:
    """AC-14/AC-15: cada emisión del expediente con su vigencia y sus afectaciones, derivadas al consultar."""
    exigir_revisor(ctx)
    return _estados(ctx.repo.leer(cadena_de(expediente_id)), ctx.eventos_reglas(), expediente_id)


def _aviso_vigentes(por_expediente):
    """Cuál es la emisión vigente de cada expediente con emisiones que coinciden."""
    partes = []
    for expediente_id, estados in por_expediente.items():
        vigentes = [str(e.seq) for e in estados if e.vigencia == "vigente"]
        partes.append(f"{expediente_id}: {', '.join(vigentes)}" if vigentes
                      else f"{expediente_id}: ninguna emisión vigente")
    return "Emisión vigente — " + "; ".join(partes) + "."


def _decodificar(contenido):
    if isinstance(contenido, (bytes, bytearray)):
        return bytes(contenido).decode("utf-8")      # extraer ya confirmó que es UTF-8
    return contenido


def verificar_informe(ctx, contenido) -> VerificacionInforme:
    """AC-12/AC-13 por archivo: huella del modelo embebido buscada en todas las cadenas de expediente.
    Sin emisión con esa huella, no coincide (cualquiera sea el formato). Con emisión de otro formato, no es
    verificable con esta versión. Si no, el documento debe ser, completo, el render del modelo con su
    trazabilidad (solo se toleran un BOM inicial, CRLF y el salto final); la trazabilidad se compara con el evento."""
    exigir_revisor(ctx)
    extraido = html.extraer(contenido)
    if extraido is None:
        raise ErrorPreCheck("informe.archivo_no_verificable")
    modelo, traz = extraido
    texto = _decodificar(contenido)
    huella = hu.huella(modelo)
    eventos_reglas = ctx.eventos_reglas()
    por_expediente, eventos_de = {}, {}
    for cadena in ctx.repo.cadenas():
        if not cadena.startswith(_PREFIJO_EXPEDIENTE):
            continue
        eventos = list(ctx.repo.leer(cadena))
        if not any(e.tipo == INFORME_EMITIDO and e.payload.get("huella") == huella for e in eventos):
            continue
        expediente_id = cadena[len(_PREFIJO_EXPEDIENTE):]
        por_expediente[expediente_id] = _estados(eventos, eventos_reglas, expediente_id)
        eventos_de[expediente_id] = {e.seq: e for e in eventos}
    coinciden = tuple(e for estados in por_expediente.values() for e in estados if e.huella == huella)
    if not coinciden:
        return VerificacionInforme("no_coincide", (), None, None, "No coincide con ninguna emisión registrada.")
    if all(e.formato_informe not in FORMATOS_REGENERABLES for e in coinciden):
        formatos = ", ".join(sorted({e.formato_informe for e in coinciden}))
        return VerificacionInforme("no_verificable_version", coinciden, None, None,
                                   f"La huella corresponde a una emisión registrada con formato de informe {formatos}: "
                                   f"no verificable con esta versión ({FORMATO_INFORME}); el documento no se compara.")
    es_documento = not html.quitar_bom(texto).lstrip().startswith("{")   # un BOM inicial se tolera (N3)
    if es_documento and not html.mismo_documento(texto, modelo, huella, traz):
        return VerificacionInforme("no_coincide", (), None, None,
                                   "Contenido alterado: el documento no coincide con el que genera su modelo.")
    registro = ctx.registro()
    traz_ok = any(traz == trazabilidad(registro, eventos_de[e.expediente_id][e.seq]) for e in coinciden)
    return VerificacionInforme("coincide", coinciden, traz_ok, None, _aviso_vigentes(por_expediente))


def _encabezado_no_conservado(huella_encabezado):
    return {**{c: NO_CONSERVADO for c in hu.CAMPOS_ENCABEZADO}, "huella_encabezado": huella_encabezado}


def regenerar(ctx, expediente_id, eventos, emision, encabezado=None):
    """Modelo de una emisión con corte temporal: eventos del expediente hasta su `seq` y estado de reglas
    a su fecha (ADR-0001). Con el encabezado original, reproduce la huella emitida."""
    hasta = [e for e in eventos if e.seq < emision.seq]
    ev = evaluacion_de(hasta, expediente_id, emision.payload["evaluacion_seq"])
    return proyectar(hasta, ctx.estado_reglas(en=emision.ocurrido_en), ev.seq, "profesional", encabezado,
                     contenidos_de(ctx.repo, ev))


def verificar_codigo(ctx, expediente_id, codigo) -> VerificacionInforme:
    """AC-12 por código: emisiones del expediente cuya huella empieza con el código (≥ 16 caracteres);
    regenera el contenido emitido con el encabezado «no conservado», rotulado como regenerado y con el
    código de la emisión (no una huella recalculada). El aviso dice además cuál es la emisión vigente."""
    exigir_revisor(ctx)
    caracteres = len(hu.normalizar_codigo(codigo))
    if caracteres < hu.MINIMO_PREFIJO:
        raise ErrorPreCheck("informe.codigo_corto", caracteres=caracteres)
    eventos = list(ctx.repo.leer(cadena_de(expediente_id)))
    estados = _estados(eventos, ctx.eventos_reglas(), expediente_id)
    coinciden = tuple(e for e in estados if hu.coincide_prefijo(e.huella, codigo))
    if not coinciden:
        return VerificacionInforme("no_coincide", (), None, None, "No coincide con ninguna emisión registrada.")
    vigente = _aviso_vigentes({expediente_id: estados})
    ultima = coinciden[-1]
    if ultima.formato_informe not in FORMATOS_REGENERABLES:
        return VerificacionInforme("no_verificable_version", coinciden, None, None,
                                   f"La emisión existe, pero su formato de informe ({ultima.formato_informe}) no es "
                                   f"regenerable con esta versión ({FORMATO_INFORME}). {vigente}")
    emision = next(e for e in eventos if e.seq == ultima.seq)
    modelo = regenerar(ctx, expediente_id, eventos, emision, Encabezado())
    modelo["formato_informe"] = ultima.formato_informe   # el contenido no cambia entre formatos regenerables
    modelo["encabezado"] = _encabezado_no_conservado(emision.payload["huella_encabezado"])
    regenerado = armar(modelo, expediente_id, emision.payload["huella"], trazabilidad(ctx.registro(), emision),
                       regenerado=True)
    return VerificacionInforme("coincide", coinciden, None, regenerado, f"{AVISO_CODIGO} {vigente}")
