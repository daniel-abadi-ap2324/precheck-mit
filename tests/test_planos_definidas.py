import json
import tempfile
import unittest
from pathlib import Path

from precheck.planos import definidas
from precheck.planos.revisar import cargar_reglas, evaluar
from precheck.planos.sensatez import aplicar


def nodo(valor, confianza=0.9, **extra):
    return {"valor": valor, "confianza": confianza, **extra}


class Definidas(unittest.TestCase):
    def test_cargar_sin_archivo_o_dañado(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(definidas.cargar(d), {})
            (Path(d) / "definidas.json").write_text("{no es json", encoding="utf-8")
            self.assertEqual(definidas.cargar(d), {})
            (Path(d) / "definidas.json").write_text(json.dumps({"valores": {"lote.codigo_zona": "R2-A", "x.y": None}}), encoding="utf-8")
            self.assertEqual(definidas.cargar(d), {"lote.codigo_zona": "R2-A"})

    def test_impone_sobre_lo_que_escribio_la_ia_y_deja_aviso(self):
        hechos = {"lote": {"codigo_zona": nodo("R2", 0.85)}, "proyecto": {"altura_m": nodo(12)}}
        res, avisos = definidas.imponer(hechos, {"lote.codigo_zona": "R2-A", "proyecto.altura_m": 12, "proyecto.pisos_totales": 4})
        self.assertEqual(res["lote"]["codigo_zona"]["valor"], "R2-A")
        self.assertEqual(res["lote"]["codigo_zona"]["confianza"], 1.0)
        self.assertTrue(res["lote"]["codigo_zona"]["definido"])
        self.assertEqual(res["proyecto"]["pisos_totales"]["valor"], 4)   # lo que faltaba se agrega
        self.assertEqual(hechos["lote"]["codigo_zona"]["valor"], "R2")   # no muta la entrada
        self.assertEqual(len(avisos), 1)                                  # solo la zona difería
        self.assertIn("VARIABLE_DEFINIDA", avisos[0])

    def test_sensatez_no_cuestiona_lo_definido(self):
        hechos, _ = definidas.imponer({}, {"proyecto.altura_m": 0.0, "proyecto.pisos_totales": 3})
        res, avisos = aplicar(hechos)
        self.assertEqual(res["proyecto"]["altura_m"]["confianza"], 1.0)
        self.assertEqual([a for a in avisos if "DATO_DUDOSO" in a], [])

    def test_zona_definida_gana_al_plano_pero_queda_como_supuesto(self):
        # ADR-0016: lo definido no baja de confianza, pero si el plano dice otra zona la decisión lleva el supuesto.
        base = {"lote": {"norma_aplicable": nodo("PLOT-A61-2021", 1.0)}, "plano": {"zonificacion_declarada": nodo("ZM7")}}
        hechos, _ = definidas.imponer(base, {"lote.codigo_zona": "1ZM6"})
        self.assertEqual(hechos["lote"]["codigo_zona"]["confianza"], 1.0)
        res = evaluar(hechos, cargar_reglas(), "2026-09-01")
        zt = res["zona_trabajo"]
        self.assertEqual((zt["codigo"], zt["procedencia"], zt["firme"]), ("1ZM6", "arquitecto", False))
        self.assertEqual([d["codigo"] for d in zt["descartadas"]], ["ZM7"])

if __name__ == "__main__":
    unittest.main()
