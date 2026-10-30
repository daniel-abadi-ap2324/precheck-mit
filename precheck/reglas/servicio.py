"""Gobierno de reglas: proponer, aprobar, rechazar, retirar, suspender y levantar (ADR-0005, ADR-0008)."""
from dataclasses import dataclass
from typing import Optional

from precheck.auditoria.canonico import hash_contenido
from precheck.errores import ErrorPreCheck
from precheck.motor.evaluador import validar_expresion
from precheck.motor.verificar_citas import cita_en_normativa, norm
from precheck.personas.registro import exigir_rol, puede_aprobar
from precheck.personas.servicio import _motivo, exigir_aprobador
from precheck.personas.servicio import confirmar as confirmar_propuesta
from precheck.reglas import firmeza, gobierno

# campos del JSON que son informativos: el estado vive en la cadena de reglas (ADR-0005)
INFORMATIVOS = ("estado_revision", "aprobada_por")


@dataclass(frozen=True)
class ResultadoPropuesta:
    regla_id: str
    version: int
    estado: str                    # registrada | sin_cambios | error
    hash: Optional[str] = None
    codigo: Optional[str] = None
    mensaje: Optional[str] = None


def contenido_de(regla):
    return {k: v for k, v in regla.items() if k not in INFORMATIVOS}


def proponer(ctx, catalogo):
    reg = ctx.registro()
    yo = ctx.persona(reg)
    exigir_rol(reg, yo, "redactor")
    est = ctx.estado_reglas()
    texto = norm(ctx.textos_normativa())
    res = []
    for regla in catalogo:
        contenido = contenido_de(regla)
        regla_id, version = contenido["id"], int(contenido["version"])
        h = hash_contenido(contenido)
        try:
            cita = (contenido.get("fuente") or {}).get("cita_textual") or ""
            if not cita_en_normativa(cita, texto):
                raise ErrorPreCheck("regla.cita_no_encontrada", regla=regla_id, version=version)
            try:
                for campo in ("aplica_si", "condicion"):
                    if contenido.get(campo) or (campo == "condicion" and contenido.get("tipo") != "criterio"):
                        validar_expresion(contenido.get(campo))
            except ValueError as err:
                raise ErrorPreCheck("regla.expresion_invalida", regla=regla_id, version=version, detalle=str(err)) from err
            # ADR-0017: valores permitidos, coherencia y fundamento literal (solo de los campos presentes)
            for codigo, errores in (("regla.valor_no_permitido", firmeza.errores_de_valores(contenido)),
                                    ("regla.clasificacion_incoherente",
                                     firmeza.errores_de_invariantes(contenido) if contenido.get("subsanacion") else [])):
                if errores:
                    raise ErrorPreCheck(codigo, regla=regla_id, version=version, detalle="; ".join(errores))
            fundamento = contenido.get("fundamento") or {}
            for clave in ("cita", "cita_subsanacion"):
                if fundamento.get(clave) and not cita_en_normativa(fundamento[clave], texto):
                    raise ErrorPreCheck("regla.fundamento_no_encontrado", regla=regla_id, version=version)
            if gobierno.validar_propuesta(est, regla_id, version, h) == "sin_cambios":
                res.append(ResultadoPropuesta(regla_id, version, "sin_cambios", h))
                continue
            ev = ctx.anexar("reglas", "propuesta", yo, "redactor", {
                "regla_id": regla_id, "version": version, "hash_contenido": h,
                "vigencia": contenido.get("vigencia") or {}, "norma": gobierno.norma_de(regla_id)},
                contenidos=[contenido])      # contenido y evento en la misma transacción (review B3)
            est.versiones[(regla_id, version)] = {
                "hash": h, "vigencia": contenido.get("vigencia") or {}, "norma": gobierno.norma_de(regla_id),
                "redactor": yo, "estado": "borrador", "propuesta_seq": ev.seq}
            res.append(ResultadoPropuesta(regla_id, version, "registrada", h))
        except ErrorPreCheck as e:
            res.append(ResultadoPropuesta(regla_id, version, "error", h, e.codigo, e.mensaje))
    return res


@dataclass(frozen=True)
class Retiro:
    evento: object
    usos: list


def _aprobador(ctx):
    reg = ctx.registro()
    yo = ctx.persona(reg)
    exigir_aprobador(reg, yo)
    return reg, yo


def aprobar(ctx, regla_id, version):
    """AC-09 a AC-11: solo un aprobador designado, nunca sobre una versión que redactó."""
    reg, yo = _aprobador(ctx)
    v = gobierno.validar_aprobacion(ctx.estado_reglas(), regla_id, version)
    puede_aprobar(reg, yo, redactada_por=v["redactor"])
    ev = ctx.anexar("reglas", "aprobacion", yo, "aprobador", {"regla_id": regla_id, "version": version})
    if ctx.estado_reglas().versiones[(regla_id, version)]["estado"] != "aprobada":   # perdió una carrera
        raise ErrorPreCheck("regla.vigencia_solapada", regla=regla_id, version=version, evento=ev.seq)
    return ev


