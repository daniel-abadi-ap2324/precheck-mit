"""Registro de personas: inicializar, vincular cuenta, designar y confirmar propuestas (ADR-0006).

`confirmar` es genérico para toda propuesta de cuatro ojos de la cadena de reglas: vinculación,
designación, suspensión y levantamiento.
"""
from precheck.errores import ErrorGobierno, ErrorIdentidad
from precheck.personas.registro import ROLES

_CONFIRMACION = {"vinculo_propuesto": "vinculo_confirmado", "designacion_propuesta": "designacion_confirmada",
                 "suspension_propuesta": "suspension_confirmada", "levantamiento_propuesto": "levantamiento_confirmado"}


def _motivo(motivo):
    if not (motivo or "").strip():
        raise ErrorGobierno("gobierno.motivo_obligatorio")
    return motivo.strip()


def exigir_aprobador(registro, persona):
    if "aprobador" not in registro.roles(persona):
        raise ErrorGobierno("gobierno.sin_designacion", persona=persona)


def inicializar(ctx, persona_id, nombre, segunda_persona_id, segundo_nombre, segunda_cuenta):
    """Génesis: quien ejecuta y una segunda persona quedan como los dos primeros aprobadores, para que
    desde el inicio toda designación pueda confirmarla alguien distinto del proponente y del sujeto."""
    reg = ctx.registro()
    if reg.inicializado():
        raise ErrorGobierno("gobierno.ya_inicializado")
    if persona_id == segunda_persona_id or ctx.cuenta() == segunda_cuenta:
        raise ErrorGobierno("gobierno.sin_segunda_persona")
    return ctx.anexar("reglas", "designacion_genesis", persona_id, "aprobador", {"personas": [
        {"persona_id": persona_id, "nombre": nombre, "cuenta": ctx.cuenta()},
        {"persona_id": segunda_persona_id, "nombre": segundo_nombre, "cuenta": segunda_cuenta}]})


def vincular_cuenta(ctx, persona_id, nombre, cuenta):
    reg = ctx.registro()
    yo = ctx.persona(reg)
    exigir_aprobador(reg, yo)
    if reg.persona_de_cuenta(cuenta) is not None:
        raise ErrorIdentidad("identidad.cuenta_ya_vinculada", cuenta=cuenta)
    return ctx.anexar("reglas", "vinculo_propuesto", yo, "aprobador",
                      {"persona_id": persona_id, "nombre": nombre, "cuenta": cuenta})


def designar(ctx, persona_id, rol, motivo):
    reg = ctx.registro()
    yo = ctx.persona(reg)
    exigir_aprobador(reg, yo)
    motivo = _motivo(motivo)
    if rol not in ROLES:
        raise ValueError(f"rol desconocido: {rol}")
    if persona_id not in reg.personas:
        raise ErrorIdentidad("identidad.cuenta_no_vinculada", persona=persona_id)
    return ctx.anexar("reglas", "designacion_propuesta", yo, "aprobador",
                      {"persona_id": persona_id, "rol": rol, "motivo": motivo})


def _propuesta(ctx, propuesta_seq):
    for ev in ctx.eventos_reglas():
        if ev.seq == propuesta_seq and ev.tipo in _CONFIRMACION:
            return ev
    raise ErrorGobierno("gobierno.propuesta_inexistente", propuesta=propuesta_seq)


def confirmar(ctx, propuesta_seq):
    """Confirma una propuesta de cuatro ojos. Devuelve el evento de confirmación."""
    prop = _propuesta(ctx, propuesta_seq)
    reg = ctx.registro()
    if prop.tipo in ("vinculo_propuesto", "designacion_propuesta"):
        resuelta = prop.seq in reg.resueltas
    else:
        resuelta = prop.seq in ctx.estado_reglas().resueltas
    if resuelta:
        raise ErrorGobierno("gobierno.propuesta_ya_resuelta", propuesta=propuesta_seq)
    # la persona NUEVA que se vincula acepta desde la cuenta propuesta, todavía sin vínculo
    cuenta = ctx.cuenta()
    yo = prop.payload["persona_id"] if reg.aceptacion_propia(prop.seq, cuenta) else ctx.persona(reg)
    if yo == prop.actor or (yo == prop.payload.get("persona_id") and not reg.aceptacion_propia(prop.seq, cuenta)):
        raise ErrorGobierno("gobierno.sin_segunda_persona", propuesta=propuesta_seq)
    if prop.tipo == "vinculo_propuesto" and reg.persona_de_cuenta(prop.payload["cuenta"]) is not None:
        raise ErrorIdentidad("identidad.cuenta_ya_vinculada", cuenta=prop.payload["cuenta"])
    if prop.tipo in ("vinculo_propuesto", "designacion_propuesta"):
        nueva = reg.propuestas[prop.seq][1]
        if not reg.confirmacion_valida(prop, nueva, yo, cuenta):
            raise ErrorGobierno("gobierno.sin_designacion", persona=yo)
    else:
        exigir_aprobador(reg, yo)
    rol = "aprobador" if "aprobador" in reg.roles(yo) else "designado"
    return ctx.anexar("reglas", _CONFIRMACION[prop.tipo], yo, rol, {"propuesta_seq": prop.seq, "cuenta": cuenta})
