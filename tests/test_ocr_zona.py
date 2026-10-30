"""OCR por zona de una lámina escaneada (precheck/planos/ocr_zona.py, herramienta leer_zona de DeepSeek).

Se arma una lámina «escaneada» sintética: una imagen con texto conocido (un cuadro y una cota vertical), algo torcida
y con fondo manchado, metida en un PDF sin texto vectorial."""
import io
import shutil
import unittest

try:
    import cv2  # noqa: F401
    import pymupdf
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    pymupdf = None

from precheck.planos import ocr_zona


def _fuente(tam):
    for nombre in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(nombre, tam)
        except OSError:
            continue
    return ImageFont.load_default(size=tam)


def _lamina(torcida: float = 1.2) -> bytes:
    """PDF de una hoja de 12×8 pulgadas escaneada a 300 ppp: cuadro de datos arriba a la izquierda y cota vertical a la
    derecha, con fondo amarillento y una inclinación leve."""
    img = Image.new("L", (3600, 2400), 225)
    d = ImageDraw.Draw(img)
    d.ellipse((1500, 900, 2600, 1900), fill=200)                      # mancha del escaneo
    d.rectangle((150, 150, 1650, 650), outline=20, width=6)
    f = _fuente(64)
    d.text((200, 200), "DATOS DE LA FINCA", fill=20, font=f)
    d.text((200, 320), "FINCA: 078850", fill=20, font=f)
    d.text((200, 440), "AREA: 733.14 M2", fill=20, font=f)
    for y in (800, 1000, 1200):
        d.line((150, y, 3400, y), fill=40, width=5)                  # líneas del dibujo para medir la inclinación
    vertical = Image.new("L", (900, 120), 225)
    ImageDraw.Draw(vertical).text((10, 10), "27.41", fill=20, font=_fuente(80))
    img.paste(vertical.rotate(90, expand=True), (3300, 1300))
    img = img.rotate(torcida, expand=False, fillcolor=225)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    doc = pymupdf.open()
    pagina = doc.new_page(width=12 * 72, height=8 * 72)
    pagina.insert_image(pagina.rect, stream=buf.getvalue())
    return doc.tobytes()


@unittest.skipUnless(pymupdf is not None and shutil.which("tesseract"), "hace falta Tesseract, OpenCV y PyMuPDF")
class LeerZona(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = pymupdf.open(stream=_lamina(), filetype="pdf")

    def test_cuadro_de_la_finca_con_digitos_y_posicion_en_la_hoja(self):
        lec = ocr_zona.leer_zona(self.doc, 1, (0.0, 0.0, 0.5, 0.35), modo="cuadro", segundo=False)
        texto = " ".join(p.t for p in lec.palabras)
        self.assertIn("078850", texto)
        self.assertIn("733.14", texto)
        self.assertNotEqual(lec.inclinacion, 0.0)                    # se enderezó
        area = next(p for p in lec.palabras if "733.14" in p.t)
        # El texto está hacia (0.25, 0.19) de la hoja: la posición vuelve en fracciones de la hoja, no de la zona.
        self.assertTrue(0.1 < area.x < 0.4 and 0.12 < area.y < 0.26, (area.x, area.y))
        self.assertGreater(area.c, 0.5)

    def test_cota_vertical_se_lee_girando_la_zona(self):
        lec = ocr_zona.leer_zona(self.doc, 1, (0.88, 0.5, 1.0, 1.0), modo="cotas", segundo=False)
        self.assertIn(lec.giro, (90, 270))
        self.assertIn("27.41", " ".join(p.t for p in lec.palabras))
        cota = next(p for p in lec.palabras if "27.41" in p.t)
        self.assertTrue(cota.x >= 0.88 and cota.y >= 0.5, (cota.x, cota.y))

    def test_salida_para_el_modelo_y_errores(self):
        lec = ocr_zona.leer_zona(self.doc, 1, (0.0, 0.0, 0.5, 0.35), modo="cuadro", segundo=False)
        texto = lec.como_texto()
        self.assertIn("Lámina 1", texto)
        self.assertIn("(Tesseract)", texto)
        self.assertIn("733.14", texto)
        with self.assertRaises(ValueError):
            ocr_zona.leer_zona(self.doc, 2, (0, 0, 1, 1))
        with self.assertRaises(ValueError):
            ocr_zona.leer_zona(self.doc, 1, (0, 0, 1, 1), modo="otro")

    def test_zona_demasiado_grande_se_rechaza_con_aviso(self):
        doc = pymupdf.open()
        doc.new_page(width=36 * 72, height=24 * 72)
        lec = ocr_zona.leer_zona(doc, 1, (0, 0, 1, 1))
        self.assertIn("demasiado grande", lec.aviso)
        self.assertEqual(lec.palabras, [])


class SalidaCompacta(unittest.TestCase):
    """como_texto sin OCR: lo que llega al modelo con uno o dos lectores."""

    def _lectura(self, tesseract, rapid):
        P = ocr_zona.Palabra
        return ocr_zona.Lectura(5, (0.1, 0.2, 0.3, 0.4), 350, "cotas", 90, 0.0,
                                [P(t, 0.15, 0.25, 0.01, 0.01, c, (1, 1, 1, i)) for i, (t, c) in enumerate(tesseract)],
                                [P(t, 0.12, 0.22 + i / 100, 0.01, 0.01, c) for i, (t, c) in enumerate(rapid)])

    def test_solo_rapidocr_sin_corchete_si_la_confianza_es_alta(self):
        texto = self._lectura([], [("27.41", 0.97), ("NIV.100", 0.71)]).como_texto()
        self.assertIn("OCR (RapidOCR)", texto)
        self.assertIn("| 27.41\n", texto + "\n")
        self.assertIn("NIV.100[71]", texto)
        self.assertNotIn("Tesseract (", texto)

    def test_con_los_dos_lectores_se_omite_el_ruido_de_tesseract_pero_no_los_digitos(self):
        texto = self._lectura([("NS", 0.3), ("2055", 0.45), ("CALLE", 0.95)], [("27.41", 0.97)]).como_texto()
        self.assertIn("Tesseract (compáralo", texto)
        self.assertNotIn("NS", texto)
        self.assertIn("2055[45]", texto)
        self.assertIn("1 palabras de Tesseract", texto)


class PalabrasYGiros(unittest.TestCase):
    def test_ruido_del_dibujo_no_es_palabra(self):
        self.assertFalse(ocr_zona.es_palabra("——", 90))
        self.assertFalse(ocr_zona.es_palabra("h", 0))
        self.assertTrue(ocr_zona.es_palabra("733.14", 15))
        self.assertTrue(ocr_zona.es_palabra("M2", 60))

    def test_desgirar_devuelve_el_punto_a_la_imagen_original(self):
        # Imagen de 100×40: el punto (10, 5) girado 90° horario queda en (40 − 5, 10) = (35, 10); girado 270°, en (5, 100 − 10) = (5, 90).
        self.assertEqual(ocr_zona._desgirar(35, 10, 90, 100, 40), (10, 5))
        self.assertEqual(ocr_zona._desgirar(5, 90, 270, 100, 40), (10, 5))
        self.assertEqual(ocr_zona._desgirar(90, 35, 180, 100, 40), (10, 5))
        self.assertEqual(ocr_zona._desgirar(7, 8, 0, 100, 40), (7, 8))


if __name__ == "__main__":
    unittest.main()
