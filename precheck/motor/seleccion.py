"""Selección de la versión aplicable (ADR-0005). Dominio puro.

La versión se elige por la fecha de presentación (AC-02); su estado es el actual, a la fecha de
evaluación. Rige la aprobada más reciente que cubre la fecha. Un borrador solo aporta un
indicativo. Una retirada o suspendida sin aprobada vigente da REQUIERE_REVISION sin volver a una
versión anterior. Una rechazada no se evalúa.
"""
from dataclasses import dataclass
from typing import Optional

from precheck.reglas.gobierno import cubre


@dataclass(frozen=True)
class Seleccion:
    regla_id: str
    version: int
    hash: str
    estado: str
    modo: str                                # oficial | indicativo | sin_oficial
    borrador_version: Optional[int] = None   # borrador más nuevo que la oficial, solo como pista
    borrador_hash: Optional[str] = None


def seleccionar(regla_id, est, fecha_presentacion) -> Optional[Seleccion]:
    candidatas = [(v, d, est.estado(regla_id, v)) for v, d in est.de_regla(regla_id)
                  if cubre(d["vigencia"], fecha_presentacion)]
    candidatas = [c for c in candidatas if c[2] != "rechazada"]
    if not candidatas:
        return None
    oficiales = [c for c in candidatas if c[2] == "aprobada"]
    borradores = [c for c in candidatas if c[2] == "borrador"]
    if oficiales:
        v, d, e = oficiales[-1]
        nuevo = [b for b in borradores if b[0] > v]
        return Seleccion(regla_id, v, d["hash"], e, "oficial",
                         nuevo[-1][0] if nuevo else None, nuevo[-1][1]["hash"] if nuevo else None)
    if borradores:
        v, d, e = borradores[-1]
        return Seleccion(regla_id, v, d["hash"], e, "indicativo")
    v, d, e = candidatas[-1]
    return Seleccion(regla_id, v, d["hash"], e, "sin_oficial")
