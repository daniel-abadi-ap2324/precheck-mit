"""Equidistancia de curvas de nivel por la serie de rótulos del PDF o por rótulos sobre curvas dibujadas
(scripts/medir_curvas.py)."""
import importlib.util
import math
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("medir_curvas", RAIZ / "scripts" / "medir_curvas.py")
mc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mc)


class TestSerie(unittest.TestCase):
    def test_impares_intercalados_dan_1_m(self):
        # Panamá Norte: pares cada 2 m fuera del proyecto y cada 1 m dentro (65–75 impares).
        vals = [54, 56, 58, 60, 62, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 78, 80, 82]
        s = mc.serie([float(v) for v in vals])
        self.assertEqual(s["equidistancia_m"], 1.0)
        self.assertEqual((s["desde"], s["hasta"]), (64.0, 76.0))

    def test_solo_pares_dan_2_m(self):
        self.assertEqual(mc.serie([60.0, 62.0, 64.0, 66.0, 68.0])["equidistancia_m"], 2.0)

    def test_numeros_sueltos_no_son_serie(self):
        self.assertIsNone(mc.serie([10.0, 17.0, 19.0]))
        self.assertIsNone(mc.serie([5.0, 30.0, 70.0, 150.0]))


class TestPasoEntre(unittest.TestCase):
    def test_dos_cotas_bastan(self):
        # Bella Vista: solo dos curvas, «30.00» y «30.30».
        self.assertEqual(mc.paso_entre([30.0, 30.3, 30.3])["equidistancia_m"], 0.3)
        self.assertEqual(mc.paso_entre([66.0, 68.0, 70.0])["equidistancia_m"], 2.0)

    def test_una_cota_o_fuera_de_reticula_no_dan_paso(self):
        self.assertIsNone(mc.paso_entre([30.0]))
        self.assertIsNone(mc.paso_entre([1.5, 2.37]))          # 1.5 no es múltiplo de 0.87
        self.assertIsNone(mc.paso_entre([1.2, 4.0, 6.0, 30.0, 30.3]))  # cotas colándose: 4.0 no cae cada 0.3
        self.assertIsNone(mc.paso_entre([1.0, 12.0]))          # paso mayor que PASO_MAX


def _curva(page, x0, x1, y_medio, amplitud, periodo, fase=0.0, pasos=60, ancho=0.72):
    """Polilínea suave (senoide) de muchos segmentos, como una curva de nivel exportada desde CAD."""
    pts = [(x0 + (x1 - x0) * i / pasos, y_medio + amplitud * math.sin((x0 + (x1 - x0) * i / pasos) / periodo + fase))
           for i in range(pasos + 1)]
    sh = page.new_shape()
    sh.draw_polyline(pts)
    sh.finish(color=(0, 0, 0), width=ancho, closePath=False)
    sh.commit()
    return pts


def _y(y_medio, amplitud, x, periodo, fase=0.0):
    """Altura de la senoide de `_curva` en x (en PDF la y crece hacia abajo)."""
    return y_medio + amplitud * math.sin(x / periodo + fase)


def _mascara(page, x, y, ancho=26, alto=11):
    """Relleno blanco (máscara de fondo del rótulo) centrado en (x, y)."""
    import pymupdf

    sh = page.new_shape()
    sh.draw_rect(pymupdf.Rect(x - ancho / 2, y - alto / 2, x + ancho / 2, y + alto / 2))
    sh.finish(color=None, fill=(1, 1, 1))
    sh.commit()


def _texto(page, x, y, texto, tam=7):
    """Texto centrado aproximadamente en (x, y)."""
    page.insert_text((x - 2.2 * tam * len(texto) / 5, y + tam * 0.35), texto, fontsize=tam)


