"""SAM 2.1 en ONNX (sin torch) con la misma interfaz que `SAM2ImagePredictor` que usa `regiones.refinar_con_sam`.

En el equipo de Daniel (Windows en ARM64) no hay torch, pero sí onnxruntime. La prueba de
`docs/regiones-medicion/prueba-sam.md` mostró que SAM afina bien una caja de lote o de huella en un plano escaneado
(coincidencia 0.97 frente a 0.81–0.84 de la caja de la visión), siempre que:
  - se codifique un recorte alrededor de la caja, no la hoja entera (la hoja reescalada a 1024 px pierde las líneas);
  - la caja se agrande un poco (holgura), porque SAM sigue las líneas de dentro de la caja y una caja corta pierde un borde.

Se activa con `PRECHECK_SAM_ONNX=<carpeta con vision_encoder.onnx y prompt_encoder_mask_decoder.onnx>`; sin esa
variable no se usa (la propuesta queda como antes).
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import numpy as np

LADO = 1024                       # entrada del codificador de SAM 2.1 (se reescala al cuadrado)
MEDIA = np.array([0.485, 0.456, 0.406], np.float32)
DESV = np.array([0.229, 0.224, 0.225], np.float32)
MARGEN_RECORTE = 0.25             # recorte alrededor de la caja: 25 % de su lado por cada borde
HOLGURA = 0.02                    # la caja se agranda un 2 % del ancho de la hoja por cada lado


class PredictorOnnx:
    """`set_image(array RGB)` y `predict(box=[x0, y0, x1, y1], multimask_output=False)` → (máscaras[1, H, W], puntajes, None)."""

    def __init__(self, carpeta: str | Path, holgura: float = HOLGURA):
        import onnxruntime as ort  # noqa: PLC0415

        carpeta = Path(carpeta)
        so = ort.SessionOptions()
        so.intra_op_num_threads = os.cpu_count() or 4
        prov = ["CPUExecutionProvider"]
        self.cod = ort.InferenceSession(str(carpeta / "vision_encoder.onnx"), so, providers=prov)
        self.dec = ort.InferenceSession(str(carpeta / "prompt_encoder_mask_decoder.onnx"), so, providers=prov)
        self.holgura = holgura
        self.img: Optional[np.ndarray] = None

    def set_image(self, img: np.ndarray) -> None:
        self.img = np.asarray(img)

    def _codificar(self, rec: np.ndarray):
        import cv2  # noqa: PLC0415

        a = (cv2.resize(rec, (LADO, LADO), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255.0 - MEDIA) / DESV
        return self.cod.run(None, {"pixel_values": a.transpose(2, 0, 1)[None].astype(np.float32)})

    def predict(self, box, multimask_output: bool = False):
        import cv2  # noqa: PLC0415

        if self.img is None:
            raise RuntimeError("falta set_image")
        H, W = self.img.shape[:2]
        h = self.holgura * W
        x0, y0, x1, y1 = max(0.0, box[0] - h), max(0.0, box[1] - h), min(W, box[2] + h), min(H, box[3] + h)
        mx, my = (x1 - x0) * MARGEN_RECORTE, (y1 - y0) * MARGEN_RECORTE
        rx, ry = max(0, int(x0 - mx)), max(0, int(y0 - my))
        rx1, ry1 = min(W, int(x1 + mx)), min(H, int(y1 + my))
        rec = self.img[ry:ry1, rx:rx1]
        rh, rw = rec.shape[:2]
        emb = self._codificar(rec)
        escala = np.array([LADO / rw, LADO / rh], np.float32)
        caja = (np.array([[x0 - rx, y0 - ry], [x1 - rx, y1 - ry]], np.float32) * escala).reshape(1, 1, 4)
        iou, logits, _ = self.dec.run(None, {
            "input_points": np.zeros((1, 1, 0, 2), np.float32), "input_labels": np.zeros((1, 1, 0), np.int64),
            "input_boxes": caja, "image_embeddings.0": emb[0], "image_embeddings.1": emb[1], "image_embeddings.2": emb[2]})
        puntajes, logits = iou[0, 0], logits[0, 0]
        mascaras = [cv2.resize(logits[k], (rw, rh), interpolation=cv2.INTER_LINEAR) > 0 for k in range(len(puntajes))]
        # Regla de la prueba: la de mayor puntaje entre las que llenan al menos la mitad de la caja.
        area_caja = (x1 - x0) * (y1 - y0)
        validas = [k for k, m in enumerate(mascaras) if m.sum() >= 0.5 * area_caja]
        k = max(validas or range(len(mascaras)), key=lambda i: float(puntajes[i]))
        lienzo = np.zeros((H, W), np.float32)
        lienzo[ry:ry1, rx:rx1] = mascaras[k]
        return lienzo[None], np.array([float(puntajes[k])]), None


def predictor_onnx(avisos: Optional[list[str]] = None) -> Optional[PredictorOnnx]:
    """El predictor si `PRECHECK_SAM_ONNX` apunta a una carpeta con el modelo; si no, None."""
    carpeta = os.environ.get("PRECHECK_SAM_ONNX")
    if not carpeta:
        return None
    try:
        return PredictorOnnx(carpeta)
    except Exception as e:  # noqa: BLE001 — opcional: sin modelo o sin onnxruntime se omite
        if avisos is not None:
            avisos.append(f"SAM 2.1 (ONNX) no se pudo cargar desde {carpeta}: {e}")
        return None
