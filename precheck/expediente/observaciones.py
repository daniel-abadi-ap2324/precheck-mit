"""Predicados compartidos sobre resultados, decisiones e indicaciones (review B6). Dominio puro.

Un solo lugar para las reglas que usan `expediente.servicio` (decidir), `informe.servicio` (indicar) e
`informe.modelo` (observaciones y estado): qué resultado necesita decisión humana y cuál admite una
indicación al profesional, es decir, cuál es una observación (AC-08, AC-17, AC-21).
"""
from typing import Mapping, Optional

from precheck.errores import ErrorPreCheck
from precheck.motor.evaluador import REVISION

INDICACION = "indicacion"


def necesita_decision(resultado: Mapping) -> bool:
    """NO_CUMPLE bloqueante o REQUIERE_REVISION: exige decisión humana antes del visto bueno."""
    return (resultado["resultado"] == "NO_CUMPLE" and resultado.get("severidad") == "bloqueante") \
        or resultado["resultado"] == REVISION


def admite_indicacion(resultado: Optional[Mapping], decision: Optional[Mapping], cubiertas=None) -> bool:
    """¿Es una observación, sobre la que se escribe una indicación al profesional?

    `resultado` es el de la evaluación (None para una norma sin reglas, `norma:X`); `decision`, el payload
    de la última decisión sobre él en esa evaluación (o None); `cubiertas`, las reglas del visto bueno
    (None: no se exige que un NO_CUMPLE no bloqueante esté cubierto). Son observaciones: un veredicto
    humano desfavorable (sobre un REQUIERE_REVISION o una norma sin reglas), un NO_CUMPLE bloqueante
    confirmado y un NO_CUMPLE no bloqueante oficial."""
    if decision is not None and decision.get("accion") == "veredicto":
        return decision.get("veredicto") == "NO_CUMPLE" and (resultado is None or resultado["resultado"] == REVISION)
    if resultado is None or resultado["resultado"] != "NO_CUMPLE":
        return False
    if resultado.get("severidad") == "bloqueante":
        return decision is not None and decision.get("accion") == "confirmar"
    return cubiertas is None or resultado["regla_id"] in cubiertas


def texto_indicacion(texto: Optional[str]) -> str:
    """Texto de la indicación sin espacios de borde; vacío se rechaza (informe.indicacion_vacia)."""
    limpio = (texto or "").strip()
    if not limpio:
        raise ErrorPreCheck("informe.indicacion_vacia")
    return limpio


def payload_indicacion(evaluacion, regla_id: str, texto: str) -> dict:
    """Payload del evento `indicacion` sobre una evaluación registrada (ADR-0003)."""
    return {"evaluacion_seq": evaluacion.seq, "hash_evaluacion": evaluacion.hash, "regla_id": regla_id,
            "texto": texto}
