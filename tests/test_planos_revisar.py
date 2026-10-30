"""Revisión preliminar de un plano (precheck/planos/revisar.py): extracción → hechos → reglas."""
import json
import pathlib
import tempfile
import unittest

from precheck.planos.revisar import a_hechos, cantidad_coherente, cargar_reglas, combinar, evaluar, resumen_md, revisar

RAIZ = pathlib.Path(__file__).resolve().parent.parent

EXTRACCION = {
    "documento": "A-101.pdf",
    "hechos": [
        {"hecho": "lote.area_m2", "valor": 1200.0, "confianza": 0.95, "estado": "ok", "fuente": {"pagina": 1}},
        {"hecho": "lote.frente_m", "valor": 15.0, "confianza": 0.9, "estado": "revision", "fuente": {"pagina": 1}},
        {"hecho": "lote.finca", "valor": None, "confianza": 0.0, "estado": "no_encontrado", "fuente": None},
    ],
    "requisitos_anexo_iv": [{"requisito": "escala", "existe": True, "confianza": 0.8, "fuente": {"pagina": 1}}],
}


def lote(norma, zona, **proyecto):
    h = {"lote": {"norma_aplicable": {"valor": norma, "confianza": 0.95},
                  "codigo_zona": {"valor": zona, "confianza": 0.95}}}
    if proyecto:
        h["proyecto"] = {k: {"valor": v, "confianza": 0.95} for k, v in proyecto.items()}
    return h


class TestHechos(unittest.TestCase):
    def test_arbol_con_procedencia(self):
        h = a_hechos(EXTRACCION)
        self.assertEqual(h["lote"]["area_m2"]["valor"], 1200.0)
        self.assertEqual(h["lote"]["area_m2"]["fuente"]["documento"], "A-101.pdf")
        self.assertTrue(h["plano"]["anexo_iv"]["escala"]["valor"])

    def test_descripcion_del_trabajo_del_extractor_no_llega_al_umbral(self):
        # «PROYECTO: <nombre>» no basta para el criterio: decide la IA (tanda 2, Panamá Norte).
        ext = {**EXTRACCION, "requisitos_documentales": [
            {"hecho": "plano.pie_descriptivo.descripcion_trabajo", "valor": True, "confianza": 0.89, "fuente": {}},
            {"hecho": "plano.pie_descriptivo.fecha_presentacion", "valor": True, "confianza": 0.89, "fuente": {}}]}
        h = a_hechos(ext)["plano"]["pie_descriptivo"]
        self.assertLess(h["descripcion_trabajo"]["confianza"], 0.85)
        self.assertEqual(h["fecha_presentacion"]["confianza"], 0.89)

    def test_sin_valor_no_se_copia(self):
        self.assertNotIn("finca", a_hechos(EXTRACCION)["lote"])

    def test_estado_revision_nunca_alcanza_el_umbral(self):
        self.assertLessEqual(a_hechos(EXTRACCION)["lote"]["frente_m"]["confianza"], 0.5)

    def test_complemento_gana_y_reemplaza_el_hecho_entero(self):
        h = combinar(a_hechos(EXTRACCION), {"lote": {"frente_m": {"valor": 16.0, "confianza": 0.9}}})
        self.assertEqual(h["lote"]["frente_m"], {"valor": 16.0, "confianza": 0.9})
        self.assertEqual(h["lote"]["area_m2"]["valor"], 1200.0)


