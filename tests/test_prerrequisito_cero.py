"""«No aplica» por prerrequisito en 0 (ADR-0018): sin rampa vehicular o sin acceso vehicular, las reglas no aplican.

Con `existe(dato)` en `aplica_si`, un 0 («no hay») contaba como dato presente y la regla seguía aplicando. Las reglas de
rampa pasaron a `> 0` el 21-oct y las de rotura de cordón el 22-oct.
"""
import json
import re
import unittest
from pathlib import Path

from precheck.motor.evaluador import evaluar_regla

RAIZ = Path(__file__).resolve().parent.parent
PRERREQUISITOS = ("rampa.ancho_m", "acceso_vehicular.rotura_cordon_m")


def h(valor):
    return {"valor": valor, "confianza": 0.9, "fuente": {"pagina": 1}}


class TestPrerrequisitoCero(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reglas = [r for f in sorted((RAIZ / "reglas").glob("*.json")) for r in json.loads(f.read_text(encoding="utf-8"))
                      if any(d in (r.get("aplica_si") or "") for d in PRERREQUISITOS)]

    def test_ninguna_regla_usa_existe_con_un_prerrequisito_que_puede_ser_cero(self):
        for r in self.reglas:
            with self.subTest(regla=r["id"]):
                for d in PRERREQUISITOS:
                    self.assertNotRegex(r["aplica_si"], r"existe\(\s*" + re.escape(d) + r"\s*\)")

    def test_con_cero_la_regla_no_aplica(self):
        self.assertGreaterEqual(len(self.reglas), 8)
        hechos = {"tramite": h("RLA"), "lote": {"norma_aplicable": h("PLOT-A61-2021")},
                  "rampa": {"ancho_m": h(0), "sentidos": h(2)}, "acceso_vehicular": {"rotura_cordon_m": h(0)}}
        for r in self.reglas:
            with self.subTest(regla=r["id"]):
                self.assertEqual(evaluar_regla(r, hechos, 0.85)["resultado"], "NO_APLICA")


if __name__ == "__main__":
    unittest.main()
