"""Fixtures de prueba (data-model.md §Test fixtures). Datos ficticios: *@example.test, Test User."""
import pathlib
import tempfile

from precheck import NORMATIVA_POR_DEFECTO
from precheck.auditoria.sqlite_repo import RepositorioSQLite
from precheck.contexto import Contexto

RAIZ = pathlib.Path(__file__).resolve().parent.parent
# La misma lista que usa la fachada: los fundamentos de ADR-0017 citan también el PLOT, el Decreto 88 y las zonas exceptuadas.
NORMATIVA = list(NORMATIVA_POR_DEFECTO)


class ResolutorFalso:
    def __init__(self, cuenta="cuenta-0001"):
        self.cuenta = cuenta

    def cuenta_actual(self):
        return self.cuenta


class Entorno:
    """Bitácora descartable por prueba + resolutor que permite actuar como distintas cuentas."""

    def __init__(self):
        self.dir = tempfile.TemporaryDirectory()
        self.repo = RepositorioSQLite(pathlib.Path(self.dir.name) / "bitacora.sqlite3")
        self.resolutor = ResolutorFalso()
        self.ctx = Contexto(self.repo, self.resolutor, NORMATIVA)

    def como(self, cuenta):
        self.resolutor.cuenta = cuenta
        return self.ctx

    def cerrar(self):
        self.repo.cerrar()
        self.dir.cleanup()


def equipo(entorno):
    """P-0001 y P-0002 aprobadores génesis; P-0003 redactor; P-0004 revisor DOYC.

    Cada persona nueva acepta su vínculo desde su cuenta; cada rol lo propone P-0001 y lo confirma
    P-0002 (un aprobador distinto del proponente y del sujeto)."""
    from precheck.personas import servicio as per
    per.inicializar(entorno.como("cuenta-0001"), "P-0001", "Test User 1", "P-0002", "Test User 2", "cuenta-0002")
    for n, rol in (("0003", "redactor"), ("0004", "revisor_doyc")):
        seq = per.vincular_cuenta(entorno.como("cuenta-0001"), f"P-{n}", f"Test User {n}", f"cuenta-{n}").seq
        per.confirmar(entorno.como(f"cuenta-{n}"), seq)
        seq = per.designar(entorno.como("cuenta-0001"), f"P-{n}", rol, "alta en pruebas").seq
        per.confirmar(entorno.como("cuenta-0002"), seq)
    return entorno


def version_vigente(regla_id):
    """Versión de la regla en el catálogo (reglas/): las pruebas de gobierno aprueban esa, no un número fijo."""
    import json
    for f in sorted((RAIZ / "reglas").glob("*.json")):
        for r in json.loads(f.read_text(encoding="utf-8")):
            if r["id"] == regla_id:
                return r["version"]
    raise KeyError(regla_id)