class TestEvaluar(unittest.TestCase):
    def test_plot_zm6_frente_no_cumple(self):
        h = combinar(a_hechos(EXTRACCION), lote("PLOT-A61-2021", "1ZM6"))
        h["lote"]["frente_m"] = {"valor": 15.0, "confianza": 0.95}
        res = evaluar(h, cargar_reglas(), "2026-09-01")
        frente = next(r for r in res["resultados"] if r["regla_id"] == "PLOT-ZM6-LOTE-FRENTE")
        self.assertEqual(frente["resultado"], "NO_CUMPLE")
        self.assertFalse(res["oficial"])
        self.assertEqual(res["resultados"][0]["resultado"], "NO_CUMPLE")   # ordenados por gravedad

    def test_sin_norma_avisa(self):
        res = evaluar(a_hechos(EXTRACCION), cargar_reglas(), "2026-09-01")
        self.assertTrue(any("norma_aplicable" in a for a in res["avisos"]))

    def test_norma_desconocida_avisa(self):
        res = evaluar(lote("INVENTADA", "X"), cargar_reglas(), "2026-09-01")
        self.assertTrue(any("no está registrada" in a for a in res["avisos"]))

    def test_codigo_inexistente_en_la_norma_avisa_aunque_tenga_confianza_alta(self):
        # ADR-0016: con zona de trabajo supuesta, el aviso ZONA_TRABAJO dice que R3 no existe y pide la CEUS (sin repetirlo).
        res = evaluar(lote("MIVIOT-AC-R160-2002", "R3"), cargar_reglas(), "2026-09-01")
        self.assertTrue(any("R3" in a and "no existe en MIVIOT-AC-R160-2002" in a and "CEUS" in a
                            for a in res["avisos"]), res["avisos"])
        self.assertFalse(any("se necesita la CEUS" in a for a in res["avisos"]), res["avisos"])

    def test_sin_zona_de_trabajo_el_codigo_inexistente_pide_la_ceus(self):
        res = evaluar(lote("PLOT-A61-2021+A270-2025", "RM3-C2"), cargar_reglas(), "2026-09-01")
        self.assertIsNone(res["zona_trabajo"]["codigo"])
        self.assertTrue(any("'RM3-C2' no existe en la norma" in a and "se necesita la CEUS" in a for a in res["avisos"]), res["avisos"])

    def test_codigo_con_prefijo_de_clase_no_avisa(self):
        res = evaluar(lote("PLOT-A61-2021", "1ZM6"), cargar_reglas(), "2026-09-01")
        self.assertFalse(any("no existe" in a or "no lo reconoce" in a for a in res["avisos"]), res["avisos"])

    def test_codigo_dudoso_es_una_zona_de_trabajo_supuesta(self):
        # Antes (ADR-0012) se agrupaban las reglas de otras zonas sin decidir; ahora (ADR-0016) se evalúa con el código
        # declarado como supuesto: las reglas de otras zonas son NO_APLICA y las de MP-C2 quedan para la IA con la
        # decisión del motor.
        h = lote("MIVIOT-ML2", "MP-C2")
        h["lote"]["codigo_zona"]["confianza"] = 0.6
        res = evaluar(h, cargar_reglas(), "2026-09-01")
        self.assertEqual(res["agrupadas"], {})
        self.assertEqual((res["zona_trabajo"]["codigo"], res["zona_trabajo"]["firme"]), ("MP-C2", False))
        self.assertFalse(any(r["regla_id"].startswith("ML2-RE-") for r in res["resultados"]))
        c2 = [r for r in res["resultados"] if r["regla_id"].startswith("ML2-C2-")]
        self.assertTrue(c2)
        self.assertTrue(all(r["resultado"] == "REQUIERE_REVISION" and "S1" in r["decision_motor"]["con_supuesto"] for r in c2))
        self.assertNotIn("REQUIERE_REVISION", res["final"]["por_decision"])
        md = resumen_md(res, "A-101.pdf")
        self.assertIn("Zona de trabajo: MP-C2 (supuesto S1)", md)
        self.assertIn("`ML2-C2-USOS`", md)

    def test_san_francisco_sin_unidad_territorial_es_informacion_requerida(self):
        # Sector y código dudosos, sin unidad territorial (caso sintético).
        h = lote("PLOT-A61-2021+A270-2025", "1ZM7")
        h["lote"]["codigo_zona"]["confianza"] = 0.7
        h["lote"]["sf_sector"] = {"valor": "San Francisco Centro", "confianza": 0.75}
        res = evaluar(h, cargar_reglas(), "2026-09-01")
        centro = [r for r in res["resultados"] if r["regla_id"].startswith("SF-SAN-FRANCISCO-CENTRO-")]
        self.assertTrue(centro)
        # Las reglas de la zona de trabajo dependen de la unidad territorial, que no está: se pide con la CEUS.
        self.assertTrue(all(r["decision_motor"]["resultado"] == "INFORMACION_REQUERIDA" for r in centro), centro[0])
        self.assertNotIn("REQUIERE_REVISION", res["final"]["por_decision"])

    def test_codigo_confiable_no_agrupa(self):
        res = evaluar(lote("MIVIOT-ML2", "MP-C2"), cargar_reglas(), "2026-09-01")
        self.assertEqual(res["agrupadas"], {})
        self.assertTrue(res["zona_trabajo"]["firme"])
        self.assertFalse(any(r["regla_id"].startswith("ML2-RE-") for r in res["resultados"]))

    def test_revisar_escribe_los_tres_archivos(self):
        with tempfile.TemporaryDirectory() as d:
            ext, lt = pathlib.Path(d, "e.json"), pathlib.Path(d, "l.json")
            ext.write_text(json.dumps(EXTRACCION), encoding="utf-8")
            lt.write_text(json.dumps(lote("PLOT-A61-2021", "1ZM6")), encoding="utf-8")
            revisar(None, str(ext), str(lt), d, "2026-09-01")
            for nombre in ("hechos.json", "resultado.json", "resumen.md"):
                self.assertTrue(pathlib.Path(d, nombre).exists(), nombre)
            self.assertIn("indicativo", pathlib.Path(d, "resumen.md").read_text(encoding="utf-8"))


