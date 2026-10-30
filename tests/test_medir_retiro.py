"""Retiro posterior medido sobre las regiones (scripts/medir_retiro.py): polígonos sintéticos en puntos de la hoja."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("medir_retiro", RAIZ / "scripts" / "medir_retiro.py")
mr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mr)

ESCALA = 100
PT = 1 / (ESCALA * mr.me._PT_M)   # puntos por metro a 1:100


def m(x: float, y: float) -> tuple[float, float]:
    return (x * PT, y * PT)


def rect(x0: float, y0: float, x1: float, y1: float) -> list[tuple[float, float]]:
    """Rectángulo en metros → puntos; el lado 0 es el de arriba (y0), el 1 el derecho, el 2 el de abajo, el 3 el izquierdo."""
    return [m(x0, y0), m(x1, y0), m(x1, y1), m(x0, y1)]


LOTE = rect(0, 0, 20, 30)
HUELLA = rect(3, 5, 17, 25)
ACERA_ABAJO = rect(0, 30, 20, 32)
ACERA_DERECHA = rect(20, 0, 22, 30)


class TestMedirPagina(unittest.TestCase):
    def test_frente_por_region_de_acera(self):
        r = mr.medir_pagina(LOTE, [HUELLA], ESCALA, regiones_frente=[ACERA_ABAJO])
        self.assertEqual(r["frente"], [2])
        self.assertEqual([l["distancia_m"] for l in r["lados"]], [5.0, 3.0, 5.0, 3.0])
        self.assertEqual([l["largo_m"] for l in r["lados"]], [20.0, 30.0, 20.0, 30.0])
        self.assertEqual(r["candidatos_posterior"][0]["lado"], 0)
        self.assertEqual(r["retiro_posterior_m"], 5.0)
        self.assertFalse(any(l["adosado"] for l in r["lados"]))

    def test_sin_frente_da_null_con_todos_los_lados(self):
        r = mr.medir_pagina(LOTE, [HUELLA], ESCALA)
        self.assertIsNone(r["retiro_posterior_m"])
        self.assertEqual(r["frente"], [])
        self.assertEqual(len(r["lados"]), 4)
        self.assertIn("frente no determinable", r["motivo"])
        self.assertIn("sin el texto del PDF", r["motivo"])

    def test_frente_por_rotulo_de_calle_paralelo_y_fuera_del_lote(self):
        calle = mr.Rotulo("CALLE 50 ESTE", *m(10, 33))                 # abajo, horizontal: frente = lado 2
        r = mr.medir_pagina(LOTE, [HUELLA], ESCALA, rotulos=[calle])
        self.assertEqual(r["frente"], [2])
        self.assertEqual(r["retiro_posterior_m"], 5.0)
        self.assertIn("rótulo «CALLE 50 ESTE»", r["lados"][2]["evidencia_frente"])
        # Un rótulo escrito perpendicular al lado, uno interno o uno dentro del lote no marcan frente.
        vertical = mr.Rotulo("CALLE 50 ESTE", *m(10, 33), 0.0, 1.0)
        interna = mr.Rotulo("ACERA INTERNA", *m(10, 33))
        dentro = mr.Rotulo("CALLE 50 ESTE", *m(10, 28))
        for rot in (vertical, interna, dentro):
            self.assertEqual(mr.medir_pagina(LOTE, [HUELLA], ESCALA, rotulos=[rot])["frente"], [], rot.texto)

    def test_esquina_con_candidatos_distintos_da_null(self):
        r = mr.medir_pagina(LOTE, [HUELLA], ESCALA, regiones_frente=[ACERA_ABAJO, ACERA_DERECHA])
        self.assertEqual(r["frente"], [1, 2])
        self.assertIsNone(r["retiro_posterior_m"])
        self.assertEqual({c["lado"]: c["distancia_m"] for c in r["candidatos_posterior"]}, {0: 5.0, 3: 3.0})
        self.assertIn("esquina", r["motivo"])

    def test_esquina_con_candidatos_iguales_da_el_valor(self):
        r = mr.medir_pagina(LOTE, [rect(5, 5, 17, 25)], ESCALA, regiones_frente=[ACERA_ABAJO, ACERA_DERECHA])
        self.assertEqual(r["retiro_posterior_m"], 5.0)
        self.assertIn("dan lo mismo", r["motivo"])

    def test_huella_sobre_el_lindero_es_adosado_cero(self):
        r = mr.medir_pagina(LOTE, [rect(3, 0, 17, 25)], ESCALA, regiones_frente=[ACERA_ABAJO])
        self.assertEqual(r["retiro_posterior_m"], 0.0)
        self.assertTrue(r["lados"][0]["adosado"])

    def test_varias_huellas_se_unen(self):
        r = mr.medir_pagina(LOTE, [rect(3, 5, 10, 25), rect(10, 2, 17, 25)], ESCALA, regiones_frente=[ACERA_ABAJO])
        self.assertEqual(r["retiro_posterior_m"], 2.0)

    def test_region_de_retiro_posterior_fija_el_lado(self):
        r = mr.medir_pagina(LOTE, [HUELLA], ESCALA, regiones_frente=[ACERA_ABAJO], regiones_posterior=[rect(17, 0, 20, 30)])
        self.assertEqual([c["lado"] for c in r["candidatos_posterior"]], [1])
        self.assertEqual(r["retiro_posterior_m"], 3.0)

    def test_sin_escala_solo_puntos(self):
        r = mr.medir_pagina(LOTE, [HUELLA], None, regiones_frente=[ACERA_ABAJO])
        self.assertIsNone(r["retiro_posterior_m"])
        self.assertIsNone(r["lados"][0]["distancia_m"])
        self.assertAlmostEqual(r["lados"][0]["distancia_pt"], 5 * PT, places=0)
        self.assertIn("sin escala", r["motivo"])

    def test_sin_lote_o_huella(self):
        self.assertIsNone(mr.medir_pagina(LOTE, [], ESCALA))
        self.assertIsNone(mr.medir_pagina(LOTE, [rect(30, 30, 40, 40)], ESCALA))   # huella fuera del lote

    def test_opuesto_es_el_paralelo_mas_lejano(self):
        lados = mr._lados([m(0, 0), m(20, 0), m(20, 30), m(10, 34), m(0, 30)])   # chaflán abajo
        self.assertIn(mr.opuesto(lados, 0), (2, 3))        # un lado del fondo, no un lateral
        self.assertEqual(mr.opuesto(lados, 1), 4)          # derecho ↔ izquierdo


class TestCarpeta(unittest.TestCase):
    def test_sin_regiones_lo_dice(self):
        with tempfile.TemporaryDirectory() as d:
            r = mr.medir(d)
            self.assertIsNone(r["retiro_posterior_m"])
            self.assertIn("sin regiones.json", r["resultado"])
            self.assertEqual(r["paginas"], [])

    def test_carpeta_con_regiones_y_pdf(self):
        import pymupdf

        with tempfile.TemporaryDirectory() as d:
            carpeta = Path(d)
            ancho_pt = alto_pt = 400.0
            doc = pymupdf.open()
            pag = doc.new_page(width=ancho_pt, height=alto_pt)
            # Lote: x 0.2–0.6, y 0.2–0.5 de la hoja; la calle va debajo del lado de abajo (y = 0.5).
            pag.insert_text((0.3 * ancho_pt, 0.5 * alto_pt + 20), "CALLE PRINCIPAL")
            doc.save(carpeta / "original.pdf")
            mm = ancho_pt / mr.PT_POR_MM
            lote = [[0.2, 0.2], [0.6, 0.2], [0.6, 0.5], [0.2, 0.5]]
            huella = [[0.25, 0.3], [0.55, 0.3], [0.55, 0.45], [0.25, 0.45]]
            reg = {"version": 1, "paginas": {"1": {"ancho_mm": mm, "alto_mm": mm, "escala": 100}},
                   "regiones": [mr.rg.region(1, "lote", lote, "vectorial", 0.7) | {"id": "r-lote"},
                                mr.rg.region(1, "huella", huella, "vectorial", 0.7) | {"id": "r-huella"}]}
            (carpeta / "regiones.json").write_text(json.dumps(reg), encoding="utf-8")
            r = mr.medir(carpeta)
            self.assertEqual(r["paginas"][0]["medida"]["frente"], [2])
            esperado = round(0.1 * alto_pt * 100 * mr.me._PT_M, 2)     # 40 pt a 1:100 = 1.41 m
            self.assertEqual(r["retiro_posterior_m"], esperado)
            self.assertEqual(r["paginas"][0]["escala_origen"], "regiones.json (escala de la hoja)")
            self.assertTrue(r["paginas"][0]["huella"]["automatica"])
            # Sin escala en la hoja: la implícita en el área escrita del lote (aproximada).
            reg["paginas"]["1"]["escala"] = None
            (carpeta / "regiones.json").write_text(json.dumps(reg), encoding="utf-8")
            area_m2 = (0.4 * ancho_pt) * (0.3 * alto_pt) * (100 * mr.me._PT_M) ** 2
            (carpeta / "extraccion.json").write_text(json.dumps(
                {"paginas": [{"numero": 1, "lamina": {}}], "hechos": [{"hecho": "lote.area_m2", "valor": area_m2, "estado": "ok"}]}),
                encoding="utf-8")
            r = mr.medir(carpeta)
            self.assertAlmostEqual(r["paginas"][0]["escala"], 100, places=0)
            self.assertIn("aproximada", r["paginas"][0]["escala_origen"])
            self.assertEqual(r["retiro_posterior_m"], esperado)
            # Sin el PDF ni regiones de frente: null y lo dice.
            (carpeta / "original.pdf").unlink()
            r = mr.medir(carpeta)
            self.assertIsNone(r["retiro_posterior_m"])
            self.assertIn("frente no determinable", r["resultado"])


if __name__ == "__main__":
    unittest.main()
