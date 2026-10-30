"""Review M9, B3, B5 — temas en la cobertura, contenido y evento en una transacción, estado_regla(en)."""
import sqlite3
import unittest
from unittest import mock

import precheck
from precheck.expediente import servicio as exp
from precheck.reglas import servicio as reglas
from tests.apoyo import Entorno, equipo, version_vigente
from tests.test_evaluar import CATALOGO, caso
from tests.test_proponer import A110


class TestAjustes(unittest.TestCase):
    def setUp(self):
        self.e = equipo(Entorno())

    def tearDown(self):
        self.e.cerrar()

    def test_cobertura_declara_temas_por_norma(self):
        reglas.proponer(self.e.como("cuenta-0003"), CATALOGO)
        ev = exp.evaluar(self.e.como("cuenta-0004"), "EXP-TEST-1000", caso())
        temas = ev.cobertura.temas_evaluados["PLOT-A61-2021"]
        self.assertIn("FRENTE", temas)
        self.assertEqual(list(temas), sorted(temas))

    def test_contenido_y_evento_en_la_misma_transaccion(self):
        with mock.patch.object(self.e.repo, "_ultimo", side_effect=sqlite3.OperationalError("base bloqueada")):
            r = None
            with self.assertRaises(sqlite3.OperationalError):
                r = reglas.proponer(self.e.como("cuenta-0003"), A110[:1])
        self.assertIsNone(r)
        self.assertEqual(self.e.repo.con.execute("SELECT count(*) FROM contenido_regla").fetchone()[0], 0)
        self.assertEqual(reglas.proponer(self.e.como("cuenta-0003"), A110[:1])[0].estado, "registrada")

    def test_estado_regla_en_una_fecha(self):
        reloj = iter(["2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"])
        self.e.ctx.reloj = lambda: next(reloj)
        reglas.proponer(self.e.como("cuenta-0003"), A110[:1])
        reglas.aprobar(self.e.como("cuenta-0001"), A110[0]["id"], version_vigente(A110[0]["id"]))
        pc = precheck.PreCheck(self.e.ctx)
        self.assertEqual(pc.estado_regla(A110[0]["id"], version_vigente(A110[0]["id"]), en="2026-02-01T00:00:00Z"), "borrador")
        self.assertEqual(pc.estado_regla(A110[0]["id"], version_vigente(A110[0]["id"])), "aprobada")


if __name__ == "__main__":
    unittest.main()
