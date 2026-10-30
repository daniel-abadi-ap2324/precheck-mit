"""Segundo lector de OCR (RapidOCR) para el recuadro de datos del lote: precheck/planos/lineas.py."""
import unittest
from unittest import mock

from precheck.planos import lineas as L
from precheck.planos.lineas import Linea


def ln(texto, caja, conf=0.5):
    return Linea(texto=texto, pagina=1, bbox=caja, metodo="ocr", confianza=conf)


class TestRecuadro(unittest.TestCase):
    def test_region_alrededor_del_rotulo_recortada_a_la_hoja(self):
        r = L.region_del_recuadro((961.0, 284.6, 1011.4, 290.4), 2592.0, 1728.0)
        for obtenido, esperado in zip(r, (931.0, 244.6, 1431.4, 550.4)):
            self.assertAlmostEqual(obtenido, esperado)
        self.assertEqual(L.region_del_recuadro((5.0, 5.0, 20.0, 10.0), 100.0, 100.0), (0.0, 0.0, 100.0, 100.0))

    def test_las_lineas_nuevas_van_en_puntos_de_la_hoja_y_con_confianza_tope(self):
        # Un recorte a 300 dpi que empieza en (931, 244.6) pt: 300 px = 72 pt.
        cajas = [[[0, 0], [300, 0], [300, 60], [0, 60]], [[0, 100], [600, 100], [600, 160], [0, 160]]]
        nuevas = L.lineas_del_segundo_lector(cajas, ["FINCA: 078850", "AREA:733.14M2"], [0.98, 0.91], 1, (931.0, 244.6, 1431.0, 550.0))
        self.assertEqual([x.texto for x in nuevas], ["FINCA: 078850", "AREA:733.14M2"])
        self.assertAlmostEqual(nuevas[0].bbox[0], 931.0)
        self.assertAlmostEqual(nuevas[0].bbox[2], 931.0 + 72.0)
        self.assertAlmostEqual(nuevas[1].bbox[1], 244.6 + 24.0)
        self.assertTrue(all(x.metodo == "ocr" and x.pagina == 1 for x in nuevas))
        # Nunca llega solo al umbral del motor (0.85).
        self.assertEqual([x.confianza for x in nuevas], [L.CONFIANZA_SEGUNDO_LECTOR, L.CONFIANZA_SEGUNDO_LECTOR])
        self.assertLess(L.CONFIANZA_SEGUNDO_LECTOR, 0.85)
        

    def test_acepta_los_tipos_numpy_del_motor_y_el_resultado_se_puede_serializar(self):
        import json  # noqa: PLC0415

        import numpy as np  # noqa: PLC0415

        cajas = np.array([[[0, 0], [300, 0], [300, 60], [0, 60]]], dtype=np.float32)
        nuevas = L.lineas_del_segundo_lector(cajas, ["FINCA: 078850"], np.array([0.97], dtype=np.float32), 1, (931.0, 244.6, 1431.0, 550.0))
        json.dumps([x.__dict__ for x in nuevas])
        self.assertTrue(all(type(v) is float for v in nuevas[0].bbox))
        self.assertIs(type(nuevas[0].confianza), float)

    def test_se_descartan_las_lecturas_vacias_y_se_respetan_las_de_poca_confianza(self):
        nuevas = L.lineas_del_segundo_lector([[[0, 0], [10, 0], [10, 10], [0, 10]]] * 2, ["  ", "x"], [0.9, 0.3], 1, (0, 0, 10, 10))
        self.assertEqual([(x.texto, x.confianza) for x in nuevas], [("x", 0.3)])

    def test_fusionar_reemplaza_solo_las_lineas_de_datos_numericos_tapadas_por_una_nueva(self):
        lejos = ln("OTRA COSA", (100, 100, 150, 110))
        finca_vieja = ln("FINCA: 07885", (960, 285, 1010, 290))
        zona = ln("ZONIFICACION: RMH2", (960, 450, 1200, 458), 0.88)
        nueva_finca = ln("FINCA: 078850", (958, 283, 1012, 292), 0.8)
        nueva_zona = ln("ZONIFICACION: RM-H2", (958, 448, 1202, 460), 0.8)
        res = L.fusionar_recuadro([lejos, finca_vieja, zona], [nueva_finca, nueva_zona])
        # La finca se reemplaza; la zona, aunque el segundo lector también la leyó, queda como la leyó la primera lectura.
        self.assertEqual([x.texto for x in res], ["OTRA COSA", "ZONIFICACION: RMH2", "FINCA: 078850"])
        # El rótulo pegado al número también cuenta («AREA733.14M2»).
        self.assertTrue(L.ROTULOS_DE_DATOS.search("AREA733.14M2"))


class TestSinSegundoLector(unittest.TestCase):
    def test_sin_el_motor_las_lineas_quedan_igual(self):
        lineas = [ln("FINCA: 07885", (960, 285, 1010, 290))]
        with mock.patch.object(L, "_segundo_lector", return_value=None):
            self.assertEqual(L._reforzar_recuadros(object(), 0, lineas, 1, 2592.0, 1728.0), lineas)

    def test_sin_rotulo_de_finca_no_se_relee_nada(self):
        lineas = [ln("ESCALA 1:100", (10, 10, 60, 20))]
        motor = mock.Mock()
        with mock.patch.object(L, "_segundo_lector", return_value=motor):
            self.assertEqual(L._reforzar_recuadros(object(), 0, lineas, 1, 2592.0, 1728.0), lineas)
        motor.assert_not_called()

    def test_un_fallo_del_motor_no_tumba_la_lectura(self):
        lineas = [ln("FINCA: 07885", (960, 285, 1010, 290))]

        class Pagina:
            def get_pixmap(self, dpi):
                from PIL import Image  # noqa: PLC0415
                import io  # noqa: PLC0415

                buf = io.BytesIO()
                Image.new("RGB", (int(2592 * dpi / 72) // 8, int(1728 * dpi / 72) // 8), "white").save(buf, format="PNG")
                return mock.Mock(tobytes=lambda _fmt: buf.getvalue())

        motor = mock.Mock(side_effect=RuntimeError("falló"))
        with mock.patch.object(L, "_segundo_lector", return_value=motor), mock.patch.object(L, "_girar", side_effect=lambda png, g: (__import__("PIL.Image", fromlist=["Image"]).new("RGB", (8000, 4000), "white"), png)):
            self.assertEqual(L._reforzar_recuadros(Pagina(), 0, lineas, 1, 2592.0, 1728.0), lineas)


if __name__ == "__main__":
    unittest.main()
