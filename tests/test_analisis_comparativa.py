"""scripts/analisis/comparativa.py con un rondas-metricas.json sintético."""
import importlib.util
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("analisis_comparativa", RAIZ / "scripts" / "analisis" / "comparativa.py")
cp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cp)


def corrida(plano, modelo, exactitud, usd=1.0, minutos=10, contra=0, terminada=True):
    return {"plano": plano, "modelo": modelo, "terminada": terminada, "usd": usd, "minutos": minutos,
            "lectura": {"exactitud": exactitud} if exactitud is not None else None,
            "dictamen": {"contradiceMotor": contra, "informacionRequerida": 0, "externasSinEstado": 0}}


METRICAS = {"verdad": {"datos": 129}, "generado": "2026-10-14", "rondas": [
    {"ronda": 43, "corridas": [corrida("Bella Vista", "Sonnet 5.5", 0.97, usd=2.9), corrida("Bella Vista", "DeepSeek Flash", 0.90, usd=0.6),
                               corrida("Casco Antiguo", "Sonnet 5.5", 1.0), corrida("Casco Antiguo", "DeepSeek Flash", 0.76),
                               corrida("Bella Vista", "Opus 5.5", None, terminada=False)]},
    {"ronda": 44, "corridas": [corrida("Bella Vista", "Sonnet 5.5", 0.93), corrida("Bella Vista", "DeepSeek Flash", 0.88, contra=1),
                               corrida("Casco Antiguo", "Sonnet 5.5", 0.96), corrida("Casco Antiguo", "DeepSeek Flash", 0.70)]},
    {"ronda": 46, "corridas": [corrida("Bella Vista", "DeepSeek Flash", 0.95), corrida("Casco Antiguo", "DeepSeek Flash", 0.80)]},
]}


class TestComparativa(unittest.TestCase):
    def test_tabla_media_rango_y_contradicciones(self):
        t = cp.tabla(cp.corridas_de(METRICAS, [43, 44]))
        bv = t["Bella Vista"]["DeepSeek Flash"]
        self.assertEqual((bv["n"], bv["min"], bv["max"], bv["variacion"], bv["contradicciones"]), (2, 0.88, 0.90, 2, 1))
        self.assertAlmostEqual(bv["media"], 0.89)
        self.assertNotIn("Opus 5.5", t["Bella Vista"])  # sin terminar no cuenta

    def test_regla_de_decision(self):
        t = cp.tabla(cp.corridas_de(METRICAS, [43, 44]))
        d = cp.decision_deepseek(t, "DeepSeek Flash", "Sonnet 5.5")
        # Bella Vista: Sonnet 95 de media, DeepSeek peor corrida 88 → 7 puntos: no.
        self.assertFalse(d["Bella Vista"]["veredicto"])
        self.assertEqual(d["Bella Vista"]["distancia"], 7)
        # Casco: 98 frente a 70 → 28 puntos y varía 6: no.
        self.assertFalse(d["Casco Antiguo"]["veredicto"])

    def test_global_separa_escaneados_y_variantes_dan_delta(self):
        g = cp.global_por_modelo(cp.tabla(cp.corridas_de(METRICAS, [43, 44])))
        self.assertAlmostEqual(g["DeepSeek Flash"]["vectoriales"], 0.89)
        self.assertAlmostEqual(g["DeepSeek Flash"]["escaneados"], 0.73)
        ev = cp.efecto_variantes(METRICAS, [43, 44], [46], "DeepSeek Flash")
        self.assertEqual(ev[46]["planos"]["Bella Vista"]["delta"], 6)
        self.assertEqual(ev[46]["planos"]["Casco Antiguo"]["delta"], 7)
        self.assertEqual(ev[46]["delta_medio"], 6.5)

    def test_markdown(self):
        md = cp.markdown(METRICAS, [43, 44], [46], "DeepSeek Flash", "Sonnet 5.5")
        self.assertIn("| Bella Vista | no | 7 | 2 |", md)
        self.assertIn("0.80 lista (≈ 0.20 real)", md)
        self.assertIn("| 46 |", md)


if __name__ == "__main__":
    unittest.main()
