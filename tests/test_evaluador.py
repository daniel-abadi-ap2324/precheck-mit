"""T3 — evaluador puro (AC-05: dato faltante o confianza baja → revisión, sin rellenar)."""
import re
import unittest

from precheck.motor import evaluador
from precheck.motor.version import VERSION_MOTOR, commit

REGLA = {"id": "T-X", "version": 1, "tipo": "cuantitativa", "entradas": ["lote.frente_m"],
         "condicion": "lote.frente_m >= 16", "severidad": "bloqueante", "mensaje_no_cumple": "x"}


def hechos(valor=17, confianza=0.9):
    return {"lote": {"frente_m": {"valor": valor, "confianza": confianza, "fuente": {"metodo": "declarado"}}}}


class TestEvaluador(unittest.TestCase):
    def test_cumple_y_no_cumple(self):
        self.assertEqual(evaluador.evaluar_regla(REGLA, hechos(17), 0.85)["resultado"], "CUMPLE")
        self.assertEqual(evaluador.evaluar_regla(REGLA, hechos(10), 0.85)["resultado"], "NO_CUMPLE")

    def test_dato_faltante_va_a_revision_sin_rellenar(self):
        r = evaluador.evaluar_regla(REGLA, {"lote": {}}, 0.85)
        self.assertEqual(r["resultado"], "REQUIERE_REVISION")
        self.assertIn("lote.frente_m", r["motivo"])
        self.assertNotIn("lote.frente_m", r["valores_usados"])

    def test_confianza_bajo_umbral_va_a_revision(self):
        r = evaluador.evaluar_regla(REGLA, hechos(17, 0.5), 0.85)
        self.assertEqual(r["resultado"], "REQUIERE_REVISION")
        self.assertIn("confianza", r["motivo"])

    def test_la_regla_puede_subir_el_umbral_pero_no_bajarlo(self):
        sube = dict(REGLA, umbral_confianza=0.95)
        baja = dict(REGLA, umbral_confianza=0.10)
        self.assertEqual(evaluador.evaluar_regla(sube, hechos(17, 0.9), 0.85)["resultado"], "REQUIERE_REVISION")
        self.assertEqual(evaluador.evaluar_regla(baja, hechos(17, 0.5), 0.85)["resultado"], "REQUIERE_REVISION")

    def test_valores_usados_llevan_su_fuente(self):
        r = evaluador.evaluar_regla(REGLA, hechos(17), 0.85)
        self.assertEqual(r["valores_usados"]["lote.frente_m"]["fuente"], {"metodo": "declarado"})
        self.assertEqual(r["valores_usados"]["lote.frente_m"]["valor"], 17)

    def test_version_del_motor(self):
        self.assertRegex(VERSION_MOTOR, r"^\d+\.\d+\.\d+$")
        self.assertTrue(re.fullmatch(r"[0-9a-f]{7,40}|desconocido", commit()))

    def test_motor_py_reutiliza_el_evaluador(self):
        from precheck.motor import motor
        self.assertIs(motor.evaluar_regla, evaluador.evaluar_regla)


if __name__ == "__main__":
    unittest.main()


class TestRobustez(unittest.TestCase):
    """Review A3/A5/B1: una regla nunca aborta la evaluación y la duda va a revisión."""

    def test_error_de_tipo_en_aplica_si_va_a_revision(self):
        regla = dict(REGLA, aplica_si="lote.area > 5")
        r = evaluador.evaluar_regla(regla, {"lote": {"area": {"valor": "grande", "confianza": 1.0},
                                                     "frente_m": {"valor": 17, "confianza": 1}}}, 0.85)
        self.assertEqual(r["resultado"], "REQUIERE_REVISION")
        self.assertIn("error", r["motivo"])

    def test_sintaxis_invalida_en_condicion_va_a_revision(self):
        r = evaluador.evaluar_regla(dict(REGLA, condicion="lote.frente_m >"), hechos(17), 0.85)
        self.assertEqual(r["resultado"], "REQUIERE_REVISION")

    def test_regla_sin_condicion_va_a_revision(self):
        regla = {k: v for k, v in REGLA.items() if k != "condicion"}
        self.assertEqual(evaluador.evaluar_regla(regla, hechos(17), 0.85)["resultado"], "REQUIERE_REVISION")

    def test_aplica_si_falso_con_dato_dudoso_va_a_revision(self):
        # review A5: una zona leída con confianza baja no puede dejar la regla en NO_APLICA
        regla = dict(REGLA, aplica_si="lote.codigo_zona in ['1ZM6']")
        h = hechos(10)
        h["lote"]["codigo_zona"] = {"valor": "1R1", "confianza": 0.3}
        r = evaluador.evaluar_regla(regla, h, 0.85)
        self.assertEqual(r["resultado"], "REQUIERE_REVISION")
        self.assertIn("no se puede determinar si aplica", r["motivo"])
        h["lote"]["codigo_zona"]["confianza"] = 0.99
        self.assertEqual(evaluador.evaluar_regla(regla, h, 0.85)["resultado"], "NO_APLICA")

    def test_motivo_de_confianza_en_lenguaje_llano(self):
        r = evaluador.evaluar_regla(REGLA, hechos(17, 0.5), 0.85)
        self.assertEqual(r["motivo"], "la confianza de lote.frente_m (0.50) está bajo el mínimo 0.85")

    def test_validar_expresion(self):
        evaluador.validar_expresion("lote.frente_m >= 16 and existe(lote.x)")
        for mala in ("lote.frente_m >", "__import__('os').system('x')", "lote.a.b()", "[x for x in y]"):
            with self.subTest(mala=mala), self.assertRaises(ValueError):
                evaluador.validar_expresion(mala)
