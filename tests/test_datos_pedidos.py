"""scripts/datos_pedidos.py: los datos que piden las reglas evaluadas salen de las reglas, no de una lista fija."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("datos_pedidos", RAIZ / "scripts" / "datos_pedidos.py")
dp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dp)


def caso(d: Path, reglas_evaluadas, lote=None):
    (d / "resultado.json").write_text(json.dumps({"resultados": [{"regla_id": r} for r in reglas_evaluadas]}), encoding="utf8")
    (d / "lote.json").write_text(json.dumps(lote or {}), encoding="utf8")


class TestDatosPedidos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name)
        self.reglas = self.d / "reglas"
        self.reglas.mkdir()
        (self.reglas / "a.json").write_text(json.dumps([
            {"id": "A-1", "entradas": ["lote.area_m2", "lote.codigo_zona", "registro_publico.finca"]},
            {"id": "A-2", "entradas": ["lote.area_m2", "proyecto.altura_m"]},
            {"id": "A-3", "entradas": ["proyecto.retiro_posterior_m"]},
        ]), encoding="utf8")
        self.caso = self.d / "caso"
        self.caso.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def test_junta_las_entradas_de_las_reglas_evaluadas_y_omite_lo_que_no_sale_del_plano(self):
        caso(self.caso, ["A-1", "A-2"])
        filas = dp.datos_pedidos(self.caso, self.reglas, universales=False)
        self.assertEqual([(k, n) for k, n, _ in filas], [("lote.area_m2", 2), ("proyecto.altura_m", 1)])

    def test_la_lista_depende_de_las_reglas_que_aplican(self):
        caso(self.caso, ["A-3"])
        self.assertEqual([k for k, _, _ in dp.datos_pedidos(self.caso, self.reglas, universales=False)], ["proyecto.retiro_posterior_m"])

    def test_marca_lo_ya_escrito_y_sale_con_1_si_falta_algo(self):
        lote = {"lote": {"area_m2": {"valor": 733.14, "confianza": 0.9}}}
        caso(self.caso, ["A-1", "A-2"], lote)
        filas = dp.datos_pedidos(self.caso, self.reglas, universales=False)
        self.assertEqual([(k, ok) for k, _, ok in filas], [("lote.area_m2", True), ("proyecto.altura_m", False)])
        self.assertEqual(dp.main([str(self.caso), "--reglas", str(self.reglas), "--sin-universales"]), 1)

    def test_regla_que_no_aplica_no_pide_sus_entradas_y_la_dudosa_pide_lo_que_decide_si_aplica(self):
        # ADR-0018: la rampa de un proyecto sin rampas no pide «inicia en la línea de construcción».
        resultados = [
            {"regla_id": "A-2", "resultado": "NO_APLICA"},
            {"regla_id": "A-3", "resultado": "REQUIERE_REVISION",
             "causa": {"tipo": "faltante", "en": "aplica_si", "campo": "rampa.ancho_m"}},
            {"regla_id": "A-1", "resultado": "REQUIERE_REVISION",
             "causa": {"tipo": "dudoso", "en": "aplica_si", "campos": {"rampa.ancho_m": 0.6}, "resultado": "NO_APLICA"}},
        ]
        (self.caso / "resultado.json").write_text(json.dumps({"resultados": resultados}), encoding="utf8")
        (self.caso / "lote.json").write_text("{}", encoding="utf8")
        self.assertEqual([k for k, _, _ in dp.datos_pedidos(self.caso, self.reglas, universales=False)], ["rampa.ancho_m"])

    def test_sale_con_0_cuando_estan_todos(self):
        lote = {"lote": {"area_m2": {"valor": 1, "confianza": 0.9}}, "proyecto": {"altura_m": {"valor": 9, "confianza": 0.6}}}
        caso(self.caso, ["A-2"], lote)
        self.assertEqual(dp.main([str(self.caso), "--reglas", str(self.reglas), "--sin-universales"]), 0)

    def test_lote_de_varias_fincas_no_pide_la_finca_unica_y_el_de_una_no_pide_la_lista(self):
        caso(self.caso, ["A-2"], {"lote": {"cantidad_fincas": {"valor": 4, "confianza": 0.9}}})
        claves = [k for k, _, _ in dp.datos_pedidos(self.caso, self.reglas)]
        self.assertNotIn("lote.finca", claves)
        caso(self.caso, ["A-2"], {"lote": {"cantidad_fincas": {"valor": 1, "confianza": 0.9}}})
        claves = [k for k, _, _ in dp.datos_pedidos(self.caso, self.reglas)]
        self.assertIn("lote.finca", claves)
        self.assertNotIn("lote.fincas", claves)

    def test_la_lista_universal_se_suma_aunque_ninguna_regla_aplicable_la_use(self):
        caso(self.caso, ["A-2"])
        filas = dp.datos_pedidos(self.caso, self.reglas)
        claves = [k for k, _, _ in filas]
        for k in ("lote.finca", "lote.area_m2", "proyecto.retiro_posterior_m", "proyecto.acera_ancho_m", "plano.intervalo_curvas_nivel_m"):
            self.assertIn(k, claves)
        self.assertGreaterEqual(len(claves), 19)
        self.assertEqual(dict((k, n) for k, n, _ in filas)["lote.finca"], 0)


if __name__ == "__main__":
    unittest.main()
