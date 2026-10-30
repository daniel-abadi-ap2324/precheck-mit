"""Medición de planos PDF (precheck/planos/medicion.py): pisos, lote y unidades, con PDF sintéticos."""
import unittest

try:
    import pymupdf
except ImportError:  # pragma: no cover
    pymupdf = None

ANCHO, ALTO = 2592, 1728
M = 72 / 0.0254  # puntos por metro a escala 1:1


def _elevacion(p, niveles, habitable_en=None):
    """Como en las elevaciones de los anteproyectos: hoja girada 270° con el texto horizontal en la hoja sin girar, de
    modo que al leerla cada nivel es una columna (rótulo, cota) y los niveles avanzan a lo largo de x."""
    for i, (rotulo, cota) in enumerate(niveles):
        y = 300 + i * 120
        p.insert_text((1500, y), rotulo, fontsize=9)
        p.insert_text((1300, y), f"+{cota:.2f}", fontsize=9)
        if rotulo == habitable_en:
            p.insert_text((1700, y), "ULTIMO PISO HABITABLE", fontsize=9)
    p.insert_text((200, 1650), "ELEVACION FRONTAL", fontsize=14)
    p.set_rotation(270)


def _lineas(doc):
    from precheck.planos.lineas import lineas_vectoriales

    return [ln for i, p in enumerate(doc, start=1) for ln in lineas_vectoriales(p, i)]


@unittest.skipUnless(pymupdf, "requiere pymupdf")
class TestPisos(unittest.TestCase):
    def test_cuenta_desde_planta_baja_con_mezzanine_y_sin_sotano_ni_maquinas(self):
        from precheck.planos.medicion import pisos

        doc = pymupdf.open()
        _elevacion(doc.new_page(width=ANCHO, height=ALTO), [
            ("NIV SEMISOTANO - 100", 27.72), ("NIV PB + 000", 30.50), ("MEZZANINE NIV 100", 33.30),
            ("APT NIV + 200", 36.10), ("APT NIV + 300", 39.25), ("NIV CTO MAQUINAS", 42.40),
        ])
        h = pisos(_lineas(doc))
        self.assertEqual((h["hecho"], h["valor"], h["estado"]), ("proyecto.pisos_totales", 4, "ok"))
        self.assertEqual(h["fuente"]["pagina"], 1)
        self.assertEqual([n["nombre"] for n in h["niveles"]], ["NIV PB + 000", "MEZZANINE NIV 100", "APT NIV + 200", "APT NIV + 300"])
        self.assertIn("Art. 38", h["nota"])

    def test_area_social_superior_marcada_habitable_da_dos_candidatos_y_revision(self):
        from precheck.planos.medicion import pisos

        doc = pymupdf.open()
        _elevacion(doc.new_page(width=ANCHO, height=ALTO), [
            ("NIV PB + 000", 30.50), ("APT NIV + 100", 33.65), ("APT NIV + 200", 36.80), ("AS 2 NIV + 300", 39.95), ("NIV CTO MAQUINAS", 44.35),
        ], habitable_en="AS 2 NIV + 300")
        h = pisos(_lineas(doc))
        self.assertEqual((h["valor"], h["estado"], h["candidatos"]), (None, "revision", [4, 3]))
        self.assertIn("ULTIMO PISO HABITABLE", h["nota"])
        self.assertIn("4.40 m", h["nota"])  # AS2 → cuarto de máquinas: 4.40 m entre losas (≤ 4.50, es un piso)

    def test_entre_losas_de_mas_de_4_50_m_va_a_revision(self):
        from precheck.planos.medicion import pisos

        doc = pymupdf.open()
        _elevacion(doc.new_page(width=ANCHO, height=ALTO), [("NIV PB + 000", 0.0), ("APT NIV + 100", 6.0), ("APT NIV + 200", 9.0)])
        h = pisos(_lineas(doc))
        self.assertEqual((h["estado"], h["candidatos"]), ("revision", [3, 4]))
        self.assertIn("6.00 m", h["nota"])

    def test_sin_elevacion_no_se_encuentra(self):
        from precheck.planos.medicion import pisos

        doc = pymupdf.open()
        doc.new_page(width=ANCHO, height=ALTO).insert_text((100, 100), "PLANTA BAJA", fontsize=12)
        h = pisos(_lineas(doc))
        self.assertEqual((h["valor"], h["estado"], h["confianza"]), (None, "no_encontrado", 0.5))


