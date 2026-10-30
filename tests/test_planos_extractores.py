"""Extractores de datos de planos PDF (precheck/planos): reglas sobre líneas de texto con procedencia.

Las líneas vienen del texto vectorial del PDF o del OCR; aquí se prueban con líneas sintéticas (mupa-ocr-planos).
"""
import unittest

from precheck.planos.extractores import (
    area_lote,
    corregimiento,
    escalas,
    fincas,
    fincas_del_lote,
    lamina,
    norma_transcrita,
    numero,
    requisitos_anexo_iv,
    requisitos_documentales,
    zonificacion_declarada,
)
from precheck.planos.lineas import Linea


def L(texto, pagina=1, bbox=(0, 0, 10, 10), metodo="pdf_texto", confianza=0.99):
    return Linea(texto=texto, pagina=pagina, bbox=bbox, metodo=metodo, confianza=confianza)


class TestNumero(unittest.TestCase):
    def test_formatos_de_panama(self):
        self.assertEqual(numero("1,425.92"), (1425.92, False))
        self.assertEqual(numero("2980"), (2980.0, False))
        self.assertEqual(numero("727.54"), (727.54, False))

    def test_confusiones_de_ocr_se_corrigen_y_se_marcan(self):
        self.assertEqual(numero("7O5.3l"), (705.31, True))
        self.assertEqual(numero("abc"), (None, False))


class TestAreaDelLote(unittest.TestCase):
    def test_un_valor_claro_da_el_hecho_con_su_procedencia(self):
        h = area_lote([L("AREA DEL LOTE TOTAL: 2980m² - 100%", pagina=1, bbox=(500, 1007, 700, 1015))])
        self.assertEqual(h["hecho"], "lote.area_m2")
        self.assertEqual(h["valor"], 2980.0)
        self.assertEqual(h["fuente"], {"metodo": "pdf_texto", "pagina": 1, "bbox": [500, 1007, 700, 1015]})
        self.assertEqual(h["estado"], "ok")

    def test_variantes_de_redaccion(self):
        for t, v in [("AREA DE TERRENO 727.54 M2", 727.54), ("ÁREA DEL LOTE = 1,660.00 m2", 1660.0), ("Superficie del lote: 450 mts2", 450.0)]:
            with self.subTest(t=t):
                self.assertEqual(area_lote([L(t)])["valor"], v)

    def test_valores_distintos_van_a_revision_sin_elegir(self):
        h = area_lote([L("AREA DEL LOTE: 800 m2", pagina=1), L("AREA DE TERRENO 850 m2", pagina=3)])
        self.assertIsNone(h["valor"])
        self.assertEqual(h["estado"], "revision")
        self.assertEqual(h["candidatos"], [800.0, 850.0])

    def test_sin_dato_no_se_inventa(self):
        h = area_lote([L("PLANTA ARQUITECTONICA")])
        self.assertIsNone(h["valor"])
        self.assertEqual(h["estado"], "no_encontrado")

    def test_rotulo_con_el_identificador_del_lote(self):
        for t in ["AREA DEL LOTE MODELO B: 177.75 m2", "ÁREA DEL LOTE #73 = 177.75 m2", "Área de lote tipo A: 177.75 m2",
                  "SUPERFICIE DEL LOTE N° 73: 177.75 M2", "AREA DE LOTE 73: 177.75 m2", "AREA DEL LOTE #73 MODELO B: 177.75 m2"]:
            with self.subTest(t=t):
                h = area_lote([L(t)])
                self.assertEqual((h["valor"], h["estado"]), (177.75, "ok"))

    def test_sin_dos_puntos_el_numero_no_es_un_identificador(self):
        # «AREA DE LOTE 160 M2»: 160 es el área, no el lote n.º 160.
        self.assertEqual(area_lote([L("AREA DE LOTE 160 M2")])["valor"], 160.0)

    def test_area_del_desarrollo_no_es_el_area_del_lote(self):
        # Desarrollo de varios lotes (texto sintético): el área de la finca madre y la suma de lotes no son el lote.
        ls = [L("ÁREA 26,043.00 m²"), L("ÁREA TOTAL DEL DESARROLLO: 26,043.00 m2"), L("ÁREA DE LOTES: 3,770.25 m2"),
              L("ÁREA DE USO PÚBLICO: 2,600.00 m2"), L("DATOS DEL PROYECTO:"), L("AREA DEL LOTE MODELO X: 177.75 m2")]
        h = area_lote(ls)
        self.assertEqual((h["valor"], h["estado"]), (177.75, "ok"))

    def test_cuadro_de_lotes_sin_rotulo_de_area_del_lote_no_da_candidatos(self):
        # Cuadro de lotes del desarrollo: columnas «LOTE» y «ÁREA» con valores sueltos.
        ls = [L("LOTE"), L("ÁREA"), *[L(f"{v} m2") for v in ("180.00", "177.75", "179.97")], L("LOTE #9 - MODELO X 1:200")]
        self.assertEqual(area_lote(ls)["estado"], "no_encontrado")

    def test_lote_minimo_de_la_norma_junto_al_area_del_lote(self):
        ls = [L("ÁREA MÍNIMA DE LOTE: 160.00 M2"), L("LOTE MÍNIMO 160 m2"), L("AREA DE LOTE MINIMA: 160 m2"),
              L("AREA DEL LOTE TIPO MINIMO: 160 m2"), L("AREA DEL LOTE #73: 177.75 m2")]
        h = area_lote(ls)
        self.assertEqual((h["valor"], h["estado"]), (177.75, "ok"))

    def test_lotes_distintos_sin_desempate_van_a_revision(self):
        h = area_lote([L("AREA DEL LOTE #72: 180.00 m2"), L("AREA DEL LOTE #73: 177.75 m2")])
        self.assertEqual((h["valor"], h["estado"], h["candidatos"]), (None, "revision", [177.75, 180.0]))

    def test_ocr_baja_la_confianza(self):
        h = area_lote([L("AREA DEL LOTE: 98O m2", metodo="ocr", confianza=0.8)])
        self.assertEqual(h["valor"], 980.0)
        self.assertLess(h["confianza"], 0.8)


