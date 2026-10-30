"""T5 — indicación vigente y traslado entre evaluaciones (AC-24)."""
import unittest

from precheck.informe.modelo import historial_indicaciones, indicacion_vigente, proyectar
from tests.apoyo_informe import Bitacora, estado_reglas, resultado, valor

FRENTE = "PLOT-ZM6-LOTE-FRENTE"


def frente(**kw):
    kw.setdefault("valores", {"lote.frente_m": valor(15.2)})
    return [resultado(FRENTE, kw.pop("res", "NO_CUMPLE"), **kw), resultado("PLOT-ZM6-DENSIDAD", "CUMPLE")]


class TestTraslado(unittest.TestCase):
    def setUp(self):
        self.inicio()

    def inicio(self):
        self.b = Bitacora()
        self.ev1 = self.b.evaluar(frente())
        self.b.decidir(self.ev1, FRENTE, "confirmar", "medido en sitio")
        self.b.indicar(self.ev1, FRENTE, "Amplíe el frente del lote a 16 m.")

    def reevaluar(self, **kw):
        seq = self.b.evaluar(frente(**kw))
        if kw.get("res", "NO_CUMPLE") == "NO_CUMPLE":
            self.b.decidir(seq, FRENTE, "confirmar", "sigue sin cumplir")
        return seq

    def test_rige_la_ultima_con_historial(self):
        self.b.indicar(self.ev1, FRENTE, "Amplíe el frente a 16 m o solicite excepción.", actor="P-0005")
        v = indicacion_vigente(self.b.eventos, self.ev1, FRENTE)
        self.assertEqual((v.texto, v.autor, v.trasladada), ("Amplíe el frente a 16 m o solicite excepción.",
                                                            "P-0005", False))
        h = historial_indicaciones(self.b.eventos, self.ev1, FRENTE)
        self.assertEqual([(i["texto"], i["autor"]) for i in h],
                         [("Amplíe el frente del lote a 16 m.", "P-0004"),
                          ("Amplíe el frente a 16 m o solicite excepción.", "P-0005")])
        self.assertTrue(all(i["ocurrido_en"] for i in h))

    def test_se_traslada_si_nada_cambio(self):
        # AC-24
        ev2 = self.reevaluar()
        v = indicacion_vigente(self.b.eventos, ev2, FRENTE)
        self.assertEqual((v.texto, v.trasladada, v.evaluacion_seq), ("Amplíe el frente del lote a 16 m.", True,
                                                                     self.ev1))
        m = proyectar(self.b.eventos, estado_reglas(frente()), ev2, "revisor")
        r = next(x for x in m["resultados"] if x["regla_id"] == FRENTE)
        self.assertEqual((r["indicacion"]["texto"], r["indicacion"]["trasladada"]),
                         ("Amplíe el frente del lote a 16 m.", True))
        self.assertEqual(len(r["historial_indicaciones"]), 1)
        self.assertNotIn(FRENTE, m["estado"]["faltantes"]["indicaciones"])

    def test_valores_se_comparan_en_forma_canonica(self):
        ev2 = self.reevaluar(valores={"lote.frente_m": {"fuente": {"documento": "formulario",
                                                                   "metodo": "declarado"},
                                                        "confianza": 0.95, "valor": 15.2}})
        self.assertTrue(indicacion_vigente(self.b.eventos, ev2, FRENTE).trasladada)

    def test_si_cambio_algo_queda_sin_indicacion(self):
        # AC-24: cambio de versión, de resultado o de valores usados
        for kw in ({"version": 2}, {"valores": {"lote.frente_m": valor(15.4)}},
                   {"res": "REQUIERE_REVISION", "estado": "borrador", "indicativo": "NO_CUMPLE"}):
            with self.subTest(**{k: str(v) for k, v in kw.items()}):
                self.inicio()
                ev2 = self.reevaluar(**kw)
                if "res" in kw:
                    self.b.decidir(ev2, FRENTE, "veredicto", "a criterio", veredicto="NO_CUMPLE")
                self.assertIsNone(indicacion_vigente(self.b.eventos, ev2, FRENTE))
                m = proyectar(self.b.eventos, estado_reglas(frente(**kw)), ev2, "revisor")
                self.assertIn(FRENTE, m["estado"]["faltantes"]["indicaciones"])
                r = next(x for x in m["resultados"] if x["regla_id"] == FRENTE)
                self.assertIsNone(r["indicacion"])

    def test_traslado_recursivo(self):
        self.reevaluar()
        ev3 = self.reevaluar()
        v = indicacion_vigente(self.b.eventos, ev3, FRENTE)
        self.assertEqual((v.texto, v.trasladada, v.evaluacion_seq), ("Amplíe el frente del lote a 16 m.", True,
                                                                     self.ev1))

    def test_la_recursion_se_corta_si_una_intermedia_cambio(self):
        self.reevaluar(valores={"lote.frente_m": valor(15.4)})
        ev3 = self.reevaluar(valores={"lote.frente_m": valor(15.4)})
        self.assertIsNone(indicacion_vigente(self.b.eventos, ev3, FRENTE))

    def test_indicacion_propia_no_se_marca_trasladada(self):
        ev2 = self.reevaluar()
        self.b.indicar(ev2, FRENTE, "Nueva indicación.")
        v = indicacion_vigente(self.b.eventos, ev2, FRENTE)
        self.assertEqual((v.texto, v.trasladada, v.evaluacion_seq), ("Nueva indicación.", False, ev2))

    def test_norma_sin_reglas_se_traslada_con_el_mismo_veredicto(self):
        b = Bitacora()
        ev1 = b.evaluar(frente(), normas_sin_reglas=["MIVIOT"])
        b.decidir(ev1, "norma:MIVIOT", "veredicto", "sin retiro frontal", veredicto="NO_CUMPLE")
        b.indicar(ev1, "norma:MIVIOT", "Aporte el retiro frontal exigido por el MIVIOT.")
        ev2 = b.evaluar(frente(), normas_sin_reglas=["MIVIOT"])
        self.assertIsNone(indicacion_vigente(b.eventos, ev2, "norma:MIVIOT"))    # aún sin veredicto
        b.decidir(ev2, "norma:MIVIOT", "veredicto", "igual", veredicto="NO_CUMPLE")
        v = indicacion_vigente(b.eventos, ev2, "norma:MIVIOT")
        self.assertEqual((v.texto, v.trasladada), ("Aporte el retiro frontal exigido por el MIVIOT.", True))
        ev3 = b.evaluar(frente())                                                   # ya no es norma sin reglas
        self.assertIsNone(indicacion_vigente(b.eventos, ev3, "norma:MIVIOT"))


if __name__ == "__main__":
    unittest.main()
