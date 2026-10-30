import os
import unittest
from unittest import mock

from precheck.planos import lector_claude, lector_glm
from precheck.planos.lineas import Linea


class LectorGlm(unittest.TestCase):
    def setUp(self):
        lector_glm.reiniciar()

    def test_apagado_por_defecto(self):
        for valor in ("", "0"):
            with mock.patch.dict(os.environ, {"PRECHECK_OCR_GLM": valor}):
                self.assertFalse(lector_glm.activo())

    def test_una_llamada_por_documento(self):
        self.assertEqual(lector_glm.leer(b"png", ejecutar=lambda _: "FINCA: 078850"), "FINCA: 078850")
        self.assertIsNone(lector_glm.leer(b"png", ejecutar=lambda _: "FINCA: 1"))
        self.assertEqual(lector_glm.resumen()["llamadas"], 1)

    def test_fallo_no_tumba_la_lectura(self):
        def falla(_):
            raise OSError("sin Ollama")
        self.assertIsNone(lector_glm.leer(b"png", ejecutar=falla))
        self.assertEqual(lector_glm.resumen()["fallos"], 1)

    def test_coincidir_con_otro_lector_comprueba_el_dato(self):
        previa = [Linea("FINCA: 078850", 1, (10.0, 10.0, 100.0, 20.0), "ocr", 0.6, ())]
        r = lector_claude.fusionar(previa, "FINCA: 078850", (0, 0, 200, 200), 1, coincide=lector_glm.CONFIANZA_COINCIDE)
        self.assertEqual([(ln.texto, ln.confianza) for ln in r], [("FINCA: 078850", 0.95)])
        self.assertGreaterEqual(lector_glm.CONFIANZA_COINCIDE, 0.85)

    def test_difieren_quedan_candidatos(self):
        previa = [Linea("FINCA: 076850", 1, (10.0, 10.0, 100.0, 20.0), "ocr", 0.6, ())]
        r = lector_claude.fusionar(previa, "FINCA: 078850", (0, 0, 200, 200), 1, coincide=lector_glm.CONFIANZA_COINCIDE)
        self.assertEqual(r[0].confianza, lector_claude.CONFIANZA_DIFIERE)
        self.assertEqual(len(r[0].candidatos), 2)


if __name__ == "__main__":
    unittest.main()
