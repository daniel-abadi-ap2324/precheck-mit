"""Adaptador de SAM 2.1 en ONNX (precheck/planos/sam_onnx.py), con sesiones falsas: no hace falta el modelo."""
import os
import unittest
from unittest import mock

import numpy as np

from precheck.planos import regiones as rg
from precheck.planos import sam_onnx as so


class CodFalso:
    def run(self, _salidas, entradas):
        assert entradas["pixel_values"].shape == (1, 3, so.LADO, so.LADO)
        return [np.zeros(1), np.zeros(1), np.zeros(1)]


class DecFalso:
    """Devuelve 3 máscaras de 256×256: vacía, cuadrado central grande (puntaje medio) y punto (puntaje alto)."""

    def run(self, _salidas, entradas):
        m = np.full((3, 256, 256), -5.0, np.float32)
        m[1, 32:224, 32:224] = 5.0
        m[2, 128:130, 128:130] = 5.0
        return [np.array([[[0.1, 0.6, 0.9]]], np.float32), m[None, None], None]


def predictor(holgura=0.0):
    p = so.PredictorOnnx.__new__(so.PredictorOnnx)
    p.cod, p.dec, p.holgura, p.img = CodFalso(), DecFalso(), holgura, None
    return p


class TestPredictorOnnx(unittest.TestCase):
    def test_elige_la_mascara_que_llena_la_caja_y_la_devuelve_en_la_hoja(self):
        p = predictor()
        p.set_image(np.zeros((400, 600, 3), np.uint8))
        masks, puntajes, _ = p.predict(box=[200, 100, 400, 300])
        self.assertEqual(masks.shape, (1, 400, 600))
        # Gana la máscara grande (llena ≥ 50 % de la caja) aunque el punto tenga más puntaje.
        self.assertAlmostEqual(float(puntajes[0]), 0.6, places=5)
        ys, xs = np.nonzero(masks[0])
        self.assertTrue(150 <= xs.min() < 250 and 350 < xs.max() <= 450)
        self.assertTrue(50 <= ys.min() < 150 and 250 < ys.max() <= 350)

    def test_sin_imagen_falla_claro(self):
        with self.assertRaises(RuntimeError):
            predictor().predict(box=[0, 0, 10, 10])

    def test_refinar_con_sam_usa_el_adaptador(self):
        from PIL import Image

        p = predictor()
        img = Image.new("RGB", (600, 400), "white")
        r = rg.region(1, "lote", [[0.3, 0.2], [0.7, 0.2], [0.7, 0.8], [0.3, 0.8]], "vision", 0.5, "Lote")
        afinada = rg.refinar_con_sam(img, [r], p)[0]
        self.assertEqual(afinada["tipo"], "lote")
        self.assertNotEqual(afinada["puntos"], r["puntos"])


class TestActivacion(unittest.TestCase):
    def test_sin_variable_no_se_usa(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("PRECHECK_SAM_ONNX", None)
            self.assertIsNone(so.predictor_onnx())

    def test_carpeta_sin_modelo_avisa_y_sigue(self):
        avisos: list[str] = []
        with mock.patch.dict(os.environ, {"PRECHECK_SAM_ONNX": "C:/no/existe"}):
            self.assertIsNone(rg.predictor_sam(avisos))
        self.assertTrue(avisos and "ONNX" in avisos[0])


if __name__ == "__main__":
    unittest.main()