def F(texto, y, x=100, pagina=1, alto=10, ancho=200, **kw):
    """Línea en una posición de la hoja (para los bloques de datos y las celdas de una fila)."""
    return L(texto, pagina=pagina, bbox=(x, y, x + ancho, y + alto), **kw)


class TestAreaDelLoteVariantes(unittest.TestCase):
    """Variantes reales del área del lote (Casco Antiguo, Tocumen) con líneas sintéticas."""

    def test_parcela_y_poligono_son_rotulos_del_lote(self):
        for t, v in [("AREA DE LA PARCELA: 733.14 M2", 733.14), ("ÁREA DEL POLÍGONO: 500.00 m2", 500.0),
                     ("SUPERFICIE DEL POLIGONO = 1,250.50 M2", 1250.5), ("SUPERFICIE DE LA PARCELA 98.20 MTS2", 98.2)]:
            with self.subTest(t=t):
                h = area_lote([L(t)])
                self.assertEqual((h["valor"], h["estado"]), (v, "ok"))

    def test_area_en_el_recuadro_de_datos_de_la_finca(self):
        # Casco Antiguo: «DATOS DE LA FINCA» / «FINCA: 078850; …; TOMO …» / «AREA:733.14M2».
        ls = [F("DATOS DE LA FINCA", 100), F("FINCA: 078850; COD. UBICACION: 8701; TOMO: 370", 115),
              F("AREA:733.14M2", 130, ancho=80)]
        h = area_lote(ls)
        self.assertEqual((h["valor"], h["estado"]), (733.14, "ok"))
        self.assertEqual(h["fuente"]["bbox"], [100, 130, 180, 140])

    def test_superficie_en_datos_de_proyecto(self):
        # Tocumen: «DATOS DE PROYECTO» / «FOLIO REAL 076524 …» / «SUPERFICIE 31450.00 M2».
        ls = [F("DATOS DE PROYECTO", 100), F("FOLIO REAL 076524 CODIGO DE UBICACIÓN 8718", 115),
              F("TOMO 453 FOLIO 270", 130), F("SUPERFICIE 31450.00 M2", 145)]
        h = area_lote(ls)
        self.assertEqual((h["valor"], h["estado"]), (31450.0, "ok"))

    def test_area_suelta_fuera_del_recuadro_de_datos_no_cuenta(self):
        # «AREA: …» o «SUPERFICIE …» sueltos en el dibujo (una planta, una nota) no son el área del lote.
        for t in ["AREA: 590.20 M2", "SUPERFICIE 31450.00 M2", "AREA 590.20 M2"]:
            with self.subTest(t=t):
                self.assertEqual(area_lote([F("PLANTA AREA SOCIAL", 100), F(t, 115)])["estado"], "no_encontrado")

    def test_en_el_recuadro_no_cuentan_construccion_abierta_cerrada_ni_verde(self):
        ls = [F("DATOS DEL PROYECTO", 100), F("FINCA: 078850", 115), F("AREA DE CONSTRUCCION: 1,668.12 M2", 130),
              F("AREA CERRADA: 1668.12 M2", 145), F("AREA ABIERTA TOTAL: 650.74 M2", 160), F("AREA VERDE: 120 M2", 175),
              F("TOTAL DE AREA: 2318.86 M2", 190), F("AREA DE ESTACIONAMIENTOS: 300 M2", 205)]
        self.assertEqual(area_lote(ls)["estado"], "no_encontrado")

    def test_en_el_recuadro_el_area_va_junto_a_los_datos_registrales(self):
        # «DATOS DEL PROYECTO» que lista las unidades: «ÁREA: 75 M2» de un apartamento, lejos de FINCA/TOMO/FOLIO.
        ls = [F("DATOS DEL PROYECTO", 100), F("FINCA: 078850, TOMO 370, FOLIO 12", 115),
              *[F(f"NOTA {k}", 130 + 15 * k) for k in range(8)], F("APARTAMENTO TIPO A", 250), F("AREA: 75.00 M2", 265)]
        self.assertEqual(area_lote(ls)["estado"], "no_encontrado")

    def test_area_de_la_finca_madre_en_el_dibujo_no_cuenta(self):
        # Panamá Norte: «FINCAS 083091439, …» / «ÁREA 28,043.08 m²» rotulan la finca madre en el dibujo.
        ls = [F("FINCAS 083091439, 30329811,", 300, x=650), F("ÁREA 28,043.08 m²", 315, x=650),
              F("DATOS DEL PROYECTO:", 100), F("AREA DEL LOTE MODELO B: 177.75 m2", 115)]
        h = area_lote(ls)
        self.assertEqual((h["valor"], h["estado"]), (177.75, "ok"))

    def test_area_junto_a_una_finca_colindante_no_cuenta(self):
        ls = [F("DATOS DE LAS FINCAS", 100), F("FINCA COLINDANTE 074093", 115), F("AREA: 950.00 M2", 125)]
        self.assertEqual(area_lote(ls)["estado"], "no_encontrado")

    def test_valor_en_la_celda_de_la_derecha(self):
        # «RESUMEN DE AREAS»: rótulo y valor en celdas distintas de la misma fila.
        ls = [F("RESUMEN DE AREAS", 90), F("AREA DE LA PARCELA:", 100, ancho=100), F("733.14 M2", 100, x=290, ancho=40),
              F("AREA CERRADA TOTAL:", 112, ancho=100), F("1668.12 M2", 112, x=290, ancho=40)]
        h = area_lote(ls)
        self.assertEqual((h["valor"], h["estado"]), (733.14, "ok"))
        self.assertEqual(h["fuente"]["bbox"], [100, 100, 330, 110])

    def test_la_celda_de_la_derecha_debe_ser_solo_un_numero_con_unidad(self):
        ls = [F("AREA DE LA PARCELA:", 100, ancho=100), F("VER PLANO 3", 100, x=210, ancho=40), F("733.14 M2", 100, x=290, ancho=40)]
        self.assertEqual(area_lote(ls)["estado"], "no_encontrado")

    def test_recuadro_y_resumen_concuerdan(self):
        ls = [F("DATOS DE LA FINCA", 100), F("FINCA: 078850", 115), F("AREA:733.14M2", 130),
              F("AREA DE LA PARCELA:", 400, ancho=100), F("733.14 M2", 400, x=290, ancho=40)]
        self.assertEqual(area_lote(ls)["valor"], 733.14)

    def test_recuadro_y_resumen_distintos_van_a_revision_con_su_procedencia(self):
        # Casco Antiguo escaneado: el OCR lee «7133.44» en el resumen y «733.14» en el recuadro.
        ls = [F("DATOS DE LA FINCA", 100), F("FINCA: 078850", 115), F("AREA:733.14M2", 130),
              F("AREA DE LA PARCELA:", 400, ancho=100), F("7133.44 M2", 400, x=290, ancho=40)]
        h = area_lote(ls)
        self.assertEqual((h["valor"], h["estado"], h["candidatos"]), (None, "revision", [733.14, 7133.44]))
        self.assertIn("AREA:733.14M2", h["nota"])
        self.assertIn("AREA DE LA PARCELA: 7133.44 M2", h["nota"])

    def test_la_nota_de_procedencia_no_copia_lo_que_precede_al_rotulo(self):
        ls = [F("DATOS DE LA FINCA", 100), F("FINCA: 078850", 115), F("PROPIEDAD DE FULANO, S.A.; AREA: 735.00 M2", 130),
              F("AREA DEL LOTE: 733.14 M2", 400)]
        h = area_lote(ls)
        self.assertEqual(h["candidatos"], [733.14, 735.0])
        self.assertNotIn("FULANO", h["nota"])
        self.assertIn("AREA: 735.00 M2", h["nota"])

    def test_areas_de_cada_finca_no_compiten_con_el_area_del_lote(self):
        # San Francisco: el lote reúne 4 fincas; el bloque da el área de cada una y el resumen la total.
        ls = [F("DATOS DE LAS FINCAS", 100),
              F("FINCA: 071122, COD UB: 8708", 115, x=100), F("FINCA: 081326, COD UB: 8708", 115, x=400),
              F("AREA: 200m2", 130, x=100), F("AREA: 1660m2", 130, x=400),
              F("FINCA: 006806, COD UB: 8708", 160, x=100), F("FINCA 073164, COD UB: 8708", 160, x=400),
              F("AREA: 320m2", 175, x=100), F("AREA: 800m2", 175, x=400),
              F("AREA DEL LOTE TOTAL: 2980m² - 100%", 600, x=900)]
        h = area_lote(ls)
        self.assertEqual((h["valor"], h["estado"]), (2980.0, "ok"))

    def test_areas_de_cada_finca_sin_area_total_van_a_revision(self):
        ls = [F("DATOS DE LAS FINCAS", 100),
              F("FINCA: 071122", 115, x=100), F("FINCA: 081326", 115, x=400),
              F("AREA: 200m2", 130, x=100), F("AREA: 200m2", 130, x=400)]
        h = area_lote(ls)
        self.assertEqual((h["valor"], h["estado"], h["candidatos"]), (None, "revision", [200.0]))
        self.assertIn("071122, 081326", h["nota"])

    def test_area_de_la_finca_distinta_del_area_del_lote_va_a_revision(self):
        ls = [F("DATOS DE LA FINCA", 100), F("FINCA: 078850", 115), F("AREA: 735.00 M2", 130),
              F("AREA DEL LOTE: 733.14 M2", 400)]
        h = area_lote(ls)
        self.assertEqual((h["estado"], h["candidatos"]), ("revision", [733.14, 735.0]))

    def test_minimo_de_la_norma_en_el_recuadro_no_cuenta(self):
        ls = [F("DATOS DEL PROYECTO", 100), F("FINCA: 078850", 115), F("SUPERFICIE MINIMA: 600 M2", 130),
              F("LOTE MINIMO - AREA: 450 M2", 145)]
        h = area_lote(ls)
        self.assertEqual(h["estado"], "no_encontrado")


