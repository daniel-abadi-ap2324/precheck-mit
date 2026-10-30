"""Extracción de un plano PDF de punta a punta (precheck/planos/extraer.py) con PDF sintéticos."""
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

try:
    import pymupdf
except ImportError:  # pragma: no cover
    pymupdf = None

TESSERACT = shutil.which("tesseract") is not None
ANCHO, ALTO = 2592, 1728  # 36" × 24" en puntos, como las hojas de los anteproyectos


def _hoja_vectorial(doc):
    p = doc.new_page(width=ANCHO, height=ALTO)
    p.insert_text((150, 300), "UBICACION REGIONAL - ESCALA 1:5000", fontsize=14)
    p.insert_text((150, 700), "RESUMEN DE AREAS", fontsize=14)
    p.insert_text((150, 740), "AREA DEL LOTE TOTAL: 2,980.00 m2", fontsize=14)
    p.insert_text((2100, 1300), "CALLE 50, CORREGIMIENTO DE SAN FRANCISCO", fontsize=12)
    p.insert_text((2100, 1340), "PROPIETARIO: TEST USER", fontsize=12)
    p.insert_text((2100, 1500), "PLANTA ARQUITECTONICA BAJA", fontsize=14)
    p.insert_text((2100, 1540), "ESCALA 1:100", fontsize=12)
    p.insert_text((2300, 1650), "A-101", fontsize=40)


def _hoja_escaneada(doc):
    """Una hoja con el membrete como imagen (sin texto): se lee con OCR."""
    img = pymupdf.open()
    ip = img.new_page(width=ANCHO, height=ALTO)
    ip.insert_text((150, 740), "AREA DEL LOTE: 850 m2", fontsize=40)
    ip.insert_text((1900, 1400), "PLANTA DE CONJUNTO", fontsize=40)
    ip.insert_text((2150, 1650), "A-02", fontsize=90)
    png = ip.get_pixmap(dpi=100).tobytes("png")
    p = doc.new_page(width=ANCHO, height=ALTO)
    p.insert_image(p.rect, stream=png)


@unittest.skipUnless(pymupdf, "requiere pymupdf")
class TestExtraerPlano(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.base = pathlib.Path(self.dir.name)

    def tearDown(self):
        self.dir.cleanup()

    def pdf(self, *hojas):
        doc = pymupdf.open()
        for h in hojas:
            h(doc)
        ruta = self.base / "plano.pdf"
        doc.save(ruta)
        return ruta

    def test_hoja_vectorial_sin_ocr(self):
        from precheck.planos.extraer import extraer
        r = extraer(self.pdf(_hoja_vectorial), self.base / "salida")
        self.assertEqual(r["paginas"][0]["tipo"], "vectorial")
        self.assertEqual(r["paginas"][0]["lamina"], {"codigo": "A-101", "titulo": "PLANTA ARQUITECTONICA BAJA", "escala": 100, "hoja": None, "total_hojas": None})
        hechos = {h["hecho"]: h for h in r["hechos"]}
        self.assertEqual(hechos["lote.area_m2"]["valor"], 2980.0)
        self.assertEqual(hechos["lote.area_m2"]["fuente"]["metodo"], "pdf_texto")
        self.assertEqual(hechos["lote.corregimiento"]["valor"], "San Francisco")
        # Medición (mupa-medicion-planos): sin elevación ni polígono del lote, a revisión o no encontrado, nunca inventado.
        for h in ("proyecto.pisos_totales", "lote.frente_m", "lote.area_geometrica_m2", "proyecto.unidades_vivienda", "proyecto.densidad_pers_ha"):
            self.assertEqual((hechos[h]["valor"], hechos[h]["estado"]), (None, "no_encontrado"), h)
        req = {x["requisito"]: x["existe"] for x in r["requisitos_anexo_iv"]}
        self.assertTrue(req["localizacion_regional"] and req["cuadro_de_areas"] and req["propietario"])
        # Nada de datos personales en la salida.
        self.assertNotIn("TEST USER", json.dumps(r))
        # Miniatura por página y huella del documento.
        self.assertTrue((self.base / "salida" / r["paginas"][0]["miniatura"]).exists())
        self.assertRegex(r["sha256"], r"^[0-9a-f]{64}$")

    @unittest.skipUnless(TESSERACT, "requiere tesseract")
    def test_hoja_escaneada_con_ocr_y_confianza_menor(self):
        from precheck.planos.extraer import extraer
        r = extraer(self.pdf(_hoja_escaneada), self.base / "salida")
        p = r["paginas"][0]
        self.assertEqual(p["tipo"], "escaneada")
        self.assertEqual(p["lamina"]["codigo"], "A-02")
        area = next(h for h in r["hechos"] if h["hecho"] == "lote.area_m2")
        self.assertEqual((area["valor"], area["fuente"]["metodo"]), (850.0, "ocr"))
        self.assertLess(area["confianza"], 0.95)

    @unittest.skipUnless(TESSERACT, "requiere tesseract")
    def test_sello_pegado_como_imagen_en_una_hoja_vectorial(self):
        from precheck.planos.extraer import extraer

        def hoja_con_sello(doc):
            _hoja_vectorial(doc)
            sello = pymupdf.open()
            sp = sello.new_page(width=260, height=140)
            sp.insert_text((10, 40), "NOMBRE APELLIDO", fontsize=14)
            sp.insert_text((10, 70), "ARQUITECTO", fontsize=14)
            sp.insert_text((10, 100), "Ley 15 del 26 de enero de 1959", fontsize=12)
            png = sp.get_pixmap(dpi=150).tobytes("png")
            doc[-1].insert_image(pymupdf.Rect(2300, 1100, 2560, 1240), stream=png)

        r = extraer(self.pdf(hoja_con_sello), self.base / "salida")
        prof = next(x for x in r["requisitos_anexo_iv"] if x["requisito"] == "profesional_responsable")
        self.assertTrue(prof["existe"])
        self.assertEqual(prof["fuente"]["metodo"], "ocr")
        self.assertNotIn("APELLIDO", json.dumps(r))

    def test_cli_escribe_json(self):
        pdf = self.pdf(_hoja_vectorial)
        salida = self.base / "cli"
        r = subprocess.run([sys.executable, "-m", "precheck.planos", str(pdf), "--salida", str(salida)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        datos = json.loads((salida / "extraccion.json").read_text(encoding="utf-8"))
        self.assertEqual(datos["documento"], "plano.pdf")
        self.assertEqual(len(datos["paginas"]), 1)


if __name__ == "__main__":
    unittest.main()
