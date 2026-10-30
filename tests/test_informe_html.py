"""T8 — documento autocontenido, forma estructurada y extracción del modelo (AC-11, ADR-0002)."""
import json
import re
import unittest

from precheck.informe import html as ht
from precheck.informe import huella as hu
from precheck.informe.modelo import Encabezado, proyectar
from tests.apoyo_informe import Bitacora, estado_reglas, resultado

EXP = "EXP-TEST-0800"
ATAQUE = "<script>alert(1)</script></script><!-- & \"'"


def modelo(version="profesional", **cambios):
    """Modelo con la forma de `proyectar`, más una clave desconocida (el render no debe romperse)."""
    base = {
        "version": version,
        "formato_informe": "1.0.0",
        "expediente": EXP,
        "evaluacion": {"seq": 3, "hash": "abc123", "fecha_presentacion": "2025-06-01",
                       "norma_aplicable": "PLOT-A61-2021", "zona": {"ceus": None, "documento_grafico": "1ZM6",
                                                                    "usada": "1ZM6"}},
        "encabezado": {"tramite": "RDP", "proyecto": "Edificio Pérez", "finca": "no consta",
                       "profesional": "Juan Pérez", "idoneidad": "no consta"},
        "estado": {"estado": "revisado", "faltantes": {"decisiones": [], "visto_bueno": False}},
        "aviso_no_vigente": None,
        "observaciones": [{"regla_id": "PLOT-ZM6-LOTE-FRENTE", "resultado": "NO_CUMPLE",
                           "que_hacer": "Ajuste el frente del lote."}],
        "resultados": [
            {"regla_id": "PLOT-ZM6-LOTE-FRENTE", "resultado": "NO_CUMPLE", "oficial": "oficial"},
            {"regla_id": "PLOT-ZM6-DENSIDAD", "resultado": "CUMPLE", "oficial": "oficial"},
            {"regla_id": "PLOT-ZM6-ALTURA", "resultado": "REQUIERE_REVISION", "oficial": "no oficial",
             "indicativo": "NO_CUMPLE (no oficial)"},
        ],
        "cumplimientos": [],
        "alcance": {},
        "cobertura": {"normas_evaluadas": {"PLOT": 3}, "normas_sin_reglas": ["MIVIOT"]},
        "normas_consultadas": [{"norma": "Acuerdo Municipal N°110 de 2025", "vigencia": "desde 2025-05-05"}],
        "version_motor": "1.0.0",
        "nota_preliminar": ["Este informe es una verificación preliminar automatizada con revisión humana.",
                            "La vigencia de este informe se verifica con la DOYC."],
        "clave_nueva_de_t6": {"lo_que_sea": [1, 2, {"x": None, "y": True}]},
    }
    base.update(cambios)
    return base


TRAZ = {"emitido_por": "P-0004", "nombre": "Ana Revisora", "emitido_en": "2026-09-27T12:00:00Z"}