class TestFincas(unittest.TestCase):
    def test_una_sola_finca(self):
        h = fincas([L("FINCA N° 083076, CÓDIGO DE UBICACIÓN 8708")])
        self.assertEqual((h["valor"], h["estado"]), ("083076", "ok"))

    def test_varias_fincas_colindantes_van_a_revision(self):
        h = fincas([L("FINCA N° 071122, CÓDIGO"), L("FINCA: 071091, TOMO 5"), L("FINCA N065840, CODIGO"), L("FINCA N° 071122")])
        self.assertIsNone(h["valor"])
        self.assertEqual(h["estado"], "revision")
        self.assertEqual(h["candidatos"], ["065840", "071091", "071122"])

    def test_comercio_vecinal_no_es_un_rotulo_de_colindante(self):
        # «ZONIFICACIÓN: RM-H2 + C1 (… COMERCIO VECINAL)» junto a la finca del lote no la vuelve vecina.
        ls = [F("FINCA: 078850; TOMO: 370", 100), F("ZONIFICACION: RM-H2 + C1 (COMERCIO VECINAL)", 110),
              F("FINCA 074093", 300), F("FINCA VECINA", 310)]
        h = fincas(ls)
        self.assertEqual((h["valor"], h["estado"], h["colindantes"]), ("078850", "ok", ["074093"]))


class TestEscalasYCorregimiento(unittest.TestCase):
    def test_escalas(self):
        e = escalas([L("UBICACION REGIONAL - ESCALA 1:5000", pagina=1), L("ESC. 1:100"), L("ESCALA: 1:15"), L("ESC. - ESCALA")])
        self.assertEqual([x["valor"] for x in e], [5000, 100, 15])

    def test_corregimiento_se_normaliza_contra_la_lista_oficial(self):
        h = corregimiento([L("CALLE 50 Y VIA ISRAEL, CORREGIMIENTO DE SAN FRANCISCO")])
        self.assertEqual((h["valor"], h["estado"]), ("San Francisco", "ok"))
        self.assertEqual(corregimiento([L("CORREGIMIENTO DE BELLA VISTA,")])["valor"], "Bella Vista")
        self.assertEqual(corregimiento([L("sin datos")])["estado"], "no_encontrado")


