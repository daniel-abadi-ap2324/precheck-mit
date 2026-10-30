"""Pruebas de scripts/auditar_catalogo.py: alcance de anteproyecto y banderas, con un catálogo sintético."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("auditar_catalogo", RAIZ / "scripts" / "auditar_catalogo.py")
ac = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ac)

NORMA = "Acuerdo N°110 de 22-04-2025"
TEXTO = "El retiro posterior mínimo será de tres metros con cincuenta centímetros en todo el lote.\nOtra línea: 50% de ocupación."


def regla(id_, **kw):
    base = {"id": id_, "version": 1, "titulo": "t", "tipo": "cuantitativa", "severidad": "bloqueante",
            "mensaje_no_cumple": "m", "vigencia": {"desde": "2025-05-05", "hasta": None}, "estado_revision": "borrador",
            "aplica_si": "lote.codigo_zona == 'R1'", "entradas": ["proyecto.retiro_posterior_m"],
            "condicion": "proyecto.retiro_posterior_m >= 3.5",
            "fuente": {"norma": NORMA, "articulo": "Art. 1", "pagina_pdf": 1,
                       "cita_textual": "El retiro posterior mínimo será de tres metros con cincuenta centímetros"}}
    base.update(kw)
    return base


class TestAlcance(unittest.TestCase):
    def test_sin_tramite_o_con_rla_entra(self):
        self.assertTrue(ac.alcance(regla("A"))[0])
        self.assertTrue(ac.alcance(regla("A", aplica_si="tramite in ['RLA', 'RDP'] and x == 1"))[0])
        self.assertTrue(ac.alcance(regla("A", aplica_si="tramite == 'RLA'"))[0])

    def test_otro_tramite_plazo_o_datos_de_obra_salen(self):
        entra, motivo = ac.alcance(regla("A", aplica_si="tramite == 'RDP'"))
        self.assertFalse(entra)
        self.assertIn("RDP", motivo)
        self.assertFalse(ac.alcance(regla("A", aplica_si="tramite in ['PDC', 'ATC'] or x == 1 and tramite == 'GRUA'"))[0])
        self.assertFalse(ac.alcance(regla("A", tipo="plazo"))[0])
        self.assertFalse(ac.alcance(regla("A", entradas=["atc.dias_habiles_transcurridos"]))[0])

    def test_lo_desconocido_no_excluye(self):
        # «or» con un dato desconocido y «not» de un trámite distinto: no se puede descartar.
        self.assertTrue(ac.alcance(regla("A", aplica_si="tramite == 'RDP' or existe(lote.fincas)"))[0])
        self.assertTrue(ac.alcance(regla("A", aplica_si="not tramite == 'RDP'"))[0])


class TestBanderas(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        r = Path(self.tmp.name)
        (r / "normativa" / "acuerdo-110").mkdir(parents=True)
        (r / "normativa" / "acuerdo-110" / "texto-completo.md").write_text(TEXTO, encoding="utf-8")
        (r / "reglas").mkdir()
        (r / "scripts").mkdir()
        (r / "scripts" / "hechos_documentales.json").write_text(json.dumps({"datos": []}), encoding="utf-8")
        reglas = [
            regla("OK"),
            regla("SIN-CITA", fuente={"norma": NORMA, "articulo": "Art. 9", "pagina_pdf": 2, "cita_textual": "Este texto no está en ninguna norma cargada"}),
            regla("CORTA", fuente={"norma": NORMA, "articulo": "Art. 2", "pagina_pdf": 1, "cita_textual": "50%"}),
            regla("ESQUEMA", condicion=None),
            regla("DUP", fuente={"norma": NORMA, "articulo": "Art. 3", "pagina_pdf": 1, "cita_textual": "Otra línea: 50% de ocupación."}),
            regla("FUERA", aplica_si="tramite == 'RDP'"),
        ]
        (r / "reglas" / "reglas_prueba_borrador.json").write_text(json.dumps(reglas, ensure_ascii=False), encoding="utf-8")
        self.filas, self.fuera, _ = ac.auditar(r)
        self.por_id = {x["id"]: x for x in self.filas}

    def tearDown(self):
        self.tmp.cleanup()

    def test_alcance_separa_lo_de_otro_tramite(self):
        self.assertEqual([x["id"] for x in self.fuera], ["FUERA"])
        self.assertEqual(len(self.filas) + len(self.fuera), 6)

    def test_cita(self):
        self.assertEqual(self.por_id["OK"]["cita_estado"], "ok")
        self.assertNotIn("cita_no_encontrada", self.por_id["OK"]["banderas"])
        self.assertIn("cita_no_encontrada", self.por_id["SIN-CITA"]["banderas"])
        self.assertIn("cita_corta", self.por_id["CORTA"]["banderas"])
        self.assertNotIn("cita_corta", self.por_id["OK"]["banderas"])

    def test_esquema(self):
        self.assertIn("esquema", self.por_id["ESQUEMA"]["banderas"])
        self.assertTrue(any("sin condicion" in p for p in self.por_id["ESQUEMA"]["esquema"]))
        self.assertEqual(self.por_id["OK"]["esquema"], [])

    def test_duplicada_logica_solo_con_misma_condicion_y_aplica_si(self):
        # OK, SIN-CITA, CORTA y DUP comparten aplica_si y condición; ESQUEMA no tiene condición.
        self.assertIn("duplicada_logica", self.por_id["OK"]["banderas"])
        self.assertNotIn("duplicada_logica", self.por_id["ESQUEMA"]["banderas"])

    def test_origen_de_los_datos(self):
        self.assertEqual(self.por_id["OK"]["entradas"][0]["origen"], "medido a escala o contado en el plano")
        self.assertEqual(ac.origen_dato("expediente.paz_y_salvo", {}, None), "expediente u otro documento")
        self.assertEqual(ac.origen_dato("plano.norte_indicado", {"plano.norte_indicado": "ia"}, None), "documental (ia)")


if __name__ == "__main__":
    unittest.main()