def rechazar(ctx, regla_id, version, motivo):
    _, yo = _aprobador(ctx)
    motivo = _motivo(motivo)
    gobierno.validar_rechazo(ctx.estado_reglas(), regla_id, version)
    return ctx.anexar("reglas", "rechazo", yo, "aprobador",
                      {"regla_id": regla_id, "version": version, "motivo": motivo})


def retirar(ctx, regla_id, version, motivo):
    """AC-20b: deja de aplicarse, conserva su historia y lista los resultados que dependían de ella."""
    _, yo = _aprobador(ctx)
    motivo = _motivo(motivo)
    gobierno.validar_retiro(ctx.estado_reglas(), regla_id, version)
    ev = ctx.anexar("reglas", "retiro", yo, "aprobador", {"regla_id": regla_id, "version": version, "motivo": motivo})
    return Retiro(ev, ctx.repo.usos(regla_id, version))


# --- suspensión en bloque (ADR-0008, AC-20) ----------------------------------------------------

@dataclass(frozen=True)
class Confirmacion:
    evento: object
    afectados: tuple = ()          # ({"expediente", "evaluaciones": {seq: [regla_id]}}, …) que dependían de la norma


def _proponer_norma(ctx, tipo, norma, motivo):
    _, yo = _aprobador(ctx)
    motivo = _motivo(motivo)
    gobierno.exigir_norma(norma)
    return ctx.anexar("reglas", tipo, yo, "aprobador", {"norma": norma, "motivo": motivo})


def proponer_suspension(ctx, norma, motivo):
    """No rige hasta que otra persona aprobadora la confirma."""
    return _proponer_norma(ctx, "suspension_propuesta", norma, motivo)


def proponer_levantamiento(ctx, norma, motivo):
    return _proponer_norma(ctx, "levantamiento_propuesto", norma, motivo)


def _oficiales(ctx, cache, cadena_id, seq):
    """Reglas cuyo resultado era oficial (versión aprobada) en esa evaluación; una lectura por evaluación."""
    if (cadena_id, seq) not in cache:
        ev = ctx.repo.evento(cadena_id, seq)
        cache[(cadena_id, seq)] = ({r["regla_id"] for r in ev.payload.get("resultados", [])
                                    if r.get("estado_regla") == "aprobada"}
                                   if ev is not None and ev.tipo == "evaluacion" else set())
    return cache[(cadena_id, seq)]


def _marcar_afectados(ctx, confirmacion, norma, actor):
    """Anexa «afectado_suspension» a cada expediente con resultados aplicables de la norma o sus
    derivadas, sin modificar sus resultados. Es idempotente: un reintento completa lo que faltó y no
    duplica marcas (review B2). Devuelve, por expediente, las evaluaciones y reglas afectadas."""
    normas = gobierno.derivadas(norma)
    por_cadena, cache = {}, {}
    for (regla_id, version), datos in ctx.estado_reglas().versiones.items():
        if datos["norma"] in normas:
            for cadena_id, seq in ctx.repo.usos(regla_id, version):
                if regla_id in _oficiales(ctx, cache, cadena_id, seq):
                    por_cadena.setdefault(cadena_id, {}).setdefault(seq, []).append(regla_id)
    afectados = []
    for cadena_id, evaluaciones in sorted(por_cadena.items()):
        evaluaciones = {s: sorted(r) for s, r in sorted(evaluaciones.items())}
        ya = any(e.tipo == "afectado_suspension" and e.payload.get("confirmacion_seq") == confirmacion.seq
                 for e in ctx.repo.leer(cadena_id))
        if not ya:
            ctx.anexar(cadena_id, "afectado_suspension", actor, "aprobador", {
                "norma": norma, "normas": sorted(normas), "confirmacion_seq": confirmacion.seq,
                "evaluaciones": {str(s): r for s, r in evaluaciones.items()}})
        afectados.append({"expediente": cadena_id.split(":", 1)[1], "evaluaciones": evaluaciones})
    return tuple(afectados)


def confirmar(ctx, propuesta_seq):
    """Confirma cualquier propuesta de cuatro ojos; una suspensión marca además los afectados.
    Repetir sobre una suspensión ya confirmada completa el marcado pendiente (review B2)."""
    eventos = ctx.eventos_reglas()
    prop = next((e for e in eventos if e.seq == propuesta_seq), None)
    previa = next((e for e in eventos if e.tipo == "suspension_confirmada"
                   and e.payload.get("propuesta_seq") == propuesta_seq), None)
    est = ctx.estado_reglas()
    if prop is not None and prop.tipo == "suspension_propuesta" and previa is not None \
            and propuesta_seq in est.resueltas:
        _, yo = _aprobador(ctx)            # el reintento también exige identidad y rol (re-revisión)
        if est.suspendidas.get(prop.payload["norma"]) != previa.seq:   # levantada o reemplazada por otra
            return Confirmacion(previa)
        return Confirmacion(previa, _marcar_afectados(ctx, previa, prop.payload["norma"], yo))
    ev = confirmar_propuesta(ctx, propuesta_seq)
    if ev.tipo != "suspension_confirmada":
        return Confirmacion(ev)
    return Confirmacion(ev, _marcar_afectados(ctx, ev, prop.payload["norma"], ev.actor))
