"""T6 — RepositorioSQLite detrás del puerto de bitácora (AC-19)."""
import sqlite3
import tempfile
import unittest
from pathlib import Path

from precheck.auditoria.cadena import EventoNuevo, verificar
from precheck.auditoria.canonico import hash_contenido
from precheck.auditoria.puertos import RepositorioBitacora
from precheck.auditoria.sqlite_repo import RepositorioSQLite
from precheck.errores import ErrorRegla

CONTENIDO = {"id": "A110-TEST-X", "version": 1, "condicion": "x >= 1"}


def ev(i, tipo="evaluacion"):
    return EventoNuevo(tipo, "P-1", "revisor_doyc", f"2026-09-27T00:00:{i:02d}Z", {"n": i})


class TestRepositorioSQLite(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.repo = RepositorioSQLite(Path(self.dir.name) / "bitacora.sqlite3")

    def tearDown(self):
        self.repo.cerrar()
        self.dir.cleanup()

    def test_cumple_el_puerto(self):
        self.assertIsInstance(self.repo, RepositorioBitacora)

    def test_anexar_y_leer_en_orden(self):
        for i in range(1, 4):
            self.repo.anexar("expediente:E1", ev(i))
        eventos = list(self.repo.leer("expediente:E1"))
        self.assertEqual([e.seq for e in eventos], [1, 2, 3])
        self.assertEqual(eventos[1].payload, {"n": 2})
        self.assertEqual(verificar(eventos), (True, None))
        self.assertEqual([e.seq for e in self.repo.leer("expediente:E1", desde=2)], [2, 3])

    def test_cabezas_de_todas_las_cadenas(self):
        a = self.repo.anexar("expediente:E1", ev(1))
        b = self.repo.anexar("reglas", ev(2, "propuesta"))
        self.assertEqual(self.repo.cabezas(), {"reglas": b.hash, "expediente:E1": a.hash})

    def test_contenido_idempotente_e_inmutable(self):
        h = self.repo.guardar_contenido(CONTENIDO)
        self.assertEqual(h, hash_contenido(CONTENIDO))
        self.assertEqual(self.repo.guardar_contenido(dict(CONTENIDO)), h)
        self.assertEqual(self.repo.contenido(h), CONTENIDO)
        with self.assertRaises(ErrorRegla) as cm:
            self.repo.guardar_contenido(dict(CONTENIDO, condicion="x >= 2"))
        self.assertEqual(cm.exception.codigo, "regla.inmutable")

    def test_usos_se_escriben_con_el_evento(self):
        self.repo.guardar_contenido(CONTENIDO)
        e = self.repo.anexar("expediente:E1", ev(1), usos=[("A110-TEST-X", 1)])
        self.assertEqual(self.repo.usos("A110-TEST-X", 1), [("expediente:E1", e.seq)])

    def test_anexar_es_atomico(self):
        # un uso que viola la FK aborta también el evento
        with self.assertRaises(sqlite3.IntegrityError):
            self.repo.anexar("expediente:E1", ev(1), usos=[("NO-EXISTE", 1)])
        self.assertEqual(list(self.repo.leer("expediente:E1")), [])

    def test_persiste_en_disco(self):
        self.repo.anexar("expediente:E1", ev(1))
        ruta = self.repo.ruta
        self.repo.cerrar()
        self.repo = RepositorioSQLite(ruta)
        self.assertEqual(len(list(self.repo.leer("expediente:E1"))), 1)


if __name__ == "__main__":
    unittest.main()