class TestLamina(unittest.TestCase):
    def test_codigo_y_titulo_desde_el_membrete(self):
        # Página de 1000 × 700: el membrete está abajo a la derecha.
        ls = [
            L("A-100 PLANTA ARQUITECTONICA BAJA", bbox=(100, 500, 300, 510)),  # índice de láminas, fuera del membrete
            L("PLANTA ARQUITECTONICA ALTA", bbox=(820, 600, 980, 612)),
            L("A-101", bbox=(900, 650, 960, 680)),
            L("ESCALA 1:100", bbox=(820, 630, 900, 640)),
        ]
        lam = lamina(ls, ancho=1000, alto=700)
        self.assertEqual(lam["codigo"], "A-101")
        self.assertEqual(lam["titulo"], "PLANTA ARQUITECTONICA ALTA")
        self.assertEqual(lam["escala"], 100)


class TestAnexoIV(unittest.TestCase):
    def test_presencia_de_regiones_sin_copiar_datos_personales(self):
        ls = [L("RESUMEN DE AREAS - BYD"), L("UBICACION REGIONAL - ESCALA 1:5000"), L("PROPIETARIO: JUAN PEREZ 0-708-195"), L("FECHA (DD.MM.AN):")]
        r = {x["requisito"]: x for x in requisitos_anexo_iv(ls)}
        self.assertTrue(r["cuadro_de_areas"]["existe"])
        self.assertTrue(r["localizacion_regional"]["existe"])
        self.assertTrue(r["propietario"]["existe"])
        self.assertNotIn("JUAN", str(r["propietario"]))
        self.assertFalse(r["profesional_responsable"]["existe"])
        # La ausencia no es un incumplimiento: confianza moderada, para revisión.
        self.assertLessEqual(r["profesional_responsable"]["confianza"], 0.6)


