"""T14 — sellar y verificar contra el anclaje externo (AC-19, AC-19b)."""
import pathlib
import tempfile
import unittest

from precheck.auditoria import sello
from precheck.auditoria.sqlite_repo import RepositorioSQLite
from tests.apoyo import Entorno


def evaluaciones(ctx, expediente, n):
    for i in range(n):
        ctx.anexar(f"expediente:{expediente}", "evaluacion", "P-0004", "revisor_doyc", {"n": i})


class TestSello(unittest.TestCase):
    def setUp(self):
        self.e = Entorno()
        self.anclas = tempfile.TemporaryDirectory()
        self.e.ctx.destino_anclaje = sello.DestinoArchivo(self.anclas.name)
        evaluaciones(self.e.ctx, "E1", 3)
        evaluaciones(self.e.ctx, "E2", 2)

    def tearDown(self):
        self.e.cerrar()
        self.anclas.cleanup()

    def test_sellar_registra_y_exporta(self):
        s = sello.sellar(self.e.ctx)
        self.assertEqual(set(s.cabezas), {"expediente:E1", "expediente:E2"})
        self.assertEqual(len(s.hash), 64)
        self.assertEqual(self.e.ctx.destino_anclaje.ultimo(), s)
        ultimo = list(self.e.repo.leer("reglas"))[-1]
        self.assertEqual((ultimo.tipo, ultimo.payload["hash"]), ("sello", s.hash))
        self.assertTrue(ultimo.actor.startswith("sistema:precheck@"))

    def test_integra_y_coincide(self):
        sello.sellar(self.e.ctx)
        evaluaciones(self.e.ctx, "E1", 1)          # la cadena crece después del sello
        v = sello.verificar(self.e.ctx)
        self.assertEqual((v.integra, v.rota_en, v.coincide_sello), (True, None, True))
        self.assertTrue(sello.verificar(self.e.ctx, "expediente:E1").integra)

    def test_sin_sello_solo_verifica_la_cadena(self):
        v = sello.verificar(self.e.ctx, "expediente:E1")
        self.assertEqual((v.integra, v.coincide_sello), (True, None))

    def test_detecta_evento_alterado_saltando_los_triggers(self):
        # AC-19: alguien con acceso al archivo quita los triggers y altera un evento
        con = self.e.repo.con
        con.execute("DROP TRIGGER evento_sin_update")
        con.execute("UPDATE evento SET payload = '{\"n\":99}' WHERE cadena_id = 'expediente:E1' AND seq = 2")
        v = sello.verificar(self.e.ctx, "expediente:E1")
        self.assertEqual((v.integra, v.rota_en), (False, ("expediente:E1", 2)))

    def test_detecta_evento_eliminado(self):
        con = self.e.repo.con
        con.execute("DROP TRIGGER evento_sin_delete")
        con.execute("PRAGMA foreign_keys = OFF")
        con.execute("DELETE FROM evento WHERE cadena_id = 'expediente:E1' AND seq = 2")
        self.assertEqual(sello.verificar(self.e.ctx, "expediente:E1").rota_en, ("expediente:E1", 3))

    def test_reescritura_completa_no_coincide_con_el_sello(self):
        # AC-19b: bitácora rehecha con una cadena coherente consigo misma
        s = sello.sellar(self.e.ctx)
        with tempfile.TemporaryDirectory() as d:
            falsa = RepositorioSQLite(pathlib.Path(d) / "falsa.sqlite3")
            self.e.ctx.repo = falsa
            self.e.ctx.reloj = lambda: "2030-01-01T00:00:00Z"   # mismos pasos, otros instantes → otros hashes
            evaluaciones(self.e.ctx, "E1", 3)
            evaluaciones(self.e.ctx, "E2", 2)                   # ninguna cadena falta: solo cambian los hashes
            v = sello.verificar(self.e.ctx, sello=s)
            self.assertTrue(v.integra)
            self.assertFalse(v.coincide_sello)
            self.assertEqual(v.sello_fecha, s.fecha)
            falsa.cerrar()

    def test_cadena_desaparecida_no_coincide(self):
        s = sello.sellar(self.e.ctx)
        con = self.e.repo.con
        for t in ("evento_sin_delete", "cadena_sin_delete"):
            con.execute(f"DROP TRIGGER {t}")
        con.execute("PRAGMA foreign_keys = OFF")
        con.execute("DELETE FROM evento WHERE cadena_id = 'expediente:E2'")
        con.execute("DELETE FROM cadena WHERE id = 'expediente:E2'")
        self.assertFalse(sello.verificar(self.e.ctx, sello=s).coincide_sello)


if __name__ == "__main__":
    unittest.main()