class TestRender(unittest.TestCase):
    def test_determinista_mismo_modelo_mismos_bytes(self):
        m = modelo()
        self.assertEqual(ht.render(m, trazabilidad=TRAZ), ht.render(json.loads(json.dumps(m)), trazabilidad=TRAZ))

    def test_orden_de_claves_no_cambia_el_documento(self):
        m = modelo()
        invertido = dict(reversed(list(m.items())))
        self.assertEqual(ht.render(invertido), ht.render(m))

    def test_titulo_y_primera_pagina(self):
        doc = ht.render(modelo())
        self.assertIn("<title>Informe PreCheck — verificación preliminar</title>", doc)
        visible = ht.texto_visible(doc)
        self.assertLess(visible.index("verificación preliminar automatizada"), visible.index("Ajuste el frente"))
        self.assertIn("no consta", visible)
        self.assertIn("Acuerdo Municipal N°110 de 2025", visible)
        self.assertIn("1.0.0", visible)

    def test_normas_consultadas_en_la_primera_pagina_antes_de_observaciones_y_resultados(self):
        # AC-11 (M1): en las dos versiones, con su vigencia, antes de cualquier observación o resultado
        for version in ("profesional", "revisor"):
            with self.subTest(version=version):
                visible = ht.texto_visible(ht.render(modelo(version)))
                normas = visible.index("Normas consultadas")
                self.assertLess(visible.index("Datos del expediente"), normas)
                self.assertLess(normas, visible.index("desde 2025-05-05"))
                for despues in ("Estado de la revisión", "Observaciones", "Resultados", "Alcance"):
                    self.assertLess(visible.index("desde 2025-05-05"), visible.index(despues), despues)
                self.assertEqual(visible.count("Normas consultadas"), 1)

    def test_marca_de_contenido_regenerado(self):
        # M3: el regenerado se rotula y el pie lleva el código que se le da, no uno recalculado
        m = modelo()
        doc = ht.render(m, "ab" * 32, regenerado=True)
        visible = ht.texto_visible(doc)
        self.assertLess(visible.index(ht.MARCA_REGENERADO), visible.index("Carácter preliminar"))
        pie = re.search(r'<footer class="pie">(.*?)</footer>', doc, re.S).group(1)
        self.assertIn(hu.codigo("ab" * 32), pie)
        self.assertIn(ht.MARCA_REGENERADO, pie)
        self.assertNotIn(ht.MARCA_REGENERADO, ht.render(m))

    def test_autocontenido_sin_scripts_ejecutables_ni_referencias_externas(self):
        doc = ht.render(modelo(), trazabilidad=TRAZ)
        self.assertIsNone(re.search(r"\b(src|href)\s*=", doc, re.I))
        self.assertNotIn("url(", doc)
        self.assertNotIn("@import", doc)
        scripts = re.findall(r"<script\b[^>]*>", doc, re.I)
        self.assertEqual(scripts, ['<script type="application/json" id="precheck-informe-modelo">'])
        self.assertNotRegex(doc, r"\son[a-z]+\s*=")

    def test_css_de_impresion_carta_y_encabezado_de_tabla_repetido(self):
        doc = ht.render(modelo())
        self.assertIn("@page", doc)
        self.assertIn("letter", doc)
        self.assertIn("table-header-group", doc)
        self.assertIn("<thead>", doc)

    def test_escapa_texto_con_contenido_activo_en_cualquier_campo(self):
        m = modelo(observaciones=[{"regla_id": "X", "resultado": "NO_CUMPLE", "que_hacer": ATAQUE}],
                   encabezado=dict(modelo()["encabezado"], proyecto=ATAQUE), **{ATAQUE: ATAQUE})
        doc = ht.render(m, trazabilidad={"nombre": ATAQUE})
        self.assertEqual(len(re.findall(r"<script\b", doc)), 1)
        self.assertEqual(doc.count("</script>"), 1)
        self.assertNotIn("<!--", doc)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", doc)
        self.assertIn("<script>alert(1)</script>", ht.texto_visible(doc))
        self.assertEqual(ht.extraer(doc), (m, {"nombre": ATAQUE}))

    def test_estados_siempre_en_texto(self):
        visible = ht.texto_visible(ht.render(modelo()))
        for texto in ("Cumple", "No cumple", "Requiere revisión", "no oficial"):
            self.assertIn(texto, visible)

    def test_pie_con_codigo_y_expediente(self):
        m = modelo()
        doc = ht.render(m)
        pie = re.search(r'<footer class="pie">(.*?)</footer>', doc, re.S)
        self.assertIsNotNone(pie)
        self.assertIn(hu.codigo(hu.huella(m)), pie.group(1))
        self.assertIn(EXP, pie.group(1))
        self.assertRegex(doc, r"\.pie\s*\{[^}]*position:\s*fixed")

    def test_huella_explicita_se_imprime(self):
        doc = ht.render(modelo(), "f" * 64)
        self.assertIn(hu.codigo("f" * 64), ht.texto_visible(doc))

    def test_uso_interno_solo_en_version_del_revisor(self):
        revisor = ht.texto_visible(ht.render(modelo("revisor")))
        profesional = ht.texto_visible(ht.render(modelo("profesional")))
        self.assertIn("uso interno", revisor.lower())
        self.assertNotIn("uso interno", profesional.lower())
        self.assertRegex(ht.render(modelo("revisor")), r'<header class="uso-interno">')
        self.assertNotIn('class="uso-interno"', ht.render(modelo("profesional")))