class TestCasosDeLosAnteproyectos(unittest.TestCase):
    """Redacciones reales de los anteproyectos RLA (Ancón, Bella Vista, Panamá Norte, Tocumen)."""

    def test_area_en_hectareas_mas_metros(self):
        self.assertEqual(area_lote([L("AREA = 0 HAS + 0,500.00 m2")])["valor"], 500.0)
        self.assertEqual(area_lote([L("AREA = 1 HAS + 2,340.50 m2")])["valor"], 12340.5)

    def test_finca_de_ocho_digitos_y_la_del_membrete_manda(self):
        # Página 1000 × 700: la finca del membrete (derecha) es la del proyecto; las demás son colindantes.
        ls = [L("FINCA 0731931", bbox=(300, 100, 400, 110)), L("FINCA 083132673", bbox=(200, 300, 320, 310)),
              L("FINCA: 083132636, CODIGO DE", bbox=(850, 560, 990, 570))]
        h = fincas(ls, ancho=1000, alto=700)
        self.assertEqual((h["valor"], h["estado"]), ("083132636", "ok"))
        self.assertEqual(h["colindantes"], ["0731931", "083132673"])

    def test_corregimiento_partido_en_dos_lineas_o_con_dos_puntos(self):
        partido = [L("CALLE UNO Y CALLE DOS, CORREGIMIENTO", bbox=(0, 0, 10, 10)), L("DE BELLA VISTA, DISTRITO DE PANAMA", bbox=(0, 12, 10, 22))]
        self.assertEqual(corregimiento(partido)["valor"], "Bella Vista")
        sin_de = [L("URBANIZACIÓN PORTA NORTE, CORREGIMIENTO", bbox=(0, 0, 10, 10)), L("ERNESTO CÓRDOBA CAMPOS, DISTRITO DE PANAMÁ,", bbox=(0, 12, 10, 22))]
        self.assertEqual(corregimiento(sin_de)["valor"], "Ernesto Córdoba Campos")
        self.assertEqual(corregimiento([L("CORREGIMIENTO: ANCON")])["valor"], "Ancón")

    def test_zonificacion_declarada_en_el_plano(self):
        for t, v in [("USO DE SUELO 1ZM6", "1ZM6"), ("CÓDIGO DE ZONIFICACIÓN: RE", "RE"), ("ZONIFICACION: R3 (Residencial", "R3")]:
            with self.subTest(t=t):
                h = zonificacion_declarada([L(t)])
                self.assertEqual((h["hecho"], h["valor"], h["estado"]), ("plano.zonificacion_declarada", v, "ok"))
        self.assertEqual(zonificacion_declarada([L("ZONIFICACION ACTUAL:")])["estado"], "no_encontrado")

    def test_zonificacion_con_la_etiqueta_y_el_codigo_en_lineas_distintas(self):
        # Cuadro de áreas donde «ZONIFICACION:» y «RM3-C2» salen en líneas consecutivas.
        h = zonificacion_declarada([L("ZONIFICACION:"), L("RM3-C2")])
        self.assertEqual((h["valor"], h["estado"]), ("RM3-C2", "ok"))
        self.assertEqual(zonificacion_declarada([L("ZONIFICACION"), L("1ZM7")])["valor"], "1ZM7")
        # Lo que sigue no es un código: no se inventa uno (la «N» del norte, una palabra, otra etiqueta).
        for siguiente in ("N", "RESIDENCIAL ALTA", "COMERCIAL"):
            with self.subTest(siguiente=siguiente):
                self.assertEqual(zonificacion_declarada([L("ZONIFICACION:"), L(siguiente)])["estado"], "no_encontrado")

    def test_requisitos_documentales_solo_con_evidencia_positiva(self):
        lineas = [L("FECHA: 12/03/2026"), L("HOJA No. 3 DE 7"), L("ESCALA 1:100"), L("PROPIETARIO: EMPRESA S.A."), L("CEDULA 0-708-195"),
                  L("CORREGIMIENTO DE SAN FRANCISCO"), L("CALLE 50 Y VIA ISRAEL"), L("NORTE MAGNETICO"), L("TINAQUERA"),
                  L("LOCALIZACION REGIONAL 1:5000"), L("IDONEIDAD No. 07081"), L("TENDEDERO")]
        hechos = {h["hecho"]: h for h in requisitos_documentales(lineas)}
        for clave in ("plano.pie_descriptivo.escala", "plano.pie_descriptivo.fecha_presentacion", "plano.pie_descriptivo.numero_y_total_hojas",
                      "plano.pie_descriptivo.propietario_y_cedula", "plano.pie_descriptivo.direccion_completa", "plano.localizacion_regional.escala_1_5000",
                      "plano.localizacion_general.orientacion_magnetica", "plano.listado_disenadores.con_idoneidad", "plano.tinaquera.presente",
                      "plano.tendedero.presente"):
            self.assertIn(clave, hechos)
            self.assertIs(hechos[clave]["valor"], True)
            self.assertAlmostEqual(hechos[clave]["confianza"], 0.89, places=2)   # 0.99 de la línea × 0.9
        # Sin cédula no hay «propietario y cédula»; con OCR la confianza queda bajo el umbral de 0.85.
        self.assertNotIn("plano.pie_descriptivo.propietario_y_cedula", {h["hecho"] for h in requisitos_documentales([L("PROPIETARIO: EMPRESA S.A.")])})
        ocr = requisitos_documentales([L("NORTE MAGNETICO", metodo="ocr", confianza=0.8)])
        self.assertLess(ocr[0]["confianza"], 0.85)

    def test_requisitos_documentales_exigen_evidencia_completa_no_solo_la_etiqueta(self):
        def claves(*textos):
            return {h["hecho"] for h in requisitos_documentales([L(t) for t in textos])}
        # La tinaquera: el rótulo del recinto cuenta; una nota que dice que habrá tinaquera no (ADR-0018).
        self.assertIn("plano.tinaquera.presente", claves("CUARTO DE TINAQUERA"))
        self.assertNotIn("plano.tinaquera.presente", claves("7. EL EDIFICIO CONTARA CON UNA TINAQUERA PROPIA PARA LOS DESECHOS"))
        # El profesional responsable: no basta la etiqueta «DISEÑO ARQ:»; hace falta el sello (idoneidad, licencia, ley).
        self.assertNotIn("plano.pie_descriptivo.profesional_responsable", claves("DISEÑO ARQ:", "PROFESIONAL RESPONSABLE"))
        self.assertIn("plano.pie_descriptivo.profesional_responsable", claves("ARQ. IDONEIDAD No. 07081"))
        # Resumen de áreas abiertas Y cerradas: las dos.
        self.assertNotIn("plano.resumen_areas.abiertas_y_cerradas", claves("CONSTRUCCION CERRADA 1128.57 m2"))
        self.assertIn("plano.resumen_areas.abiertas_y_cerradas", claves("CONSTRUCCION CERRADA 1128.57 m2", "AREA ABIERTA 317.88 m2"))
        # Número de hoja y total: «HOJA 3 DE 7», o las dos cosas por separado; solo el total no alcanza.
        self.assertNotIn("plano.pie_descriptivo.numero_y_total_hojas", claves("TOTAL DE HOJAS: 07"))
        self.assertIn("plano.pie_descriptivo.numero_y_total_hojas", claves("HOJA 3 DE 7"))
        self.assertIn("plano.pie_descriptivo.numero_y_total_hojas", claves("HOJA No. 3", "TOTAL DE HOJAS: 07"))

    def test_requisitos_documentales_nunca_emiten_falso_ni_inventan_por_palabras_sueltas(self):
        # Ausencia o palabra suelta (sin fecha, sin «de»…): no se emite nada, la regla queda para la IA.
        self.assertEqual(requisitos_documentales([L("PLANTA ARQUITECTONICA"), L("FECHA"), L("HOJA"), L("CALLE")]), [])
        # La dirección pide el corregimiento Y la vía: solo uno de los dos no basta.
        self.assertEqual(requisitos_documentales([L("CORREGIMIENTO DE SAN FRANCISCO")]), [])
        self.assertEqual(requisitos_documentales([]), [])

    def test_dos_grafias_del_mismo_codigo_no_son_dos_codigos(self):
        # Dos lecturas del OCR del mismo rótulo: «RM-H2» (segundo lector) y «RMH2» (Tesseract).
        h = zonificacion_declarada([L("ZONIFICACION: RM-H2", confianza=0.75), L("ZONIFICACION: RMH2", confianza=0.79)])
        self.assertEqual((h["valor"], h["estado"]), ("RMH2", "ok"))   # gana la línea de mayor confianza
        h = zonificacion_declarada([L("USO DE SUELO 1ZM7"), L("USO DE SUELO ZM7")])
        self.assertEqual(h["estado"], "ok")
        # Con empate de confianza gana la que se leyó primero.
        h = zonificacion_declarada([L("ZONIFICACION: RM3-C2"), L("ZONIFICACION: RM3C2")])
        self.assertEqual(h["valor"], "RM3-C2")
        # Códigos realmente distintos siguen siendo un conflicto para revisión.
        h = zonificacion_declarada([L("ZONIFICACION: RMH2"), L("ZONIFICACION: RM3-C2")])
        self.assertEqual((h["valor"], h["estado"]), (None, "revision"))
        self.assertEqual(h["candidatos"], ["RM3-C2", "RMH2"])

    def test_escalas_sin_la_palabra_escala_y_sin_confundir_pendientes(self):
        e = escalas([L("1:25000"), L("LOTE #73 - MODELO B 1:200"), L("E. 1:100"), L("RAMPA PENDIENTE 1:10"), L("ESCALA Indicada")])
        self.assertEqual([x["valor"] for x in e], [25000, 200, 100])

    def test_titulo_bajo_el_rotulo_contenido_y_hoja_n_de_total(self):
        ls = [
            L("UBICACION:", bbox=(800, 420, 860, 430)),
            L("CONTENIDO:", bbox=(820, 560, 880, 570)),
            L("PLANTA BAJA", bbox=(820, 575, 900, 585)),
            L("AMPLIACION 1", bbox=(820, 588, 900, 598)),
            L("HOJA 3 DE 8", bbox=(900, 640, 980, 650)),
            L("AR-02", bbox=(900, 655, 990, 690)),
        ]
        lam = lamina(ls, ancho=1000, alto=700)
        self.assertEqual((lam["codigo"], lam["titulo"]), ("AR-02", "PLANTA BAJA · AMPLIACION 1"))
        self.assertEqual((lam["hoja"], lam["total_hojas"]), (3, 8))
        # «DE 8» no es un código de lámina.
        self.assertIsNone(lamina([L("HOJA 1 DE 8", bbox=(900, 640, 980, 650))], ancho=1000, alto=700)["codigo"])

    def test_ningun_dato_personal_en_la_salida(self):
        ls = [L("NOMBRE APELLIDO - CÉDULA N° 0-688-569"), L("PROPIEDAD DE:"), L("EMPRESA EJEMPLO, S.A.")]
        salida = str([area_lote(ls), fincas(ls), corregimiento(ls), zonificacion_declarada(ls), requisitos_anexo_iv(ls), escalas(ls)])
        for dato in ("APELLIDO", "0-688-569", "EMPRESA"):
            self.assertNotIn(dato, salida)