class TestCantidadDeFincas(unittest.TestCase):
    """lote.cantidad_fincas de la extracción frente a las fincas que lote.json trae leídas a mano."""

    EXT = {"documento": "A-101.pdf", "hechos": [
        {"hecho": "lote.finca", "valor": "07885", "confianza": 0.57, "estado": "revision", "fuente": {"pagina": 1}},
        {"hecho": "lote.fincas", "valor": ["1336"], "confianza": 0.57, "estado": "revision", "fuente": {"pagina": 1}},
        {"hecho": "lote.cantidad_fincas", "valor": 1, "confianza": 0.9, "estado": "ok", "fuente": {"pagina": 1}}]}

    def _revisar(self, complemento):
        with tempfile.TemporaryDirectory() as d:
            ext, lt = pathlib.Path(d, "e.json"), pathlib.Path(d, "l.json")
            ext.write_text(json.dumps(self.EXT), encoding="utf-8")
            lt.write_text(json.dumps({"tramite": "RLA", **complemento}), encoding="utf-8")
            res = revisar(None, str(ext), str(lt), d, "2026-09-01")
            hechos = json.loads(pathlib.Path(d, "hechos.json").read_text(encoding="utf-8"))
        por_id = {r["regla_id"]: r for r in res["resultados"]}
        return hechos, por_id

    def test_misma_cantidad_conserva_la_confianza_de_la_extraccion(self):
        """Casco Antiguo: el agente corrige los dígitos (0.80) y la cantidad de la extracción (0.90) se conserva."""
        fincas = {"finca": {"valor": "078850", "confianza": 0.8}, "fincas": {"valor": ["078850"], "confianza": 0.8}}
        hechos, por_id = self._revisar({"lote": fincas})
        self.assertEqual(hechos["lote"]["cantidad_fincas"]["confianza"], 0.9)
        self.assertNotIn("A110-AIV-FINCAS-COINCIDEN", por_id)          # NO_APLICA
        self.assertEqual(por_id["A110-AIV-FINCA-COINCIDE"]["resultado"], "REQUIERE_REVISION")

    def test_otra_cantidad_en_lote_json_reemplaza_la_de_la_extraccion(self):
        fincas = {"fincas": {"valor": ["071091", "071122"], "confianza": 0.9}}
        hechos, por_id = self._revisar({"lote": fincas})
        self.assertEqual((hechos["lote"]["cantidad_fincas"]["valor"], hechos["lote"]["cantidad_fincas"]["confianza"]), (2, 0.9))
        self.assertEqual(por_id["A110-AIV-FINCAS-COINCIDEN"]["resultado"], "REQUIERE_REVISION")
        self.assertNotIn("A110-AIV-FINCA-COINCIDE", por_id)

    def test_la_cantidad_de_lote_json_gana(self):
        complemento = {"lote": {"fincas": {"valor": ["083337", "30002"], "confianza": 0.89},
                                "cantidad_fincas": {"valor": 2, "confianza": 0.6}}}
        hechos, por_id = self._revisar(complemento)
        self.assertEqual(hechos["lote"]["cantidad_fincas"]["confianza"], 0.6)
        self.assertEqual(por_id["A110-AIV-FINCA-COINCIDE"]["resultado"], "REQUIERE_REVISION")
        self.assertIn("no se puede determinar si aplica", por_id["A110-AIV-FINCA-COINCIDE"]["motivo"])

    def test_sin_fincas_en_lote_json_no_toca_la_cantidad(self):
        hechos = cantidad_coherente({"lote": {"cantidad_fincas": {"valor": 1, "confianza": 0.9}}}, {"lote": {}})
        self.assertEqual(hechos["lote"]["cantidad_fincas"]["valor"], 1)
        # solo lote.finca, con la misma cantidad: se conserva la de la extracción
        hechos = cantidad_coherente({"lote": {"cantidad_fincas": {"valor": 1, "confianza": 0.9}}},
                                    {"lote": {"finca": {"valor": "076524", "confianza": 0.8}}})
        self.assertEqual(hechos["lote"]["cantidad_fincas"]["confianza"], 0.9)