@unittest.skipUnless(pymupdf, "requiere pymupdf")
class TestLote(unittest.TestCase):
    def _planta(self, esc=100, rotulo_esc="E. 1:100", area_txt="AREA DE TERRENO 600.00 M2", calle=True, doc=None):
        doc = doc or pymupdf.open()
        p = doc.new_page(width=ANCHO, height=ALTO)
        ancho, fondo = 20 * M / esc, 30 * M / esc  # lote de 20 m × 30 m
        x0, y0 = 800, 300
        p.draw_polyline([(x0, y0), (x0 + ancho, y0), (x0 + ancho, y0 + fondo), (x0, y0 + fondo)], closePath=True, width=0.72)
        p.draw_rect(pymupdf.Rect(900, 400, 1000, 500))  # un cuarto: otro polígono cerrado, con otra área
        if calle:
            p.insert_text((x0 + ancho / 2 - 40, y0 + fondo + 30), "ACERA CORRIDA", fontsize=9)
        p.insert_text((x0 + ancho + 40, y0 + fondo / 2), "ACERA INTERNA", fontsize=9)
        p.insert_text((150, 1500), area_txt, fontsize=12)
        p.insert_text((150, 1540), rotulo_esc, fontsize=12)
        return doc

    def test_polígono_a_escala_da_area_y_el_frente_es_el_lado_junto_a_la_acera(self):
        from precheck.planos.medicion import lote

        doc = self._planta()
        frente, area = lote(doc, _lineas(doc), area_declarada=600.0)
        self.assertEqual((area["hecho"], area["estado"]), ("lote.area_geometrica_m2", "ok"))
        self.assertAlmostEqual(area["valor"], 600.0, delta=0.5)
        self.assertEqual(area["escala"], 100)
        self.assertEqual((frente["hecho"], frente["estado"]), ("lote.frente_m", "ok"))
        self.assertAlmostEqual(frente["valor"], 20.0, delta=0.05)
        self.assertEqual(frente["fuente"]["metodo"], "pdf_geometria")

    def test_escala_distinta_a_la_rotulada_si_el_area_coincide(self):
        from precheck.planos.medicion import lote

        doc = self._planta(esc=75, rotulo_esc="E. 1:25")
        _, area = lote(doc, _lineas(doc), area_declarada=600.0)
        self.assertEqual(area["escala"], 75)

    def test_sin_area_declarada_no_se_adivina_la_escala(self):
        from precheck.planos.medicion import lote

        doc = self._planta(area_txt="")
        frente, area = lote(doc, _lineas(doc), area_declarada=None)
        self.assertEqual((frente["estado"], area["estado"]), ("no_encontrado", "no_encontrado"))

    def test_el_frente_sale_de_la_lamina_que_rotula_la_acera_aunque_otra_tenga_el_lote_sin_rotular(self):
        from precheck.planos.medicion import lote

        doc = self._planta(calle=False)
        self._planta(esc=75, rotulo_esc="E. 1:75", doc=doc)
        frente, area = lote(doc, _lineas(doc), area_declarada=600.0)
        self.assertEqual((frente["estado"], frente["fuente"]["pagina"]), ("ok", 2))
        self.assertAlmostEqual(frente["valor"], 20.0, delta=0.05)
        self.assertIn("2 láminas", area["nota"])

    def test_lote_en_esquina_segun_la_direccion_va_a_revision_aunque_solo_se_rotule_una_acera(self):
        from precheck.planos.medicion import lote

        doc = self._planta()
        doc[0].insert_text((2000, 1500), "LOTE 56, CALLE UNO Y CALLE DOS", fontsize=10)
        frente, _ = lote(doc, _lineas(doc), area_declarada=600.0)
        self.assertEqual((frente["valor"], frente["estado"], frente["candidatos"]), (None, "revision", [20.0]))
        self.assertIn("dos calles", frente["nota"])

    def _cuadro(self, contenido):
        """Lote en trazos sueltos a 1:150 (no cerrado) y un cuadro cerrado que mide 2 980 m² a 1:500, con `contenido(p,
        caja)` dentro. Devuelve el hecho lote.area_geometrica_m2."""
        from precheck.planos.medicion import lote

        doc = pymupdf.open()
        p = doc.new_page(width=ANCHO, height=ALTO)
        k = M / 150
        x0, y0 = 300, 300
        for a, b in [((0, 0), (40, 0)), ((40, 0), (40, 74.5)), ((40, 74.5), (0, 74.5)), ((0, 74.5), (0, 0))]:
            p.draw_line((x0 + a[0] * k, y0 + a[1] * k), (x0 + b[0] * k, y0 + b[1] * k), width=0.72)
        p.insert_text((x0, y0 + 76 * k), "PLANTA BAJA ESCALA 1:150", fontsize=12)
        k5 = M / 500
        caja = pymupdf.Rect(1900, 1000, 1900 + 40 * k5, 1000 + 74.5 * k5)   # 2 980 m² a 1:500
        p.draw_rect(caja, width=0.5)
        contenido(p, caja)
        p.insert_text((150, 1600), "AREA DEL LOTE: 2980.00 M2", fontsize=12)
        return lote(doc, _lineas(doc), area_declarada=2980.0)[1]

    def test_un_cuadro_de_notas_que_mide_el_area_a_otra_escala_no_es_el_lote(self):
        """Como en San Francisco: el cuadro «NOTA IMPORTANTE» mide el área del lote a 1:500, pero es texto."""

        def notas(p, caja):
            for i in range(8):
                p.insert_text((caja.x0 + 10, caja.y0 + 20 + i * 14), f"NOTA {i + 1}: TEXTO DE LA NOTA", fontsize=8)

        self.assertEqual(self._cuadro(notas)["estado"], "no_encontrado")

    def test_una_nota_que_menciona_la_linea_de_propiedad_no_es_el_lote(self):
        def nota(p, caja):
            p.insert_text((caja.x0 + 10, caja.y0 + 20), "NOTA 1: RETIRO DE 1.50 M DESDE LA LINEA DE PROPIEDAD", fontsize=8)
            for i in range(1, 8):
                p.insert_text((caja.x0 + 10, caja.y0 + 20 + i * 14), f"NOTA {i + 1}: TEXTO DE LA NOTA", fontsize=8)

        self.assertEqual(self._cuadro(nota)["estado"], "no_encontrado")

    def test_una_tabla_o_una_leyenda_no_son_el_lote(self):
        def tabla(p, caja):   # reglas de tabla (de lado a lado) y texto en las celdas
            for i in range(1, 10):
                y = caja.y0 + i * caja.height / 10
                p.draw_line((caja.x0, y), (caja.x1, y), width=0.3)
            p.draw_line((caja.x0 + caja.width / 2, caja.y0), (caja.x0 + caja.width / 2, caja.y1), width=0.3)
            for i in range(10):
                p.insert_text((caja.x0 + 4, caja.y0 + 8 + i * caja.height / 10), f"AREA {i}", fontsize=5)

        def leyenda(p, caja):   # símbolos pequeños con su texto, bajo el título LEYENDA
            p.insert_text((caja.x0 + 4, caja.y0 + 10), "LEYENDA", fontsize=7)
            for i in range(5):
                y = caja.y0 + 20 + i * 18
                p.draw_rect(pymupdf.Rect(caja.x0 + 4, y, caja.x0 + 12, y + 8), width=0.3)
                p.draw_line((caja.x0 + 4, y), (caja.x0 + 12, y + 8), width=0.3)
                p.insert_text((caja.x0 + 16, y + 7), "INDICA ALGO", fontsize=5)

        for contenido in (tabla, leyenda):
            self.assertEqual(self._cuadro(contenido)["estado"], "no_encontrado", contenido.__name__)

    def test_lee_los_dibujos_de_cada_pagina_una_sola_vez(self):
        from unittest import mock

        from precheck.planos.medicion import lote

        doc = self._planta()
        lineas = _lineas(doc)
        original = pymupdf.Page.get_drawings
        llamadas = []

        def contar(pagina, *a, **k):
            llamadas.append(pagina.number)
            return original(pagina, *a, **k)

        with mock.patch.object(pymupdf.Page, "get_drawings", contar):
            _, area = lote(doc, lineas, area_declarada=600.0)
        self.assertEqual(area["estado"], "ok")
        self.assertEqual(llamadas, [0])

    def test_un_poligono_con_una_planta_dentro_o_lindero_rotulado_afuera_si_es_el_lote(self):
        def planta(p, caja):
            for i in range(3):
                p.draw_rect(pymupdf.Rect(caja.x0 + 5 + i * 20, caja.y0 + 5, caja.x0 + 20 + i * 20, caja.y0 + 30), width=0.3)
            p.insert_text((caja.x0 + 8, caja.y0 + 50), "SALA", fontsize=6)

        def lindero(p, caja):
            p.insert_text((caja.x0, caja.y0 - 6), "LINEA DE PROPIEDAD", fontsize=6)

        for contenido in (planta, lindero):
            area = self._cuadro(contenido)
            self.assertEqual((area["estado"], area.get("escala")), ("ok", 500), contenido.__name__)

    def test_sin_calle_rotulada_el_frente_va_a_revision(self):
        from precheck.planos.medicion import lote

        doc = self._planta(calle=False)
        frente, area = lote(doc, _lineas(doc), area_declarada=600.0)
        self.assertEqual(area["estado"], "ok")
        self.assertEqual(frente["estado"], "revision")
        self.assertEqual(sorted(frente["candidatos"]), [20.0, 20.0, 30.0, 30.0])


