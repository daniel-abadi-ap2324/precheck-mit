"""Medidas sobre el dibujo vectorial (scripts/medir_dibujo.py): cotas sintéticas a 1:100 y un PDF generado."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("medir_dibujo", RAIZ / "scripts" / "medir_dibujo.py")
md = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(md)
from precheck.planos.detectores import Palabra  # noqa: E402

ESCALA = 100
PT = 1 / (ESCALA * md.PT_M)   # puntos por metro a 1:100


def cota_horizontal(texto: str, x0_m: float, largo_m: float, y: float = 200.0):
    """Una cota horizontal en una cadena: línea partida por el texto, rayitas oblicuas y líneas de extensión en los
    extremos, y el recuadro blanco detrás del texto (los cuatro lados). Devuelve (palabra, segmentos)."""
    a, b = 100 + x0_m * PT, 100 + (x0_m + largo_m) * PT
    cx, ancho, alto = (a + b) / 2, 18.0, 8.0
    caja = (cx - ancho / 2, y - alto / 2, cx + ancho / 2, y + alto / 2)
    segs = [
        (a, y, caja[0] - 0.3, y), (caja[2] + 0.3, y, b, y),                     # línea partida por el texto
        (a - 2, y + 2.5, a + 2, y - 2.5), (b - 2, y + 2.5, b + 2, y - 2.5),     # rayitas oblicuas
        (a, y - 40, a, y + 4), (b, y - 40, b, y + 4),                           # líneas de extensión
        (caja[0], caja[1], caja[2], caja[1]), (caja[2], caja[1], caja[2], caja[3]),   # recuadro del texto
        (caja[2], caja[3], caja[0], caja[3]), (caja[0], caja[3], caja[0], caja[1]),
    ]
    return Palabra(texto, cx, y, 9.0, caja, 1.0, 0.0), segs


class TestValorCota(unittest.TestCase):
    def test_numeros_de_cota(self):
        self.assertEqual(md.valor_cota("6.90"), 6.9)
        self.assertEqual(md.valor_cota("2,50 m"), 2.5)
        self.assertEqual(md.valor_cota("187.15"), 187.15)

    def test_niveles_y_areas_no_son_cotas(self):
        for t in ("+3.00", "N.P.T. +3.00", "12.50 m²", "12.50 m2", "1:100", "5", "P-01"):
            self.assertIsNone(md.valor_cota(t), t)


class TestCandidatasYCalibracion(unittest.TestCase):
    def test_la_cota_mide_su_tramo_y_no_el_recuadro_del_texto(self):
        w5, s5 = cota_horizontal("5.00", 0, 5)
        w3, s3 = cota_horizontal("3.00", 5, 3)   # cadena: comparte la línea de extensión del medio
        segs = s5 + s3
        largos = [l for _, l in md.candidatas(w5, segs)]
        self.assertAlmostEqual(largos[0] / PT, 5.0, places=2)
        self.assertAlmostEqual(md.candidatas(w3, segs)[0][1] / PT, 3.0, places=2)

    def test_dos_cotas_comprueban_la_escala(self):
        w5, s5 = cota_horizontal("5.00", 0, 5)
        w3, s3 = cota_horizontal("3.00", 5, 3)
        segs = s5 + s3
        cal = md.calibrar([(5.0, md.candidatas(w5, segs)), (3.0, md.candidatas(w3, segs))])
        self.assertEqual(cal["valor"], 100.0)
        self.assertEqual(cal["cotas"], [0, 1])
        self.assertTrue(cal["estandar"])

    def test_una_cota_sola_no_comprueba_nada(self):
        w5, s5 = cota_horizontal("5.00", 0, 5)
        self.assertIsNone(md.calibrar([(5.0, md.candidatas(w5, s5))]))

    def test_cotas_que_no_coinciden_no_dan_escala(self):
        w5, s5 = cota_horizontal("5.00", 0, 5)
        w3, s3 = cota_horizontal("9.00", 5, 3)   # el texto dice 9.00 pero el tramo mide 3 m a 1:100
        segs = s5 + s3
        self.assertIsNone(md.calibrar([(5.0, md.candidatas(w5, segs)), (9.0, md.candidatas(w3, segs))]))


class TestSeparaciones(unittest.TestCase):
    def test_niveles_de_una_elevacion(self):
        # Losas cada 3.15 m y una línea corta (una ventana) que no cruza la zona.
        ys = [100 + k * 3.15 * PT for k in range(4)]
        segs = [(50, y, 400, y) for y in ys] + [(60, 150, 90, 150)]
        pares = md.separaciones(segs, (40, 90, 410, ys[-1] + 10), horizontal=True)
        self.assertEqual(len(pares), 3)
        for p0, p1 in pares:
            self.assertAlmostEqual((p1 - p0) / PT, 3.15, places=2)

    def test_verticales(self):
        segs = [(100, 0, 100, 300), (100 + 1.2 * PT, 0, 100 + 1.2 * PT, 300)]
        (p0, p1), = md.separaciones(segs, (90, 0, 200, 300), horizontal=False)
        self.assertAlmostEqual((p1 - p0) / PT, 1.2, places=2)


class TestMedirPdf(unittest.TestCase):
    """De punta a punta sobre un PDF generado con líneas y textos de cota a 1:100."""

    @classmethod
    def setUpClass(cls):
        import pymupdf

        cls.tmp = tempfile.TemporaryDirectory()
        cls.pdf = str(Path(cls.tmp.name) / "plano.pdf")
        doc = pymupdf.open()
        pg = doc.new_page(width=842, height=595)
        y = 200
        for texto, x0_m, largo_m in (("5.00", 0, 5), ("3.00", 5, 3), ("4.50", 8, 4.5)):
            a, b = 100 + x0_m * PT, 100 + (x0_m + largo_m) * PT
            cx = (a + b) / 2
            pg.draw_line((a, y), (cx - 12, y))
            pg.draw_line((cx + 12, y), (b, y))
            pg.draw_line((a - 2, y + 2.5), (a + 2, y - 2.5))
            pg.draw_line((b - 2, y + 2.5), (b + 2, y - 2.5))
            pg.draw_line((a, y - 40), (a, y + 4))
            pg.draw_line((b, y - 40), (b, y + 4))
            pg.insert_text((cx - 9, y + 3), texto, fontsize=8)
        # Una cota suelta en otra zona de la hoja.
        pg.draw_line((100, 450), (100 + 2 * PT, 450))
        pg.insert_text((120, 446), "2.00", fontsize=8)
        doc.save(cls.pdf)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_escala_comprobada_y_cotas(self):
        r = md.medir(self.pdf, 1, (0.0, 0.2, 0.7, 0.5))
        self.assertEqual(r["escala"]["fuente"], "comprobada")
        self.assertEqual(r["escala"]["valor"], 100.0)
        medidas = {c["texto"]: c["linea_medida_m"] for c in r["cotas"]}
        self.assertAlmostEqual(medidas["5.00"], 5.0, delta=0.05)
        self.assertAlmostEqual(medidas["4.50"], 4.5, delta=0.05)
        self.assertTrue(all(c["coincide"] for c in r["cotas"]))

    def test_distancia_entre_puntos(self):
        r = md.medir(self.pdf, 1, (0.0, 0.2, 0.7, 0.5), de_pt=(100 / 842, 0.3), a_pt=((100 + 5 * PT) / 842, 0.3))
        self.assertAlmostEqual(r["distancia"]["m"], 5.0, delta=0.02)

    def test_zona_con_una_cota_calibra_con_la_lamina(self):
        r = md.medir(self.pdf, 1, (0.05, 0.7, 0.5, 0.85))
        self.assertEqual(r["escala"]["fuente"], "comprobada")
        self.assertIn("lámina entera", r["escala"]["nota"])

    def test_sin_cotas_ni_escala_declarada(self):
        import pymupdf

        pdf = str(Path(self.tmp.name) / "sin_cotas.pdf")
        doc = pymupdf.open()
        doc.new_page().draw_line((50, 50), (300, 50))
        doc.save(pdf)
        r = md.medir(pdf, 1, (0, 0, 1, 1))
        self.assertEqual(r["escala"]["fuente"], "sin_escala")
        self.assertIsNone(r["segmentos"][0]["largo_m"])

    def test_lamina_inexistente(self):
        self.assertIn("error", md.medir(self.pdf, 5, (0, 0, 1, 1)))


if __name__ == "__main__":
    unittest.main()