class TestNormaTranscrita(unittest.TestCase):
    """Un cuadro normativo copiado en el plano da límites, no datos del proyecto (riesgo de CUMPLE falso)."""

    def _cuadro(self):
        # Ficha de zona transcrita, en una columna, como en los anteproyectos (texto sintético).
        textos = ["CÓDIGO DE ZONIFICACIÓN: RX", "USOS PERMITIDOS:", "DENSIDAD MÁXIMA: 500 personas/hectáreas",
                  "ÁREA MÍNIMA DE LOTE: 160.00 M2", "OCUPACIÓN MÁXIMA: 60% DEL ÁREA DEL LOTE.",
                  "ÁREA LIBRE MÍNIMA: 40% DEL ÁREA DEL LOTE.", "RETIRO LATERAL MÍNIMO: 1.50 ML.",
                  "RETIRO POSTERIOR: 2.50 ML. DESDE LA LÍNEA DE PROPIEDAD."]
        return [L(t, bbox=(400, 1000 + 10 * i, 650, 1008 + 10 * i)) for i, t in enumerate(textos)]

    def test_limites_con_calificativo_o_en_el_cuadro_son_informativos(self):
        h = {x["hecho"]: x for x in norma_transcrita(self._cuadro())}
        esperado = {"densidad_pers_ha": 500.0, "lote_area_minima_m2": 160.0, "ocupacion_pct": 60.0,
                    "area_libre_pct": 40.0, "retiro_lateral_m": 1.5,
                    # Sin «MÍNIMO», pero dentro del cuadro normativo.
                    "retiro_posterior_m": 2.5}
        for clave, valor in esperado.items():
            with self.subTest(clave=clave):
                x = h[f"plano.norma_transcrita.{clave}"]
                self.assertEqual((x["valor"], x["estado"]), (valor, "informativo"))
        self.assertTrue(all(k.startswith("plano.norma_transcrita.") for k in h))

    def test_el_area_minima_de_lote_no_es_el_area_del_lote(self):
        self.assertEqual(area_lote(self._cuadro())["estado"], "no_encontrado")
        self.assertEqual(area_lote([L("AREA DEL LOTE MINIMA: 600 M2")])["estado"], "no_encontrado")
        self.assertEqual(area_lote([*self._cuadro(), L("AREA DEL LOTE: 450.00 M2", bbox=(50, 50, 200, 58))])["valor"], 450.0)

    def test_codigo_de_zonificacion_en_los_datos_del_proyecto_no_abre_un_cuadro_normativo(self):
        ls = [L("CODIGO DE ZONIFICACION: RX", bbox=(100, 100, 300, 108)), L("AREA DEL LOTE: 500.00 M2", bbox=(100, 110, 300, 118))]
        self.assertEqual(area_lote(ls)["valor"], 500.0)
        self.assertEqual(norma_transcrita(ls), [])