@unittest.skipUnless(pymupdf, "requiere pymupdf")
class TestUnidades(unittest.TestCase):
    def test_apartamentos_por_planta_tipica_por_numero_de_pisos_tipicos(self):
        from precheck.planos.medicion import densidad, unidades

        doc = pymupdf.open()
        p = doc.new_page(width=ANCHO, height=ALTO)
        p.insert_text((2000, 1600), "PLANTA DE APARTAMENTOS TIPICA APT NIV +300 @ +500 (+39.60 @ +45.90)", fontsize=12)
        for i, letra in enumerate("ABC"):
            p.insert_text((300 + i * 300, 500), f"APARTAMENTO {letra}", fontsize=10)
            p.insert_text((300 + i * 300, 540), "RECAMARA", fontsize=8)
        p.insert_text((300, 900), "APARTAMENTO A", fontsize=10)  # repetido: no suma
        u = unidades(_lineas(doc))
        self.assertEqual((u["hecho"], u["valor"], u["estado"]), ("proyecto.unidades_vivienda", 9, "ok"))
        self.assertIn("3 por planta típica × 3 pisos", u["nota"])

        d = densidad(u)
        self.assertEqual((d["hecho"], d["valor"], d["estado"]), ("proyecto.densidad_pers_ha", None, "no_encontrado"))
        self.assertIn("9 unidades", d["nota"])
        self.assertIn("personas por unidad", d["nota"])

    def test_sin_planta_tipica_no_hay_unidades(self):
        from precheck.planos.medicion import unidades

        doc = pymupdf.open()
        doc.new_page(width=ANCHO, height=ALTO).insert_text((300, 500), "APARTAMENTO A", fontsize=10)
        self.assertEqual(unidades(_lineas(doc))["estado"], "no_encontrado")


