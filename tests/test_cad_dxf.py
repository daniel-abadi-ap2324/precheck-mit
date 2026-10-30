"""Lectura de DXF (precheck/cad) con un plano sintético: lote 20×30 m y huella 14×20 m, unidades en metros."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import ezdxf

RAIZ = Path(__file__).resolve().parents[1]


def dxf_sintetico(destino: Path) -> Path:
    doc = ezdxf.new("R2018", setup=True)
    doc.header["$INSUNITS"] = 6  # metros
    msp = doc.modelspace()
    doc.layers.add("LOTE")
    doc.layers.add("CONSTRUCCION")
    msp.add_lwpolyline([(0, 0), (20, 0), (20, 30), (0, 30)], close=True, dxfattribs={"layer": "LOTE"})
    msp.add_lwpolyline([(3, 5), (17, 5), (17, 25), (3, 25)], close=True, dxfattribs={"layer": "CONSTRUCCION"})
    msp.add_text("AREA DEL LOTE 600 M2", dxfattribs={"layer": "LOTE"})
    ruta = destino / "plano.dxf"
    doc.saveas(ruta)
    return ruta


def correr(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-m", *args], cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", timeout=120)


class TestDxf(unittest.TestCase):
    def test_extrae_area_del_lote_y_de_la_huella_con_procedencia(self):
        with tempfile.TemporaryDirectory() as d:
            dxf = dxf_sintetico(Path(d))
            mapeo = Path(d) / "mapeo.json"
            mapeo.write_text(json.dumps({"lindero": ["^LOTE$"], "huella_construccion": ["CONSTRUCCION"]}), encoding="utf-8")
            r = correr("precheck.cad.extraer_dxf", str(dxf), "--mapeo", str(mapeo))
            self.assertEqual(r.returncode, 0, r.stderr)
            hechos = json.loads(r.stdout)
            self.assertAlmostEqual(hechos["lote"]["area_m2"]["valor"], 600.0)
            self.assertAlmostEqual(hechos["huella"]["area_m2"]["valor"], 280.0)
            self.assertEqual(hechos["lote"]["area_m2"]["fuente"]["metodo"], "cad")
            self.assertEqual(hechos["lote"]["area_m2"]["fuente"]["capa"], "LOTE")

    def test_inventario_lista_capas_y_unidades(self):
        with tempfile.TemporaryDirectory() as d:
            r = correr("precheck.cad.inventario_dxf", str(dxf_sintetico(Path(d))))
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("unidades: m", r.stdout)
            self.assertIn("LOTE", r.stdout)
            self.assertIn("CONSTRUCCION", r.stdout)

    def test_ayuda_y_archivo_inexistente_dan_un_mensaje_no_un_traceback(self):
        for modulo in ("precheck.cad.inventario_dxf", "precheck.bim.resumen_ifc"):
            ayuda = correr(modulo, "--help")
            self.assertNotIn("Traceback", ayuda.stderr)
            self.assertTrue(ayuda.stderr.strip() or ayuda.stdout.strip())
            falta = correr(modulo, "no-existe.x")
            self.assertNotEqual(falta.returncode, 0)
            self.assertIn("No existe el archivo", falta.stderr)
            self.assertNotIn("Traceback", falta.stderr)


if __name__ == "__main__":
    unittest.main()