class TestFincaDelProyecto(unittest.TestCase):
    """La finca del proyecto frente a las colindantes rotuladas en el dibujo (números sintéticos)."""

    def test_el_bloque_de_datos_del_proyecto_manda_y_folio_real_es_sinonimo(self):
        ls = [L("FINCA 077777", bbox=(1200, 300, 1300, 320)), L("TOMO 300", bbox=(1200, 322, 1300, 340)),
              L("DATOS DE PROYECTO", bbox=(40, 1460, 450, 1490)),
              L("FOLIO REAL 000000 CODIGO DE UBICACIÓN 8700", bbox=(50, 1500, 520, 1515)),
              L("TOMO 400 FOLIO 200 DOCUMENTO 0708195", bbox=(50, 1515, 470, 1530))]
        finca, lista, _ = fincas_del_lote(ls, dims={1: (2592, 1728)})
        self.assertEqual((finca["hecho"], finca["valor"], finca["estado"]), ("lote.finca", "000000", "ok"))
        self.assertEqual(finca["colindantes"], ["077777"])
        self.assertEqual((lista["hecho"], lista["valor"]), ("lote.fincas", ["000000"]))
        self.assertEqual(fincas(ls)["valor"], "000000")

    def test_las_colindantes_se_descartan(self):
        for aviso in ("COLINDANTE", "COLINDA CON", "LINDERO NORTE", "VECINO", "RESTO LIBRE DE LA"):
            with self.subTest(aviso=aviso):
                ls = [L(aviso, bbox=(100, 88, 200, 98)), L("FINCA 077777", bbox=(100, 100, 200, 110)),
                      L("FINCA N° 000000, CÓDIGO DE UBICACIÓN 8700", bbox=(600, 600, 800, 610))]
                finca, _, _ = fincas_del_lote(ls)
                self.assertEqual((finca["valor"], finca["estado"], finca["colindantes"]), ("000000", "ok", ["077777"]))

    def test_lote_con_varias_fincas_da_la_lista_y_no_una_sola(self):
        ls = [L("DATOS GENERALES", bbox=(1180, 1450, 1370, 1470)), L("DE LAS FINCAS", bbox=(1200, 1480, 1350, 1500)),
              L("FINCA: 073337, COD UB: 8708", bbox=(1145, 1520, 1196, 1532)), L("FINCA: 073330, COD UB: 8708", bbox=(1316, 1520, 1401, 1530)),
              L("TOMO 390, FOLIO 48", bbox=(1160, 1535, 1200, 1545)),
              L("FINCA: 073338, COD UB: 8708", bbox=(1144, 1590, 1229, 1602)), L("FINCA 073331, COD UB: 8708", bbox=(1317, 1590, 1400, 1602)),
              L("FINCA N° 003337, CÓDIGO DE UBICACIÓN 8708, TOMO", bbox=(900, 400, 1100, 410)),
              L("386, FOLIO 212, PROPIEDAD DE:", bbox=(900, 411, 1100, 420))]
        finca, lista, _ = fincas_del_lote(ls)
        self.assertEqual((lista["valor"], lista["estado"]), (["073337", "073330", "073338", "073331"], "ok"))
        self.assertEqual((finca["valor"], finca["estado"]), (None, "revision"))
        self.assertEqual(finca["candidatos"], ["073337", "073330", "073338", "073331"])
        self.assertLessEqual(finca["confianza"], 0.5)
        self.assertEqual(finca["colindantes"], ["003337"])  # «386» es el tomo, no otra finca

    def test_lista_de_fincas_partida_en_dos_lineas(self):
        ls = [L("DATOS DEL PROYECTO:", bbox=(100, 1100, 200, 1110)),
              L("FINCAS 083337, 30002,", bbox=(100, 1120, 300, 1128)), L("083338 Y 30004", bbox=(100, 1129, 300, 1137))]
        self.assertEqual(fincas_del_lote(ls)[1]["valor"], ["083337", "30002", "083338", "30004"])

    def test_varias_candidatas_sin_desempate_van_a_revision(self):
        ls = [L("FINCA 077777", bbox=(100, 100, 200, 110)), L("FINCA 000000", bbox=(600, 600, 700, 610))]
        finca, lista, _ = fincas_del_lote(ls)
        self.assertEqual((finca["valor"], finca["estado"], finca["candidatos"]), (None, "revision", ["000000", "077777"]))
        self.assertEqual((lista["valor"], lista["estado"]), (None, "revision"))


