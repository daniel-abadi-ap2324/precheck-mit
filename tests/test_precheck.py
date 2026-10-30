"""Pruebas del PreCheck MUPA. Ejecutar: python3 -m unittest discover -s tests -v"""
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parent.parent
MOTOR = RAIZ / "precheck/motor/motor.py"
CITAS = RAIZ / "precheck/motor/verificar_citas.py"
CADENA = RAIZ / "precheck/auditoria/verificar_cadena.py"
CASOS = RAIZ / "tests/casos"
TEXTOS = RAIZ / "normativa/zonificacion/textos"


def reglas_todas(tmp):
    reglas = []
    for f in sorted((RAIZ / "reglas").glob("*.json")):
        reglas += json.loads(f.read_text(encoding="utf-8"))
    ruta = pathlib.Path(tmp) / "todas.json"
    ruta.write_text(json.dumps(reglas, ensure_ascii=False), encoding="utf-8")
    return ruta


def evaluar(reglas, caso, *extra):
    out = subprocess.run([sys.executable, str(MOTOR), "--reglas", str(reglas), "--proyecto", str(caso),
                          "--modo-prueba", "--fecha", "2026-09-26", *extra],
                         capture_output=True, text=True, check=True).stdout
    d = json.loads(out)
    return d, {r["regla_id"]: r["resultado"] for r in d["resultados"]}


class TestMotor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.reglas = reglas_todas(cls.tmp.name)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_ids_unicos(self):
        reglas = json.loads(self.reglas.read_text(encoding="utf-8"))
        ids = [r["id"] for r in reglas]
        self.assertEqual(len(ids), len(set(ids)))

    def test_plot_1zm6_detecta_incumplimientos(self):
        d, r = evaluar(self.reglas, CASOS / "plot_1zm6_excede.json")
        self.assertEqual(d["resultado_global"], "NO_CUMPLE")
        self.assertEqual(r["PLOT-ZM6-LOTE-FRENTE"], "NO_CUMPLE")   # 15.2 < 16 m
        self.assertEqual(r["PLOT-ZM6-ALTURA"], "NO_CUMPLE")        # 16 > 15 pisos
        self.assertEqual(r["PLOT-ZM6-ACERA"], "NO_CUMPLE")         # 2.5 < 5.00 m
        self.assertEqual(r["PLOT-ZM6-DENSIDAD"], "CUMPLE")
        self.assertEqual(r["PLOT-ZM6-RETIROS"], "REQUIERE_REVISION")

    def test_resolucion_de_edificabilidad_manda_altura_a_revision(self):
        _, r = evaluar(self.reglas, CASOS / "plot_1zm6_con_resolucion.json")
        self.assertEqual(r["PLOT-ZM6-ALTURA"], "NO_APLICA")
        self.assertEqual(r["PLOT-EDIFICABILIDAD-ADICIONAL"], "REQUIERE_REVISION")

    def test_san_francisco_usa_limitacion_especial(self):
        _, r = evaluar(self.reglas, CASOS / "sf_paitilla_ut7.json")
        self.assertEqual(r["SF-PAITILLA-UT7-ZM7-ALTURA"], "CUMPLE")  # 24 <= 25 pisos (no 20 del PLOT)
        self.assertEqual(r["PLOT-ZM7-ALTURA"], "NO_APLICA")

    def test_dato_faltante_y_confianza_baja_van_a_revision(self):
        caso = json.loads((CASOS / "plot_1zm6_excede.json").read_text(encoding="utf-8"))
        del caso["proyecto"]["pisos_totales"]
        caso["lote"]["frente_m"]["confianza"] = 0.5
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(caso, f)
        _, r = evaluar(self.reglas, f.name)
        self.assertEqual(r["PLOT-ZM6-ALTURA"], "REQUIERE_REVISION")
        self.assertEqual(r["PLOT-ZM6-LOTE-FRENTE"], "REQUIERE_REVISION")

    def test_expresion_maliciosa_bloqueada(self):
        regla = [{"id": "X", "version": 1, "tipo": "cuantitativa", "entradas": [],
                  "condicion": "__import__('os').system('echo PWNED')", "severidad": "observacion",
                  "mensaje_no_cumple": "x", "estado_revision": "aprobada", "vigencia": {"desde": "2025-01-01"}}]
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(regla, f)
        out = subprocess.run([sys.executable, str(MOTOR), "--reglas", f.name, "--proyecto",
                              str(CASOS / "sf_paitilla_ut7.json")], capture_output=True, text=True)
        self.assertNotIn("PWNED", out.stdout)
        self.assertEqual(json.loads(out.stdout)["resultados"][0]["resultado"], "REQUIERE_REVISION")

    def test_sin_reglas_aprobadas_no_da_cumple_global(self):
        """Principio 2: sin reglas aprobadas no hay nada evaluado; el global nunca es CUMPLE."""
        out = subprocess.run([sys.executable, str(MOTOR), "--reglas", str(self.reglas), "--proyecto",
                              str(CASOS / "sf_paitilla_ut7.json"), "--fecha", "2026-09-26"],
                             capture_output=True, text=True, check=True).stdout
        d = json.loads(out)
        self.assertEqual(d["resultados"], [])
        self.assertEqual(d["resultado_global"], "REQUIERE_REVISION")
        self.assertFalse(d["oficial"])

    def test_modo_prueba_no_es_oficial(self):
        d, _ = evaluar(self.reglas, CASOS / "sf_paitilla_ut7.json")
        self.assertFalse(d["oficial"])


class TestCitas(unittest.TestCase):
    def verificar(self, reglas, *textos):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write("\n".join(pathlib.Path(t).read_text(encoding="utf-8") for t in textos))
        res = subprocess.run([sys.executable, str(CITAS), str(reglas), f.name], capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, res.stdout[-2000:])

    def test_citas_acuerdo_110(self):
        self.verificar(RAIZ / "reglas/reglas_a110_borrador.json", RAIZ / "normativa/acuerdo-110/texto-completo.md")

    def test_citas_plot(self):
        self.verificar(RAIZ / "reglas/reglas_plot_borrador.json",
                       TEXTOS / "anexo4_fichas_plot.txt", TEXTOS / "acuerdo128_2026_compensacion.txt")

    def test_citas_san_francisco(self):
        self.verificar(RAIZ / "reglas/reglas_sf_borrador.json",
                       TEXTOS / "acuerdo270_sf_y_anexo2.txt", TEXTOS / "anexo4_fichas_plot.txt")


class TestAuditoria(unittest.TestCase):
    def test_cadena_detecta_alteracion(self):
        eventos = [{"id": 1, "expediente_id": "E1", "payload": {"t": "ingreso"}},
                   {"id": 2, "expediente_id": "E1", "payload": {"t": "evaluacion", "r": "CUMPLE"}}]
        with tempfile.TemporaryDirectory() as d:
            crudo, sellado = pathlib.Path(d, "e.json"), pathlib.Path(d, "s.json")
            crudo.write_text(json.dumps(eventos))
            sellado.write_text(subprocess.run([sys.executable, str(CADENA), str(crudo), "--sellar"],
                                              capture_output=True, text=True, check=True).stdout)
            self.assertEqual(subprocess.run([sys.executable, str(CADENA), str(sellado)]).returncode, 0)
            sellado.write_text(sellado.read_text().replace('"CUMPLE"', '"NO_CUMPLE"'))
            self.assertEqual(subprocess.run([sys.executable, str(CADENA), str(sellado)],
                                            capture_output=True).returncode, 1)


if __name__ == "__main__":
    unittest.main()
