"""Sello diario de las cabezas de cadena y verificación de integridad (ADR-0007).

La cadena de hashes prueba el orden; el sello exportado fuera del sistema prueba que nadie
reescribió la bitácora completa después de sellarla.
"""
import json
import pathlib
from dataclasses import dataclass, field
from typing import Mapping, Optional, Tuple

from precheck.auditoria.cadena import verificar as verificar_cadena
from precheck.auditoria.canonico import calcular
from precheck.errores import IntegridadComprometida
from precheck.motor.version import VERSION_MOTOR


@dataclass(frozen=True)
class Sello:
    fecha: str
    cabezas: Mapping = field(default_factory=dict)
    hash: str = ""


@dataclass(frozen=True)
class Verificacion:
    integra: bool
    rota_en: Optional[Tuple[str, int]]
    coincide_sello: Optional[bool]
    sello_fecha: Optional[str]
    contenido_alterado: Tuple = ()           # (regla_id, version) cuyo contenido no coincide con su hash
    cadenas_sin_coincidir: Tuple[str, ...] = ()


class DestinoArchivo:
    """Adaptador de DestinoAnclaje: un archivo JSON por sello en un directorio de otra unidad."""

    def __init__(self, directorio, crear=True):
        self.dir = pathlib.Path(directorio)
        if crear:
            self.dir.mkdir(parents=True, exist_ok=True)

    def exportar(self, s):
        ruta = self.dir / f"sello-{s.fecha.replace(':', '')}.json"
        ruta.write_text(json.dumps({"fecha": s.fecha, "cabezas": dict(s.cabezas), "hash": s.hash},
                                   ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
        return str(ruta)

    def ultimo(self):
        archivos = sorted(self.dir.glob("sello-*.json")) if self.dir.is_dir() else []
        if not archivos:
            return None
        d = json.loads(archivos[-1].read_text(encoding="utf-8"))
        return Sello(d["fecha"], d["cabezas"], d["hash"])


def sellar(ctx):
    cabezas = ctx.repo.cabezas()
    fecha = ctx.reloj()
    s = Sello(fecha, cabezas, calcular("", {"fecha": fecha, "cabezas": cabezas}))
    ctx.anexar("reglas", "sello", f"sistema:precheck@{VERSION_MOTOR}", "sistema",
               {"fecha": s.fecha, "cabezas": dict(s.cabezas), "hash": s.hash})
    if ctx.destino_anclaje is not None:
        ctx.destino_anclaje.exportar(s)
    return s


def _contenido_alterado(ctx):
    """Filas que no coinciden con su hash y propuestas cuyo contenido falta o fue reemplazado,
    aunque se haya recalculado el hash de la fila (re-revisión de M2)."""
    malos = set(ctx.repo.contenidos_alterados())
    for ev in ctx.repo.leer("reglas"):
        if ev.tipo == "propuesta":
            p = ev.payload
            try:
                ctx.repo.contenido(p["hash_contenido"])
            except (IntegridadComprometida, KeyError):
                malos.add((p.get("regla_id"), p.get("version")))
    return tuple(sorted(malos))


def verificar(ctx, cadena_id=None, sello=None):
    """AC-19: recalcula la cadena. AC-19b: compara las cabezas selladas con la cadena actual."""
    if sello is None and ctx.destino_anclaje is not None:
        sello = ctx.destino_anclaje.ultimo()
    fecha = sello.fecha if sello else None
    cadenas = [cadena_id] if cadena_id else ctx.repo.cadenas()
    hashes = {}
    for c in cadenas:                       # primero las cadenas: el contenido se cruza con eventos íntegros
        eventos = list(ctx.repo.leer(c))
        ok, rota = verificar_cadena(eventos)
        if not ok:
            return Verificacion(False, (c, rota), None, fecha)
        hashes[c] = {e.hash for e in eventos}
    alterado = _contenido_alterado(ctx) if cadena_id is None else ()
    if alterado:
        return Verificacion(False, None, None, fecha, alterado)
    if sello is None:
        return Verificacion(True, None, None, None)
    if sello.hash != calcular("", {"fecha": sello.fecha, "cabezas": dict(sello.cabezas)}):
        return Verificacion(True, None, False, fecha)
    relevantes = {c: h for c, h in sello.cabezas.items() if cadena_id is None or c == cadena_id}
    if not relevantes:            # la cadena no estaba sellada: no hay contra qué comparar (review M3)
        return Verificacion(True, None, None, fecha)
    sin = tuple(sorted(c for c, h in relevantes.items() if c not in hashes or h not in hashes[c]))
    return Verificacion(True, None, not sin, fecha, (), sin)
