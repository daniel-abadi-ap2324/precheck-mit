"""Review B6 — punta a punta por la entrada real `python3 -m precheck` (AC-17, AC-19b)."""
import json
import pathlib
import shutil
import tempfile
import time
import unittest

from tests.test_cli import caso, cli, preparar


class TestExtremoAExtremoCli(unittest.TestCase):
    def setUp(self):
        self.dir = pathlib.Path(tempfile.mkdtemp())
        self.ruta = self.dir / "bitacora.sqlite3"
        self.anclas = self.dir / "anclas"
        preparar(self.ruta)
        self.hechos = self.dir / "hechos.json"
        self.hechos.write_text(json.dumps(caso()), encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.dir)

    def ok(self, r):
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r

    def test_evaluar_reproducir_sellar_y_detectar_reescritura(self):
        self.ok(cli(self.ruta, "evaluar", "--expediente", "EXP-CLI-0001", "--hechos", str(self.hechos)))
        r = self.ok(cli(self.ruta, "reproducir", "--expediente", "EXP-CLI-0001", "--evaluacion", "1"))
        self.assertIn("Reproducción: coincide", r.stdout)                                     # AC-17
        self.ok(cli(self.ruta, "sellar", "--destino", str(self.anclas)))
        r = self.ok(cli(self.ruta, "verificar", "--todo", "--destino", str(self.anclas)))
        self.assertIn("coincide con el sello", r.stdout)

        # otra bitácora coherente consigo misma reemplaza a la original (AC-19b)
        time.sleep(1.1)                      # instantes distintos → hashes distintos
        falsa = self.dir / "falsa.sqlite3"
        preparar(falsa)
        self.ok(cli(falsa, "evaluar", "--expediente", "EXP-CLI-0001", "--hechos", str(self.hechos)))
        falsa.replace(self.ruta)
        self.ok(cli(self.ruta, "verificar", "--reglas"))    # sin sello en el destino: la cadena sola «íntegra»…
        r = cli(self.ruta, "verificar", "--todo", "--destino", str(self.anclas))
        self.assertEqual(r.returncode, 3, r.stdout + r.stderr)                                 # …pero no el sello
        self.assertIn("NO coincide con el sello", r.stdout)


if __name__ == "__main__":
    unittest.main()