class TestTrazabilidad(unittest.TestCase):
    def test_se_imprime_pero_no_cambia_texto_visible_ni_huella(self):
        m = modelo()
        con = ht.render(m, trazabilidad=TRAZ)
        otra = ht.render(m, trazabilidad={"emitido_por": "P-0009", "nombre": "Otro", "emitido_en": "2027-01-01"})
        sin = ht.render(m)
        self.assertIn("Ana Revisora", con)
        self.assertIn('data-precheck-trazabilidad', con)
        self.assertNotIn("Ana Revisora", ht.texto_visible(con))
        self.assertEqual(ht.texto_visible(con), ht.texto_visible(otra))
        self.assertEqual(ht.texto_visible(con), ht.texto_visible(sin))
        self.assertEqual(hu.huella(ht.extraer(con)[0]), hu.huella(ht.extraer(otra)[0]))

    def test_texto_visible_detecta_edicion_del_texto(self):
        m = modelo()
        doc = ht.render(m)
        editado = doc.replace("Ajuste el frente del lote.", "Todo cumple.")
        self.assertNotEqual(ht.texto_visible(editado), ht.texto_visible(ht.render(ht.extraer(editado)[0])))
        self.assertEqual(ht.texto_visible(doc), ht.texto_visible(ht.render(ht.extraer(doc)[0])))


class TestExtraer(unittest.TestCase):
    def test_ida_y_vuelta_documento(self):
        m = modelo()
        extraido, traz = ht.extraer(ht.render(m, trazabilidad=TRAZ))
        self.assertEqual(extraido, m)
        self.assertEqual(traz, TRAZ)
        self.assertEqual(hu.huella(extraido), hu.huella(m))

    def test_acepta_bytes(self):
        m = modelo()
        self.assertEqual(ht.extraer(ht.render(m).encode("utf-8")), (m, None))

    def test_ida_y_vuelta_forma_estructurada_misma_huella(self):
        m = modelo()
        est = ht.estructurada(m, TRAZ)
        self.assertIsInstance(json.loads(est), dict)
        self.assertEqual(est, ht.estructurada(dict(reversed(list(m.items()))), TRAZ))
        extraido, traz = ht.extraer(est)
        self.assertEqual(extraido, m)
        self.assertEqual(traz, TRAZ)
        self.assertEqual(hu.huella(extraido), hu.huella(ht.extraer(ht.render(m))[0]))

    def test_no_original_devuelve_none(self):
        for contenido in ("<html><body><p>Informe</p></body></html>", "", "{}", '{"modelo": 1}', "[1, 2]",
                          '<script type="application/json" id="precheck-informe-modelo">no json</script>',
                          b"\xff\xfe", "texto cualquiera"):
            with self.subTest(contenido=contenido):
                self.assertIsNone(ht.extraer(contenido))

    def test_modelo_real_del_revisor(self):
        b = Bitacora(EXP)
        res = [resultado("PLOT-ZM6-LOTE-FRENTE", "NO_CUMPLE"), resultado("PLOT-ZM6-DENSIDAD", "CUMPLE")]
        ev = b.evaluar(res, normas_sin_reglas=["MIVIOT"])
        m = proyectar(b.eventos, estado_reglas(res), ev, "revisor", Encabezado(tramite="RDP"))
        doc = ht.render(m, trazabilidad=TRAZ)
        self.assertEqual(ht.extraer(doc), (json.loads(json.dumps(m)), TRAZ))
        self.assertIn("uso interno", ht.texto_visible(doc).lower())


if __name__ == "__main__":
    unittest.main()
