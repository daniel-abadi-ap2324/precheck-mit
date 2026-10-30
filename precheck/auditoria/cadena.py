"""Cadena de eventos de la bitácora: dominio puro, sin E/S (ADR-0003).

El hash de cada evento cubre el sobre completo (cadena, tipo, actor, rol, fecha y payload), no solo
el payload: así no se puede cambiar quién hizo algo, ni mover un evento a otra cadena, sin romperla.
"""
from dataclasses import dataclass, field
from typing import Mapping, Optional, Sequence

from precheck.auditoria.canonico import calcular


@dataclass(frozen=True)
class EventoNuevo:
    tipo: str
    actor: str
    rol: str
    ocurrido_en: str
    payload: Mapping = field(default_factory=dict)


@dataclass(frozen=True)
class EventoRegistrado:
    cadena_id: str
    seq: int
    tipo: str
    actor: str
    rol: str
    ocurrido_en: str
    payload: Mapping
    hash_previo: str
    hash: str


def sobre(cadena_id, evento) -> dict:
    return {"cadena_id": cadena_id, "tipo": evento.tipo, "actor": evento.actor, "rol": evento.rol,
            "ocurrido_en": evento.ocurrido_en, "payload": evento.payload}


def encadenar(cadena_id: str, previo: Optional[EventoRegistrado], nuevo: EventoNuevo) -> EventoRegistrado:
    hash_previo = previo.hash if previo else ""
    return EventoRegistrado(cadena_id=cadena_id, seq=(previo.seq + 1) if previo else 1,
                            tipo=nuevo.tipo, actor=nuevo.actor, rol=nuevo.rol,
                            ocurrido_en=nuevo.ocurrido_en, payload=nuevo.payload,
                            hash_previo=hash_previo, hash=calcular(hash_previo, sobre(cadena_id, nuevo)))


def verificar(eventos: Sequence[EventoRegistrado]):
    """(True, None) si la cadena es íntegra; si no, (False, seq del primer evento que la rompe)."""
    previo_hash = ""
    for esperado, ev in enumerate(eventos, start=1):
        if ev.seq != esperado or ev.hash_previo != previo_hash or ev.hash != calcular(ev.hash_previo, sobre(ev.cadena_id, ev)):
            return False, ev.seq
        previo_hash = ev.hash
    return True, None


def cabeza(eventos: Sequence[EventoRegistrado]) -> str:
    return eventos[-1].hash if eventos else ""