class TestZonaUsuarioContraPlano(unittest.TestCase):
    """El código de zona del usuario no se da por cierto si el plano declara otro (ADR-0016: zona de trabajo)."""

    def hechos(self, usuario, plano, metodo="declarado", norma="PLOT-A61-2021+A270-2025"):
        h = {"lote": {"norma_aplicable": {"valor": norma, "confianza": 1},
                      "codigo_zona": {"valor": usuario, "confianza": 1, "fuente": {"metodo": metodo, "detalle": "indicado por el usuario"}}}}
        if plano:
            h["plano"] = {"zonificacion_declarada": {"valor": plano, "confianza": 0.8, "fuente": {"pagina": 1}}}
        return h

    def test_si_difieren_la_zona_es_un_supuesto_y_avisa(self):
        res = evaluar(self.hechos("1ZM7", "RM3-C2"), cargar_reglas(), "2026-09-01")
        zt = res["zona_trabajo"]
        self.assertEqual((zt["codigo"], zt["procedencia"], zt["firme"], zt["supuesto"]), ("1ZM7", "usuario", False, "S1"))
        self.assertTrue(any(a.startswith("ZONA_DISCREPANTE") and "RM3-C2" in a and "S1" in a for a in res["avisos"]), res["avisos"])

    def test_si_coinciden_la_zona_es_firme_aunque_cambie_la_grafia(self):
        for usuario, plano in [("1ZM6", "ZM6"), ("ZM6", "1ZM6")]:
            with self.subTest(usuario=usuario):
                res = evaluar(self.hechos(usuario, plano, norma="PLOT-A61-2021"), cargar_reglas(), "2026-09-01")
                self.assertTrue(res["zona_trabajo"]["firme"])
                self.assertFalse([s for s in res["supuestos"] if s["tipo"] == "zona"])

    def test_si_solo_la_declara_el_plano_con_confianza_baja_es_un_supuesto(self):
        h = self.hechos("X", "1ZM6", norma="PLOT-A61-2021")
        del h["lote"]["codigo_zona"]
        res = evaluar(h, cargar_reglas(), "2026-09-01")
        self.assertEqual((res["zona_trabajo"]["codigo"], res["zona_trabajo"]["procedencia"]), ("1ZM6", "plano"))
        self.assertFalse(res["zona_trabajo"]["firme"])   # 0.8 < 0.85 y nadie más lo confirma

    def test_no_modifica_los_hechos_de_entrada(self):
        h = self.hechos("1ZM7", "RM3-C2")
        evaluar(h, cargar_reglas(), "2026-09-01")
        self.assertEqual(h["lote"]["codigo_zona"], {"valor": "1ZM7", "confianza": 1, "fuente": {"metodo": "declarado", "detalle": "indicado por el usuario"}})


if __name__ == "__main__":
    unittest.main()
