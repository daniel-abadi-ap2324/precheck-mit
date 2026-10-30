"""Estado de las reglas derivado de la cadena de reglas (ADR-0005, ADR-0008). Dominio puro.

El catálogo guarda contenido; el estado de cada versión (borrador, aprobada, rechazada, retirada,
suspendida) sale de los eventos. La suspensión es un evento aparte, de cuatro ojos, que no toca la
vigencia y abarca las normas derivadas.
"""
import json
import pathlib
from dataclasses import dataclass, field

from precheck.errores import ErrorGobierno, ErrorRegla
from precheck.personas.registro import Registro

NORMAS = json.loads((pathlib.Path(__file__).resolve().parent / "normas.json").read_text(encoding="utf-8"))


def norma_de(regla_id):
    for codigo, n in NORMAS.items():
        if any(regla_id.startswith(p) for p in n["prefijos"]):
            return codigo
    return None


def exigir_norma(codigo):
    if codigo not in NORMAS:
        raise ErrorGobierno("gobierno.norma_desconocida", norma=codigo)


def linaje(codigo):
    """La norma y todas aquellas de las que deriva."""
    res = []
    while codigo:
        res.append(codigo)
        codigo = (NORMAS.get(codigo) or {}).get("deriva_de")
    return res


def derivadas(codigo):
    """La norma y todas las que derivan de ella."""
    return {c for c in NORMAS if codigo in linaje(c)}


@dataclass
class EstadoReglas:
    versiones: dict = field(default_factory=dict)      # (regla_id, version) -> dict
    suspendidas: dict = field(default_factory=dict)    # norma -> seq de la confirmación
    propuestas: dict = field(default_factory=dict)     # seq -> evento de propuesta de suspensión/levantamiento
    resueltas: set = field(default_factory=set)

    def estado(self, regla_id, version):
        v = self.versiones.get((regla_id, version))
        if v is None:
            return None
        if v["estado"] == "aprobada" and any(n in self.suspendidas for n in linaje(v["norma"])):
            return "suspendida"
        return v["estado"]

    def de_regla(self, regla_id):
        return sorted(((k[1], v) for k, v in self.versiones.items() if k[0] == regla_id), key=lambda x: x[0])

    def reglas(self):
        return sorted({k[0] for k in self.versiones})


_TRANSICION = {"aprobacion": ("borrador", "aprobada"), "rechazo": ("borrador", "rechazada"),
               "retiro": ("aprobada", "retirada")}


def _aprobacion_valida(est, reg, ev, v):
    """Revalida al derivar lo que el servicio validó al anexar (review M1): aprobador en ese momento,
    distinto del redactor y sin solaparse con otra versión aprobada."""
    p = ev.payload
    if "aprobador" not in reg.roles(ev.actor) or ev.actor == v["redactor"]:
        return False
    return not any(otra != p["version"] and d["estado"] == "aprobada" and _solapan(d["vigencia"], v["vigencia"])
                   for otra, d in est.de_regla(p["regla_id"]))


def recorrer(eventos_reglas):
    """Deriva el estado en una sola pasada: produce (evento, estado) después de aplicar cada evento con el
    registro de personas vigente en ese momento. El estado es un único objeto que se va mutando."""
    reg = Registro()
    est = EstadoReglas()
    for ev in eventos_reglas:
        _aplicar(est, reg, ev)
        reg.aplicar(ev)
        yield ev, est


def estado_de_reglas(eventos_reglas) -> EstadoReglas:
    """Deriva el estado evento a evento con el registro de personas vigente en cada momento."""
    reg = Registro()
    est = EstadoReglas()
    for ev in eventos_reglas:
        _aplicar(est, reg, ev)
        reg.aplicar(ev)
    return est


def _aplicar(est, registro, ev):
    p = ev.payload
    if ev.tipo == "propuesta":
        est.versiones.setdefault((p["regla_id"], p["version"]), {
            "hash": p["hash_contenido"], "vigencia": p.get("vigencia") or {}, "norma": p.get("norma"),
            "redactor": ev.actor, "estado": "borrador", "propuesta_seq": ev.seq})
    elif ev.tipo in _TRANSICION:
        v = est.versiones.get((p["regla_id"], p["version"]))
        desde, hacia = _TRANSICION[ev.tipo]
        if not v or v["estado"] != desde or "aprobador" not in registro.roles(ev.actor):
            return
        if ev.tipo == "aprobacion" and not _aprobacion_valida(est, registro, ev, v):
            return
        v["estado"] = hacia
    elif ev.tipo in ("suspension_propuesta", "levantamiento_propuesto"):
        est.propuestas[ev.seq] = ev
    elif ev.tipo in ("suspension_confirmada", "levantamiento_confirmado"):
        prop = est.propuestas.get(p.get("propuesta_seq"))
        if (prop is None or prop.seq in est.resueltas or ev.actor == prop.actor
                or "aprobador" not in registro.roles(ev.actor)):
            return
        est.resueltas.add(prop.seq)
        if prop.tipo == "suspension_propuesta":
            est.suspendidas[prop.payload["norma"]] = ev.seq
        else:
            est.suspendidas.pop(prop.payload["norma"], None)


def cubre(vigencia, fecha):
    desde, hasta = str(vigencia.get("desde") or "0000"), vigencia.get("hasta")
    return desde <= fecha and (hasta is None or fecha <= str(hasta))


def _solapan(a, b):
    a0, a1 = str(a.get("desde") or "0000"), str(a.get("hasta") or "9999")
    b0, b1 = str(b.get("desde") or "0000"), str(b.get("hasta") or "9999")
    return a0 <= b1 and b0 <= a1


def validar_propuesta(est, regla_id, version, hash_contenido):
    v = est.versiones.get((regla_id, version))
    if v is None:
        return "nueva"
    if v["hash"] != hash_contenido:
        raise ErrorRegla("regla.inmutable", regla=regla_id, version=version)
    return "sin_cambios"


def _existente(est, regla_id, version):
    v = est.versiones.get((regla_id, version))
    if v is None:
        raise ErrorRegla("regla.version_inexistente", regla=regla_id, version=version)
    return v


def validar_aprobacion(est, regla_id, version):
    v = _existente(est, regla_id, version)
    if v["estado"] != "borrador":
        raise ErrorRegla("regla.estado_invalido", regla=regla_id, version=version, estado=v["estado"])
    for otra, datos in est.de_regla(regla_id):
        if otra != version and datos["estado"] == "aprobada" and _solapan(datos["vigencia"], v["vigencia"]):
            raise ErrorRegla("regla.vigencia_solapada", regla=regla_id, version=version, con=otra)
    return v


def validar_rechazo(est, regla_id, version):
    v = _existente(est, regla_id, version)
    if v["estado"] != "borrador":
        raise ErrorRegla("regla.estado_invalido", regla=regla_id, version=version, estado=v["estado"])
    return v


def validar_retiro(est, regla_id, version):
    v = _existente(est, regla_id, version)
    if v["estado"] != "aprobada":
        raise ErrorRegla("regla.estado_invalido", regla=regla_id, version=version, estado=v["estado"])
    return v
