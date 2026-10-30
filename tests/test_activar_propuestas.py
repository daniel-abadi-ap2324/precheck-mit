"""Datos del contrato que suma scripts/activar_propuestas.py al pasar reglas propuestas a reglas/ (ADR-0019).

Con las `entradas` sin filtrar entró al contrato un «tramite» sí/no: el normalizador vaciaba 'RLA' y ninguna regla
se resolvía.
"""
import importlib.util
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("activar_propuestas", RAIZ / "scripts" / "activar_propuestas.py")
activar = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(activar)


class TestClavesDe(unittest.TestCase):
    def test_las_entradas_pasan_por_el_mismo_filtro_que_las_expresiones(self):
        regla = {"entradas": ["tramite", "lote.norma_aplicable", "lote.area_m2"],
                 "aplica_si": "tramite == 'RLA' and lote.codigo_zona == 'RM1' and existe(proyecto.altura_m)",
                 "condicion": None}
        self.assertEqual(activar.claves_de(regla), ["lote.area_m2", "proyecto.altura_m"])


if __name__ == "__main__":
    unittest.main()
