"""Nombres de las corridas de prueba (scripts/analisis/nombres.py) y el sufijo de repetición en los demás scripts."""
import importlib.util
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


def _cargar(nombre: str, ruta: Path):
    spec = importlib.util.spec_from_file_location(nombre, ruta)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


no = _cargar("analisis_nombres", RAIZ / "scripts" / "analisis" / "nombres.py")


class NombresPrueba(unittest.TestCase):
    def test_lee_ronda_modelo_y_repeticion(self):
        self.assertEqual(no.leer("Tocumen (comercial) - prueba 77 con Opus 5.5"),
                         {"plano": "Tocumen (comercial)", "ronda": 77, "modelo": "Opus 5.5", "repeticion": 1})
        self.assertEqual(no.leer("Tocumen (comercial) - prueba 77 con Opus 5.5 (2)")["repeticion"], 2)
        self.assertEqual(no.leer("Tocumen (comercial) - prueba 77 con Opus 5.5 (2)")["modelo"], "Opus 5.5")
        self.assertEqual(no.leer("Casco Antiguo - prueba con Sonnet 5.5")["ronda"], 1)
        self.assertEqual(no.leer("Bella Vista - IA Opus 5.5")["modelo"], "Opus 5.5")
        self.assertIsNone(no.leer("Residencia Betania 01"))

    def test_nombre_de_ida_y_vuelta(self):
        self.assertEqual(no.nombre_corrida("CASO-A", 78, "Fable 5.1"), "CASO-A - prueba 78 con Fable 5.1")
        self.assertEqual(no.nombre_corrida("CASO-A", 78, "Fable 5.1", 3), "CASO-A - prueba 78 con Fable 5.1 (3)")
        self.assertEqual(no.leer(no.nombre_corrida("CASO-A", 78, "Fable 5.1", 3))["repeticion"], 3)

    def test_los_scripts_no_leen_la_repeticion_como_otro_modelo(self):
        """Sin el grupo « (k)», «Opus 5.5 (2)» pasaría por un modelo nuevo sin dar error."""
        for rel in ["analisis/consistencia_alcance.py", "analisis/costos.py", "analisis/desacuerdos.py",
                    "analisis/estados_por_ronda.py", "costos_corridas.py", "reporte_estabilidad.py"]:
            texto = (RAIZ / "scripts" / rel).read_text(encoding="utf-8")
            patron = re.search(r're\.compile\(r"(\^\(\?P<plano>.*?)"\)', texto)
            self.assertIsNotNone(patron, rel)
            m = re.match(patron.group(1), "Bella Vista - prueba 77 con Opus 5.5 (2)")
            self.assertIsNotNone(m, rel)
            self.assertEqual(m["modelo"], "Opus 5.5", rel)
            self.assertEqual(m["repeticion"], "2", rel)


if __name__ == "__main__":
    unittest.main()