class TestCantidadDeFincas(unittest.TestCase):
    """lote.cantidad_fincas: cuántas fincas tiene el lote, con confianza propia (no la de los dígitos). Texto sintético."""

    @staticmethod
    def cantidad(ls, **kw):
        h = fincas_del_lote(ls, **kw)[2]
        assert h["hecho"] == "lote.cantidad_fincas"
        return h

    def test_un_rotulo_en_el_bloque_es_una_finca_segura_aunque_los_digitos_sean_dudosos(self):
        """Casco Antiguo: «FINCA: 078850» leído «1336:» por OCR (confianza 0.63) en «DATOS DE LA FINCA»."""
        ls = [L("DATOS DE LA FINCA", bbox=(900, 270, 1010, 280), metodo="ocr", confianza=0.9),
              L("FINCA: 07885:", bbox=(961, 284, 1011, 290), metodo="ocr", confianza=0.63),
              L("FINCA: 07501", pagina=2, bbox=(300, 300, 360, 310), metodo="ocr", confianza=0.8)]
        finca, lista, n = fincas_del_lote(ls)
        self.assertEqual((finca["valor"], finca["estado"]), ("07885", "revision"))
        self.assertLess(lista["confianza"], 0.85)
        self.assertEqual((n["valor"], n["estado"], n["confianza"]), (1, "ok", 0.9))
        self.assertIn("no la de los dígitos", n["nota"])

    def test_varias_fincas_del_bloque(self):
        ls = [L("DATOS GENERALES", bbox=(1180, 1450, 1370, 1470)),
              L("FINCA: 073337, COD UB: 8708", bbox=(1145, 1480, 1196, 1492)), L("FINCA: 003930, COD UB: 8708", bbox=(1316, 1480, 1401, 1490)),
              L("FINCA: 083328, COD UB: 8708", bbox=(1144, 1500, 1229, 1512)), L("FINCA 013431, COD UB: 8708", bbox=(1317, 1500, 1400, 1512))]
        n = self.cantidad(ls)
        self.assertEqual((n["valor"], n["estado"], n["confianza"]), (4, "ok", 0.9))

    def test_fincas_madre_del_desarrollo_dan_cantidad_dudosa(self):
        """Panamá Norte: el bloque lista las fincas del desarrollo, que el dibujo rotula «RESTO LIBRE DE LA FINCA»."""
        ls = [L("DATOS DEL PROYECTO:", bbox=(108, 1110, 198, 1119)),
              L("FINCA: 083337, 30002 Y 083338", bbox=(108, 1128, 317, 1136)),
              L("AREA DEL LOTE MODELO B: 177.75 m2", bbox=(108, 1145, 251, 1154)),
              L("RESTO LIBRE DE LA FINCA 083337", bbox=(880, 220, 946, 246)),
              L("RESTO LIBRE DE LA FINCA 083338", bbox=(990, 270, 1077, 301))]
        finca, lista, n = fincas_del_lote(ls)
        self.assertEqual(lista["valor"], ["083337", "30002", "083338"])
        self.assertEqual((n["valor"], n["estado"]), (3, "revision"))
        self.assertLess(n["confianza"], 0.85)
        self.assertIn("083337, 083338", n["nota"])
        self.assertIn("fincas madre", n["nota"])

    def test_rotulo_incompleto_da_cantidad_dudosa(self):
        for texto in ("FINCAS 083337", "FOLIOS REALES 083337", "FINCAS 083337, 30002,"):
            with self.subTest(texto=texto):
                ls = [L("DATOS DEL PROYECTO", bbox=(100, 1100, 200, 1110)), L(texto, bbox=(100, 1120, 300, 1128))]
                n = self.cantidad(ls)
                self.assertEqual(n["estado"], "revision")
                self.assertLess(n["confianza"], 0.85)
        # con la continuación leída en la línea de abajo, la lista está completa
        ls = [L("DATOS DEL PROYECTO:", bbox=(100, 1100, 200, 1110)),
              L("FINCAS 083337, 30002,", bbox=(100, 1120, 300, 1128)), L("083338 Y 30004", bbox=(100, 1129, 300, 1137))]
        self.assertEqual((self.cantidad(ls)["valor"], self.cantidad(ls)["estado"]), (4, "ok"))

    def test_dos_numeros_que_pueden_ser_la_misma_finca(self):
        ls = [L("DATOS DEL PROYECTO", bbox=(100, 1100, 200, 1110), metodo="ocr", confianza=0.9),
              L("FINCA: 078850", bbox=(100, 1120, 300, 1128), metodo="ocr", confianza=0.7),
              L("FINCA: 07885", bbox=(100, 1130, 300, 1138), metodo="ocr", confianza=0.6)]
        n = self.cantidad(ls)
        self.assertEqual((n["valor"], n["estado"]), (2, "revision"))
        self.assertIn("mal leída", n["nota"])

    def test_rotulo_casi_ilegible_no_llega_al_umbral(self):
        ls = [L("DATOS DEL PROYECTO", bbox=(100, 1100, 200, 1110), metodo="ocr", confianza=0.9),
              L("FINCA: 078850", bbox=(100, 1120, 300, 1128), metodo="ocr", confianza=0.3)]
        n = self.cantidad(ls)
        self.assertEqual(n["valor"], 1)
        self.assertLess(n["confianza"], 0.85)

    def test_sin_bloque_una_sola_finca_no_colindante(self):
        """Ancón: la misma finca en el membrete de cada hoja y ninguna otra sin marca de colindante."""
        ls = [L("FINCA: 083132636, CODIGO DE UBICACION 8720", pagina=p, bbox=(2340, 1383, 2535, 1394), metodo="ocr",
                confianza=0.96) for p in (1, 2, 3, 4)]
        ls.append(L("COLINDANTE", bbox=(100, 88, 200, 98)))
        ls.append(L("FINCA 0731931", bbox=(100, 100, 200, 110)))
        finca, _, n = fincas_del_lote(ls)
        self.assertEqual(finca["valor"], "083132636")
        self.assertEqual((n["valor"], n["estado"], n["confianza"]), (1, "ok", 0.85))

    def test_sin_bloque_otras_fincas_sin_marca_bajan_la_cantidad(self):
        ls = [L("FINCA 000000", bbox=(2300, 1500, 2500, 1510)), L("FINCA 077777", bbox=(100, 100, 200, 110))]
        finca, _, n = fincas_del_lote(ls, dims={1: (2592, 1728)})
        self.assertEqual(finca["valor"], "000000")   # manda la del membrete
        self.assertEqual((n["valor"], n["estado"]), (1, "revision"))
        self.assertLess(n["confianza"], 0.85)
        self.assertIn("077777", n["nota"])

    def test_sin_desempate_ni_rotulos_no_hay_cantidad(self):
        n = self.cantidad([L("FINCA 077777", bbox=(100, 100, 200, 110)), L("FINCA 000000", bbox=(600, 600, 700, 610))])
        self.assertEqual((n["valor"], n["estado"], n["candidatos"]), (None, "revision", ["000000", "077777"]))
        self.assertEqual(self.cantidad([L("PLANTA BAJA")])["estado"], "no_encontrado")
        solo_colindantes = [L("COLINDANTE", bbox=(100, 88, 200, 98)), L("FINCA 077777", bbox=(100, 100, 200, 110))]
        self.assertEqual(self.cantidad(solo_colindantes)["estado"], "no_encontrado")


class TestProfesionalResponsable(unittest.TestCase):
    """Sello del profesional (Ley 15 de 1959): presencia y dónde, nunca el nombre ni el número (texto sintético)."""

    def _prof(self, lineas):
        return {x["requisito"]: x for x in requisitos_anexo_iv(lineas)}["profesional_responsable"]

    def test_sello_por_texto_aun_con_errores_de_ocr(self):
        for t in ("IDONEIDAD N° 03333-333-333", "LICENCIA N°. 0000-000-000", "Ley 15 del 26 de Enero de 1959",
                  "Ley 13 del 26 de Enero de 1959", "Ley 15 00126 de enero de 1999", "JTIA",
                  "Junta Técnica de Ingeniería y Arquitectura", "Tunta Técnica de Ingeniería", "ría y Arquitectura"):
            with self.subTest(t=t):
                r = self._prof([L(t, metodo="ocr", confianza=0.9)])
                self.assertTrue(r["existe"])
                self.assertGreater(r["confianza"], 0.6)
                self.assertEqual(set(r), {"requisito", "existe", "confianza", "fuente"})

    def test_titulo_abreviado_es_indicio_de_confianza_baja(self):
        for t in ("Arq. Nombre Apellido", "ING. N. APELLIDO"):
            with self.subTest(t=t):
                r = self._prof([L(t)])
                self.assertTrue(r["existe"])
                self.assertLessEqual(r["confianza"], 0.6)
                self.assertNotIn("Apellido".upper(), str(r).upper())

    def test_sin_sello_no_existe_y_no_se_confunde(self):
        for t in ("ARQUITECTOS & ASOCIADOS", "LAS ESPECIFICACIONES DEL ARQUITECTO", "ARQUITECTURA", "LICENCIA DE CONSTRUCCION"):
            with self.subTest(t=t):
                self.assertFalse(self._prof([L(t)])["existe"])

    def test_se_cita_la_lectura_mas_clara(self):
        r = self._prof([L("IDONEIDAD N*03333", pagina=1, confianza=0.6), L("IDONEIDAD N° 03333", pagina=2, confianza=0.95)])
        self.assertEqual(r["fuente"]["pagina"], 2)


if __name__ == "__main__":
    unittest.main()