class TestPdf(unittest.TestCase):
    def test_pdf_con_rotulos_y_pdf_sin_texto(self):
        import pymupdf

        with tempfile.TemporaryDirectory() as d:
            con = Path(d) / "con.pdf"
            doc = pymupdf.open()
            p = doc.new_page()
            for i, v in enumerate([66, 67, 68, 69, 70, 72, 74]):
                p.insert_text((50, 60 + 20 * i), f"{v}.0")
            doc.save(con)
            r = mc.medir(con)
            self.assertEqual(r["equidistancia_m"], 1.0)
            sin = Path(d) / "sin.pdf"
            doc2 = pymupdf.open()
            doc2.new_page()
            doc2.save(sin)
            self.assertIn("escaneado", mc.medir(sin)["resultado"])
            # Escaneo con marco vectorial: una imagen que llena la hoja y un rectángulo de borde, sin texto.
            marco = Path(d) / "marco.pdf"
            doc3 = pymupdf.open()
            p3 = doc3.new_page()
            pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 40, 40), 0)
            pix.clear_with(255)
            p3.insert_image(p3.rect, pixmap=pix)
            sh = p3.new_shape()
            sh.draw_rect(pymupdf.Rect(10, 10, p3.rect.width - 10, p3.rect.height - 10))
            sh.finish(color=(0, 0, 0), width=1)
            sh.commit()
            doc3.save(marco)
            self.assertIn("escaneado", mc.medir(marco)["resultado"])

    def test_dos_curvas_con_rotulos_de_dos_decimales_dan_0_30(self):
        """Dos polilíneas curvas, cada una con su rótulo «30.00» / «30.30» sobre una máscara blanca, en lámina rotada."""
        import pymupdf

        with tempfile.TemporaryDirectory() as d:
            doc = pymupdf.open()
            p = doc.new_page(width=600, height=400)
            periodo = 60.0
            # Los rótulos van en las crestas (tangente horizontal, como el texto): x = periodo·π/2 y periodo·5π/2.
            x_a, x_b = periodo * math.pi / 2, periodo * 5 * math.pi / 2
            _curva(p, 20, 580, 150, 40, periodo)
            _curva(p, 20, 580, 250, 40, periodo)
            _mascara(p, x_a, _y(150, 40, x_a, periodo))
            _texto(p, x_a, _y(150, 40, x_a, periodo), "30.00")
            _mascara(p, x_b, _y(250, 40, x_b, periodo))
            _texto(p, x_b, _y(250, 40, x_b, periodo), "30.30")
            # Cotas que una curva cruza de paso (sin máscara) y cotas junto a rectas: no cuentan.
            x_s = periodo * 3 * math.pi / 2
            _texto(p, x_s, _y(150, 40, x_s, periodo), "2.50")
            # Cota con máscara que la segunda curva atraviesa en paralelo (como en Bella Vista): la delata su línea
            # de cota, una recta suelta paralela y pegada al texto.
            x_c = periodo * 7 * math.pi / 2
            y_c = _y(250, 40, x_c, periodo)
            _mascara(p, x_c, y_c)
            _texto(p, x_c, y_c, "5.83")
            sh = p.new_shape()
            sh.draw_line((x_c - 40, y_c + 8), (x_c + 40, y_c + 8))
            sh.finish(color=(0, 0, 0), width=0.5, closePath=False)
            sh.commit()
            for i in range(3):
                sh = p.new_shape()
                sh.draw_line((400, 330 + 20 * i), (500, 330 + 20 * i))
                sh.finish(color=(0, 0, 0), width=0.5, closePath=False)
                sh.commit()
                _texto(p, 450, 325 + 20 * i, ["2.50", "5.00", "1.50"][i])
            p.set_rotation(270)
            pdf = Path(d) / "dos_curvas.pdf"
            doc.save(pdf)
            r = mc.medir(pdf)
            self.assertEqual(r["equidistancia_m"], 0.3, r)
            self.assertIn("cada 0.3 m", r["resultado"])
            pag = r["paginas"][0]
            self.assertEqual(pag["metodo"], "rótulos sobre curvas dibujadas")
            self.assertEqual(sorted(x["valor"] for x in pag["rotulos_sobre_curvas"]), [30.0, 30.3])
            self.assertTrue(all(x["apoyo"] == "mascara" for x in pag["rotulos_sobre_curvas"]))

    def test_rotulo_en_hueco_de_la_curva_sin_mascara(self):
        """La curva se interrumpe para el rótulo (dos tramos que terminan en la caja del texto)."""
        import pymupdf

        with tempfile.TemporaryDirectory() as d:
            doc = pymupdf.open()
            p = doc.new_page(width=600, height=400)
            periodo = 60.0
            for y, texto in ((150, "66.0"), (250, "66.5")):
                x = periodo * 3 * math.pi / 2  # hueco a mitad de la lámina: los dos tramos quedan largos
                _curva(p, 20, x - 11, y, 40, periodo)
                _curva(p, x + 11, 580, y, 40, periodo)
                _texto(p, x, _y(y, 40, x, periodo), texto)
            pdf = Path(d) / "hueco.pdf"
            doc.save(pdf)
            r = mc.medir(pdf)
            self.assertEqual(r["equidistancia_m"], 0.5, r)
            self.assertTrue(all(x["apoyo"] == "corte" for x in r["paginas"][0]["rotulos_sobre_curvas"]))

    def test_rotulos_vectoriales_se_leen_con_el_lector(self):
        """Rótulos convertidos a trazos (sin texto) sobre máscara: se recortan y los lee el lector OCR."""
        import pymupdf

        class Lectura:
            def __init__(self, txts):
                self.txts = txts

        def lector_contado(img):
            self.assertEqual(img.ndim, 3)  # recorte RGB de la máscara enderezada
            res = Lectura(("30.30",) if lector_contado.n == 0 else ("30.00",))
            lector_contado.n += 1
            return res

        lector_contado.n = 0

        with tempfile.TemporaryDirectory() as d:
            doc = pymupdf.open()
            p = doc.new_page(width=600, height=400)
            periodo = 60.0
            for y_medio in (150, 250):
                x = periodo * math.pi / 2
                _curva(p, 20, 580, y_medio, 40, periodo)
                y = _y(y_medio, 40, x, periodo)
                _mascara(p, x, y)
                for k in range(3):  # tres «glifos»: zigzags chicos de 3 segmentos
                    sh = p.new_shape()
                    gx = x - 9 + 6 * k
                    sh.draw_polyline([(gx, y - 3), (gx + 3, y + 3), (gx + 4, y - 3), (gx + 5, y + 3)])
                    sh.finish(color=(0, 0, 0), width=0.72, closePath=False)
                    sh.commit()
            pdf = Path(d) / "glifos.pdf"
            doc.save(pdf)
            r = mc.medir(pdf, lector=lector_contado)
            self.assertEqual(lector_contado.n, 2)
            self.assertEqual(r["equidistancia_m"], 0.3, r)
            self.assertTrue(all(x["origen"] == "glifos" for x in r["paginas"][0]["rotulos_sobre_curvas"]))

    def test_cotas_sobre_rectas_no_son_curvas(self):
        """Lámina llena de cotas «2.50», «5.00», «1.50» junto a líneas rectas: sin curvas de nivel."""
        import pymupdf

        with tempfile.TemporaryDirectory() as d:
            doc = pymupdf.open()
            p = doc.new_page(width=600, height=400)
            for i in range(8):
                y = 40 + 40 * i
                sh = p.new_shape()
                sh.draw_line((50, y), (250, y))
                sh.draw_line((50, y - 4), (50, y + 4))
                sh.draw_line((250, y - 4), (250, y + 4))
                sh.finish(color=(0, 0, 0), width=0.5, closePath=False)
                sh.commit()
                _texto(p, 150, y - 6, ["2.50", "5.00", "1.50", "2.50", "7.50", "1.00", "0.50", "3.00"][i])
                _mascara(p, 450, y)
                _texto(p, 450, y, ["2.50", "5.00", "1.50", "2.50", "7.50", "1.00", "0.50", "3.00"][i])
                sh = p.new_shape()
                sh.draw_line((350, y), (550, y))
                sh.finish(color=(0, 0, 0), width=0.5, closePath=False)
                sh.commit()
            pdf = Path(d) / "cotas.pdf"
            doc.save(pdf)
            r = mc.medir(pdf)
            self.assertIsNone(r["equidistancia_m"], r)
            self.assertIn("sin serie", r["resultado"])
            self.assertEqual(r["paginas"][0]["rotulos_sobre_curvas"], [])


if __name__ == "__main__":
    unittest.main()