class TestDensidadDeLaNorma(unittest.TestCase):
    def test_densidad_maxima_transcrita_no_es_la_del_proyecto(self):
        from precheck.planos.lineas import Linea
        from precheck.planos.medicion import densidad

        def L(t, y=0):
            return Linea(t, 1, (0, y, 100, y + 8), "pdf_texto", 0.99)

        sin_unidades = {"valor": None}
        for t in ("DENSIDAD MÁXIMA: 500 personas/hectáreas", "DENSIDAD PERMITIDA 750 PERS/HA",
                  "DENSIDAD SEGÚN NORMA: 300 hab/ha", "DENSIDAD NORMA 300 HAB/HA"):
            with self.subTest(t=t):
                d = densidad(sin_unidades, [L(t)])
                self.assertEqual((d["valor"], d["estado"]), (None, "no_encontrado"))
                self.assertIn("límite", d["nota"])
        d = densidad(sin_unidades, [L("DENSIDAD MÁXIMA: 500 pers/ha"), L("DENSIDAD PROPUESTA: 420 pers/ha", 20)])
        self.assertEqual((d["valor"], d["estado"]), (420.0, "ok"))


class TestOcupacion(unittest.TestCase):
    """proyecto.ocupacion_pct desde el cuadro de áreas (filas sintéticas: rótulo a la izquierda, cantidad a la derecha)."""

    @staticmethod
    def _cuadro(filas, metodo="pdf_texto"):
        from precheck.planos.lineas import Linea

        ls = []
        for i, (rotulo, cantidad) in enumerate(filas):
            y = 1000 + 18 * i
            ls.append(Linea(rotulo, 1, (150, y, 400, y + 9), metodo, 0.95))
            if cantidad:
                ls.append(Linea(cantidad, 1, (420, y + 1, 460, y + 8), metodo, 0.95))
        return ls

    def test_indice_que_no_es_la_planta_baja_va_a_revision(self):
        from precheck.planos.medicion import ocupacion

        h = ocupacion(self._cuadro([("ÁREA DEL LOTE", "1,000.00 M2"), ("SUB-TOTAL ÁREAS CONSTRUIDAS PLANTA 00", "400.00 M2"),
                                    ("SUB-TOTAL ÁREAS CONSTRUIDAS PLANTA +100", "500.00 M2"), ("ÍNDICE DE OCUPACIÓN", "50%")]))
        self.assertEqual((h["hecho"], h["valor"], h["estado"]), ("proyecto.ocupacion_pct", None, "revision"))
        self.assertEqual(h["candidatos"], [40.0, 50.0])
        self.assertLessEqual(h["confianza"], 0.6)

    def test_area_total_o_mayor_que_la_planta_baja_va_a_revision(self):
        from precheck.planos.medicion import ocupacion

        for filas in ([("ÁREA TOTAL DE OCUPACIÓN", "900.00 M2")],
                      [("PLANTA BAJA ÁREA CERRADA", "400.00 M2"), ("ÁREA DE OCUPACIÓN", "650.00 M2")]):
            with self.subTest(filas=filas):
                h = ocupacion(self._cuadro(filas), area_lote_m2=1000.0)
                self.assertEqual((h["valor"], h["estado"]), (None, "revision"))
                self.assertLessEqual(h["confianza"], 0.6)
                self.assertIn(65.0 if len(filas) == 2 else 90.0, h["candidatos"])

    def test_area_de_ocupacion_clara_da_el_porcentaje(self):
        from precheck.planos.medicion import ocupacion

        h = ocupacion(self._cuadro([("PLANTA BAJA ÁREA CERRADA", "400.00 M2"), ("ÁREA DE OCUPACIÓN", "400.00 M2")]), area_lote_m2=1000.0)
        self.assertEqual((h["valor"], h["estado"]), (40.0, "ok"))
        h = ocupacion(self._cuadro([("% DE OCUPACIÓN: 38.5%", None)]))
        self.assertEqual((h["valor"], h["estado"]), (38.5, "ok"))

    def test_la_ocupacion_maxima_de_la_norma_no_es_la_del_proyecto(self):
        from precheck.planos.medicion import ocupacion

        h = ocupacion(self._cuadro([("OCUPACIÓN MÁXIMA: 60% DEL ÁREA DEL LOTE.", None), ("ÍNDICE DE OCUPACIÓN PERMITIDO", "70%")]))
        self.assertEqual((h["valor"], h["estado"]), (None, "no_encontrado"))


if __name__ == "__main__":
    unittest.main()
