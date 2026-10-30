"""Medida determinista de la franja del membrete (scripts/medir_membrete.py)."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("medir_membrete", RAIZ / "scripts" / "medir_membrete.py")
mm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mm)


def lamina(ancho_px=1440, alto_px=960, franja_px=None, lado="derecha", cortada=False):
    """Hoja blanca con marco y, si se pide, la línea interior de la franja a `franja_px` del marco."""
    img = np.full((alto_px, ancho_px), 255, np.uint8)
    m = 20
    cv2.rectangle(img, (m, m), (ancho_px - m, alto_px - m), 0, 2)
    if franja_px:
        if lado == "derecha":
            x = ancho_px - m - franja_px
            cv2.line(img, (x, m), (x, alto_px - m), 0, 2)
        else:
            y = alto_px - m - franja_px
            cv2.line(img, (m, y), (ancho_px - m, y), 0, 2)
    if cortada:  # escaneo: la línea sale con cortes cada tanto
        for y in range(0, alto_px, 40):
            img[y:y + 6, :] = 255
    return img


class TestFranja(unittest.TestCase):
    def test_franja_derecha_de_9_cm(self):
        # 1440 px = 914 mm: 142 px ≈ 90 mm.
        f = mm.franja(lamina(franja_px=142), 914, 610)
        self.assertEqual(f["lado"], "derecha")
        self.assertEqual(f["ancho_m"], 0.09)

    def test_franja_de_10_cm_con_lineas_cortadas_por_el_escaneo(self):
        f = mm.franja(lamina(franja_px=157, cortada=True), 914, 610)
        self.assertEqual(f["ancho_m"], 0.1)

    def test_franja_inferior_en_hoja_vertical(self):
        f = mm.franja(lamina(ancho_px=960, alto_px=1440, franja_px=142, lado="inferior"), 610, 914)
        self.assertEqual(f["lado"], "inferior")
        self.assertEqual(f["ancho_m"], 0.09)

    def test_sin_franja_no_inventa_medida(self):
        self.assertIsNone(mm.franja(lamina(), 914, 610))

    def test_medir_lee_la_carpeta_del_caso(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            cv2.imwrite(str(d / "p1.png"), lamina(franja_px=142))
            cv2.imwrite(str(d / "p2.png"), lamina())
            (d / "extraccion.json").write_text(json.dumps({"paginas": [
                {"numero": 1, "ancho_mm": 914, "alto_mm": 610, "miniatura": "p1.png"},
                {"numero": 2, "ancho_mm": 914, "alto_mm": 610, "miniatura": "p2.png"},
            ]}), encoding="utf-8")
            r = mm.medir(d)
        self.assertEqual(r["ancho_min_m"], 0.09)
        self.assertEqual(r["laminas_medidas"], 1)
        self.assertIsNone(r["paginas"][1]["franja"])


if __name__ == "__main__":
    unittest.main()
