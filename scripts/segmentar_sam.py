#!/usr/bin/env python3
"""Prueba de segmentación con SAM 2.1 (ONNX, sin torch) sobre una hoja de plano: propone polígonos en el formato de
`regiones.json` (origen «vision») para medirlos con `scripts/medir_regiones.py`. Experimental: no está integrado a la web.

Modelo: `onnx-community/sam2.1-hiera-small-ONNX` (Hugging Face), carpeta con `vision_encoder.onnx(+_data)` y
`prompt_encoder_mask_decoder.onnx(+_data)`. Solo necesita onnxruntime, OpenCV, numpy, Pillow y pymupdf.

Modos:
  cajas  — afina las regiones de otro `regiones.json` (p. ej. lo que marcó la visión del LLM o un clic de la persona):
           la caja que encierra cada polígono va como indicación de caja a SAM, sobre un recorte alrededor de la caja.
  auto   — sin indicaciones: rejilla de puntos sobre la hoja entera (como el generador automático de máscaras de SAM),
           filtro por puntaje y estabilidad, y clasificación heurística (lote = cuadrilátero grande y lleno, huella = lo
           más grande dentro del lote, acera = franja delgada pegada al lote).
  --acera — con un lote ya propuesto (en cualquiera de los dos modos), prueba una franja de caja fuera de cada lado del
           lote y se queda con la que SAM llena como franja.

Uso:
  python scripts/segmentar_sam.py --pdf original.pdf --pagina 1 --miniatura p1.png --modelo <carpeta onnx> \
      --salida <carpeta> (--cajas regiones.json | --auto) [--acera] [--tipos lote,huella]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from precheck.planos.regiones import (  # noqa: E402
    DPI_REGIONES, PT_POR_MM, VERSION, Hoja, _area, _caja, _giro_escaneada, _id, mascara_a_puntos, region,
)

LADO = 1024                       # entrada del codificador de SAM 2.1 (se reescala al cuadrado, sin relleno)
MEDIA = np.array([0.485, 0.456, 0.406], np.float32)
DESV = np.array([0.229, 0.224, 0.225], np.float32)
MARGEN_RECORTE = 0.25             # recorte alrededor de una caja: 25 % de su lado por cada borde
PUNTAJE_MIN = 0.80                # modo auto: puntaje de IoU predicho por SAM
ESTABILIDAD_MIN = 0.92            # modo auto: área(logit > 1) / área(logit > −1)
NMS_IOU = 0.7
EPSILON = 0.005                   # simplificación del contorno (fracción del perímetro)


def memoria_mb() -> tuple[int, int]:
    """(memoria en uso, pico) del proceso en MB (Windows; en otro sistema, el pico de ru_maxrss)."""
    try:
        import ctypes
        from ctypes import wintypes

        class PMC(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD), ("PeakWorkingSetSize", ctypes.c_size_t),
                        ("WorkingSetSize", ctypes.c_size_t)] + [(f"x{i}", ctypes.c_size_t) for i in range(6)]
        c = PMC()
        c.cb = ctypes.sizeof(PMC)
        k = ctypes.WinDLL("kernel32")
        k.GetCurrentProcess.restype = wintypes.HANDLE
        f = ctypes.WinDLL("psapi").GetProcessMemoryInfo
        f.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
        f(k.GetCurrentProcess(), ctypes.byref(c), c.cb)
        return c.WorkingSetSize // 2**20, c.PeakWorkingSetSize // 2**20
    except Exception:  # noqa: BLE001
        import resource
        r = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024
        return r, r


# ---------------------------------------------------------------------------------------------------------------
# SAM 2.1 en ONNX.

class Sam:
    def __init__(self, carpeta: Path):
        import onnxruntime as ort

        so = ort.SessionOptions()
        so.intra_op_num_threads = os.cpu_count() or 4
        prov = ["CPUExecutionProvider"]
        self.cod = ort.InferenceSession(str(carpeta / "vision_encoder.onnx"), so, providers=prov)
        self.dec = ort.InferenceSession(str(carpeta / "prompt_encoder_mask_decoder.onnx"), so, providers=prov)
        self.emb = None
        self.ancho = self.alto = 0
        self.codificaciones = 0

    def codificar(self, img) -> None:
        """`img`: PIL RGB. Se reescala a 1024 × 1024 (como el procesador de SAM 2.1) y se normaliza."""
        from PIL import Image

        self.ancho, self.alto = img.size
        a = (np.asarray(img.convert("RGB").resize((LADO, LADO), Image.BILINEAR), np.float32) / 255.0 - MEDIA) / DESV
        self.emb = self.cod.run(None, {"pixel_values": a.transpose(2, 0, 1)[None].astype(np.float32)})
        self.codificaciones += 1

    def _a_modelo(self, xy: np.ndarray) -> np.ndarray:
        return (xy * np.array([LADO / self.ancho, LADO / self.alto], np.float32)).astype(np.float32)

    def _decodificar(self, puntos: np.ndarray, etiquetas: np.ndarray, cajas: np.ndarray):
        b = puntos.shape[0]
        e = [np.repeat(x, b, axis=0) if b > 1 else x for x in self.emb]
        iou, mascaras, _ = self.dec.run(None, {"input_points": puntos, "input_labels": etiquetas, "input_boxes": cajas,
                                               "image_embeddings.0": e[0], "image_embeddings.1": e[1],
                                               "image_embeddings.2": e[2]})
        return iou, mascaras

    def caja(self, x0: float, y0: float, x1: float, y1: float):
        """Indicación de caja (píxeles de la imagen codificada) → (puntajes[3], logits[3, 256, 256])."""
        c = self._a_modelo(np.array([[x0, y0], [x1, y1]], np.float32)).reshape(1, 1, 4)
        iou, m = self._decodificar(np.zeros((1, 1, 0, 2), np.float32), np.zeros((1, 1, 0), np.int64), c)
        return iou[0, 0], m[0, 0]

    def puntos(self, xy: np.ndarray, lote: int = 16):
        """Un punto positivo por indicación, en lotes → lista de (puntajes[3], logits[3, 256, 256])."""
        salida = []
        for i in range(0, len(xy), lote):
            p = self._a_modelo(xy[i:i + lote]).reshape(-1, 1, 1, 2)
            iou, m = self._decodificar(p, np.ones((len(p), 1, 1), np.int64), np.zeros((len(p), 0, 4), np.float32))
            salida += [(iou[j, 0], m[j, 0]) for j in range(len(p))]
        return salida

    def mascara(self, logits: np.ndarray) -> np.ndarray:
        """Logits de 256 × 256 → máscara booleana del tamaño de la imagen codificada."""
        import cv2

        return cv2.resize(logits, (self.ancho, self.alto), interpolation=cv2.INTER_LINEAR) > 0


def en_hoja(mascara: np.ndarray, desplaz: tuple[int, int], ancho: int, alto: int) -> Optional[list[list[float]]]:
    """Máscara de un recorte → polígono en fracciones de la hoja (reusa `mascara_a_puntos` de regiones.py)."""
    lienzo = np.zeros((alto, ancho), np.uint8)
    x, y = desplaz
    h, w = mascara.shape
    lienzo[y:y + h, x:x + w] = mascara[: alto - y, : ancho - x]
    return mascara_a_puntos(lienzo, ancho, alto, epsilon=EPSILON)


def recorte_de_caja(img, caja_px: tuple[float, float, float, float], margen: float = MARGEN_RECORTE):
    W, H = img.size
    x0, y0, x1, y1 = caja_px
    mx, my = (x1 - x0) * margen, (y1 - y0) * margen
    r = (max(0, int(x0 - mx)), max(0, int(y0 - my)), min(W, int(x1 + mx)), min(H, int(y1 + my)))
    return img.crop(r), r


def elegir_por_caja(puntajes: np.ndarray, mascaras: list[np.ndarray], area_caja: float) -> int:
    """Regla única para indicaciones de caja: la de mayor puntaje entre las que llenan ≥ 50 % de la caja; si ninguna,
    la de mayor puntaje (SAM a veces prefiere una parte pequeña bien definida, como un rótulo)."""
    validas = [k for k, m in enumerate(mascaras) if m.sum() >= 0.5 * area_caja]
    return max(validas or range(len(mascaras)), key=lambda k: float(puntajes[k]))


def afinar_caja(sam: Sam, img, caja_frac: tuple[float, float, float, float], holgura: float = 0.0):
    """Máscara de SAM para la caja (fracciones). `holgura` agranda la caja esa fracción del ancho de la hoja por cada
    lado (lo mismo en metros en el alto): SAM sigue las líneas de dentro de la caja, y una caja corta pierde un borde."""
    W, H = img.size
    hx, hy = holgura * W, holgura * W
    x0, y0 = max(0.0, caja_frac[0] * W - hx), max(0.0, caja_frac[1] * H - hy)
    x1, y1 = min(W, caja_frac[2] * W + hx), min(H, caja_frac[3] * H + hy)
    rec, (rx, ry, _, _) = recorte_de_caja(img, (x0, y0, x1, y1))
    sam.codificar(rec)
    p, logits = sam.caja(x0 - rx, y0 - ry, x1 - rx, y1 - ry)
    mascaras = [sam.mascara(logits[k]) for k in range(len(p))]
    k = elegir_por_caja(p, mascaras, (x1 - x0) * (y1 - y0))
    return en_hoja(mascaras[k], (rx, ry), W, H), float(p[k])


# ---------------------------------------------------------------------------------------------------------------
# Modo automático.

def mosaicos(W: int, H: int, columnas: int, filas: int, solape: float = 0.5) -> list[tuple[int, int, int, int]]:
    """Trozos de la hoja que se solapan `solape` de su lado (1 × 1 = la hoja entera)."""
    tw = W / (columnas - (columnas - 1) * solape) if columnas > 1 else W
    th = H / (filas - (filas - 1) * solape) if filas > 1 else H
    salida = []
    for j in range(filas):
        for i in range(columnas):
            x0, y0 = int(i * tw * (1 - solape)), int(j * th * (1 - solape))
            salida.append((x0, y0, min(W, int(x0 + tw)), min(H, int(y0 + th))))
    return salida


def candidatos_auto(sam: Sam, img, n: int = 32, columnas: int = 1, filas: int = 1) -> list[dict]:
    """Rejilla n × n en cada trozo (o en la hoja entera); las tres máscaras de cada punto, filtradas por puntaje y
    estabilidad, sin repetidas (NMS en el trozo y luego entre trozos). Una máscara que toca el borde de su trozo
    está cortada: se marca `toca_borde`."""
    import cv2
    from shapely.geometry import Polygon

    W, H = img.size
    elegidos: list[dict] = []
    for (tx0, ty0, tx1, ty1) in mosaicos(W, H, columnas, filas):
        trozo = img.crop((tx0, ty0, tx1, ty1))
        tw, th = trozo.size
        sam.codificar(trozo)
        xs = (np.arange(n) + 0.5) / n
        xy = np.array([[x * tw, y * th] for y in xs for x in xs], np.float32)
        crudos = []
        for (p, logits), q in zip(sam.puntos(xy), xy):
            for k in range(len(p)):
                lg = logits[k]
                fuerte, debil = (lg > 1).sum(), (lg > -1).sum()
                est = fuerte / debil if debil else 0.0
                if p[k] >= PUNTAJE_MIN and est >= ESTABILIDAD_MIN and fuerte > 0:
                    crudos.append({"puntaje": float(p[k]), "estabilidad": float(est), "baja": lg > 0, "logits": lg})
        crudos.sort(key=lambda c: -c["puntaje"])
        del_trozo: list[dict] = []
        for c in crudos:
            if all(_iou_mascara(c["baja"], e["baja"]) < NMS_IOU for e in del_trozo):
                del_trozo.append(c)
        for c in del_trozo:
            m = sam.mascara(c.pop("logits"))
            c.pop("baja")
            cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not cs:
                continue
            cmax = max(cs, key=cv2.contourArea)
            a = cv2.contourArea(cmax)
            hull = cv2.contourArea(cv2.convexHull(cmax))
            (_, _), (rw, rh), _ = cv2.minAreaRect(cmax)
            x, y, w, h = cv2.boundingRect(cmax)
            c["solidez"] = a / hull if hull else 0.0
            c["alargamiento"] = max(rw, rh) / max(min(rw, rh), 1.0)
            c["toca_borde"] = bool(x <= 2 or y <= 2 or x + w >= tw - 2 or y + h >= th - 2)
            c["fraccion"] = float(m.sum()) / (W * H)
            c["trozo"] = [tx0, ty0, tx1, ty1]
            c["puntos"] = en_hoja(m, (tx0, ty0), W, H)
            if c["puntos"]:
                elegidos.append(c)
    # Entre trozos: la misma región vista dos veces se queda con la de mayor puntaje que no toca el borde.
    elegidos.sort(key=lambda c: (c["toca_borde"], -c["puntaje"]))
    finales: list[dict] = []
    for c in elegidos:
        pc = Polygon(c["puntos"]).buffer(0)
        if all(_iou_pol(pc, Polygon(e["puntos"]).buffer(0)) < NMS_IOU for e in finales):
            finales.append(c)
    return finales


def _iou_mascara(a: np.ndarray, b: np.ndarray) -> float:
    u = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / u) if u else 0.0


def clasificar_auto(cands: list[dict]) -> tuple[list[tuple[str, list, float, str]], dict]:
    """Heurística simple. Lote: el cuadrilátero lleno (≤ 8 vértices, solidez ≥ 0.93) más grande entre 2 % y 40 % de la
    hoja que no toca el borde. Huella: la máscara más grande dentro del lote (≥ 30 % de su área) que no sea el lote.
    Todo lo demás se descarta (se cuenta en el resumen)."""
    from shapely.geometry import Polygon

    def pol(c):
        p = Polygon(c["puntos"])
        return p if p.is_valid else p.buffer(0)

    cuad = [c for c in cands if 0.02 <= c["fraccion"] <= 0.40 and len(c["puntos"]) <= 8 and c.get("solidez", 0) >= 0.93
            and not c.get("toca_borde")]
    cuad.sort(key=lambda c: -c["fraccion"])
    resumen = {"mascaras": len(cands), "cuadrilateros_grandes": len(cuad)}
    salida = []
    if not cuad:
        return salida, resumen
    lote = cuad[0]
    pl = pol(lote)
    salida.append(("lote", lote["puntos"], lote["puntaje"], f"SAM auto: cuadrilátero mayor ({len(cuad)} candidatos)"))
    dentro = [c for c in cands if c is not lote and pol(c).area >= 0.3 * pl.area
              and pol(c).intersection(pl).area >= 0.9 * pol(c).area and _iou_pol(pol(c), pl) < 0.95]
    if dentro:
        h = max(dentro, key=lambda c: pol(c).area)
        salida.append(("huella", h["puntos"], h["puntaje"], "SAM auto: mayor máscara dentro del lote"))
    else:
        salida.append(("huella", lote["puntos"], lote["puntaje"] * 0.8,
                       "SAM auto: sin máscara interior; huella = contorno del lote (entre medianeras)"))
    return salida, resumen


def _iou_pol(a, b) -> float:
    u = a.union(b).area
    return a.intersection(b).area / u if u else 0.0


# ---------------------------------------------------------------------------------------------------------------
# Acera derivada del lote.

def cuatro_lados(v: np.ndarray) -> np.ndarray:
    """El contorno del lote reducido a un cuadrilátero (simplificación creciente; si no llega a 4, el rectángulo mínimo):
    la acera va por fuera de un lado entero, no de un tramo del contorno."""
    import cv2

    c = v.astype(np.float32).reshape(-1, 1, 2)
    per = cv2.arcLength(c, True)
    for eps in (0.01, 0.02, 0.03, 0.05, 0.08):
        a = cv2.approxPolyDP(c, eps * per, True).reshape(-1, 2)
        if len(a) <= 4:
            return a.astype(float) if len(a) == 4 else cv2.boxPoints(cv2.minAreaRect(c)).astype(float)
    return cv2.boxPoints(cv2.minAreaRect(c)).astype(float)


def acera_desde_lote(sam: Sam, img, lote: list[list[float]], grosor: float = 0.012):
    """Para cada lado del lote, una caja de `grosor` (fracción de la altura de la hoja) por fuera del lado. Se queda con
    la máscara más «franja»: largo ≥ 60 % del lado, alargamiento ≥ 8 y que llene ≥ 40 % de la caja."""
    import cv2

    W, H = img.size
    v = cuatro_lados(np.array(lote) * [W, H])
    centro = v.mean(axis=0)
    g = grosor * H
    mejores = []
    for i in range(len(v)):
        a, b = v[i], v[(i + 1) % len(v)]
        lado = b - a
        largo = float(np.hypot(*lado))
        if largo < 0.1 * min(W, H):
            continue
        normal = np.array([lado[1], -lado[0]]) / largo
        if np.dot((a + b) / 2 - centro, normal) < 0:
            normal = -normal
        franja = np.array([a, b, b + normal * g, a + normal * g])
        x0, y0 = franja.min(axis=0)
        x1, y1 = franja.max(axis=0)
        rec, (rx, ry, rx1, ry1) = recorte_de_caja(img, (x0, y0, x1, y1), margen=0.05)
        sam.codificar(rec)
        p, logits = sam.caja(x0 - rx, y0 - ry, x1 - rx, y1 - ry)
        for k in range(len(p)):
            m = sam.mascara(logits[k])
            cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not cs:
                continue
            c = max(cs, key=cv2.contourArea)
            (_, _), (rw, rh), _ = cv2.minAreaRect(c)
            larg = max(rw, rh) / max(min(rw, rh), 1.0)
            llena = cv2.contourArea(c) / max(largo * g, 1.0)
            if max(rw, rh) >= 0.6 * largo and larg >= 8 and llena >= 0.4:
                pts = en_hoja(m, (rx, ry), W, H)
                if pts:
                    mejores.append((float(p[k]), i, pts, round(llena, 2), round(larg, 1)))
    if not mejores:
        return None, []
    mejores.sort(key=lambda t: -t[0])
    return mejores[0], [(m[0], m[1], m[3], m[4]) for m in mejores]


# ---------------------------------------------------------------------------------------------------------------

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--pagina", type=int, default=1)
    ap.add_argument("--miniatura", help="p<N>.png de la extracción (fija el giro de la hoja escaneada)")
    ap.add_argument("--modelo", required=True, help="carpeta con los .onnx de SAM 2.1")
    ap.add_argument("--salida", required=True)
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--cajas", help="regiones.json cuyas cajas se afinan con SAM")
    modo.add_argument("--auto", action="store_true", help="rejilla de puntos sin indicaciones")
    ap.add_argument("--tipos", default="lote,huella", help="modo cajas: tipos que se afinan (los demás se copian)")
    ap.add_argument("--holgura", type=float, default=0.02, help="modo cajas: agranda cada caja (fracción del ancho)")
    ap.add_argument("--acera", action="store_true", help="propone la acera a partir del lote")
    ap.add_argument("--rejilla", type=int, default=32)
    ap.add_argument("--mosaico", default="1x1", help="modo auto: columnas x filas de trozos solapados (p. ej. 2x2)")
    a = ap.parse_args(argv)

    import pymupdf

    t0 = time.time()
    salida = Path(a.salida)
    salida.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(a.pdf)
    pag = doc[a.pagina - 1]
    hoja = Hoja(pag, a.pagina, True, _giro_escaneada(pag, Path(a.miniatura) if a.miniatura else None))
    img = hoja.imagen(DPI_REGIONES)
    img.save(salida / f"r{a.pagina}.png")
    W, H = img.size
    sam = Sam(Path(a.modelo))
    t_carga = time.time() - t0
    nuevas: list[dict] = []
    informe: dict = {"modo": "auto" if a.auto else "cajas"}
    if a.auto:
        cols, fil = (int(x) for x in a.mosaico.lower().split("x"))
        cands = candidatos_auto(sam, img, a.rejilla, cols, fil)
        clases, informe["resumen"] = clasificar_auto(cands)
        for tipo, pts, conf, et in clases:
            nuevas.append(region(a.pagina, tipo, pts, "vision", conf, et))
        informe["candidatos"] = [{k: c.get(k) for k in ("puntaje", "estabilidad", "fraccion", "solidez", "alargamiento",
                                                         "toca_borde", "puntos")} for c in cands]
    else:
        previa = json.loads(Path(a.cajas).read_text(encoding="utf-8"))
        tipos = set(a.tipos.split(","))
        informe["afinadas"] = []
        for r in previa.get("regiones", []):
            if r.get("pagina") != a.pagina:
                continue
            if r["tipo"] not in tipos:
                nuevas.append(region(a.pagina, r["tipo"], r["puntos"], "vision", r.get("confianza", 0.5),
                                     (r.get("etiqueta") or "") + " (sin afinar)"))
                continue
            pts, p = afinar_caja(sam, img, _caja(r["puntos"]), a.holgura)
            razon = _area(pts) / max(_area(r["puntos"]), 1e-9) if pts else 0.0
            informe["afinadas"].append({"tipo": r["tipo"], "puntaje": round(p, 3), "razon_area": round(razon, 3)})
            nuevas.append(region(a.pagina, r["tipo"], pts or r["puntos"], "vision", p,
                                 f"SAM sobre la caja de «{r.get('etiqueta') or r['tipo']}»"))
    if a.acera:
        lote = next((r for r in nuevas if r["tipo"] == "lote"), None)
        if lote is None:
            informe["acera"] = "sin lote: no se intenta"
        else:
            nuevas = [r for r in nuevas if r["tipo"] != "acera"]
            mejor, todas = acera_desde_lote(sam, img, lote["puntos"])
            informe["acera"] = {"candidatas": todas}
            if mejor:
                nuevas.append(region(a.pagina, "acera", mejor[2], "vision", mejor[0], f"SAM: franja fuera del lado {mejor[1]} del lote"))
    usados: set = set()
    for r in nuevas:
        r["id"] = _id(r["pagina"], r["tipo"], r["puntos"], usados)
    resultado = {"version": VERSION, "generado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                 "paginas": {str(a.pagina): {"imagen": f"r{a.pagina}.png", "ancho_px": W, "alto_px": H,
                                             "ancho_mm": round(hoja.ancho_pt / PT_POR_MM, 1),
                                             "alto_mm": round(hoja.alto_pt / PT_POR_MM, 1), "escala": None}},
                 "regiones": nuevas}
    (salida / "regiones.json").write_text(json.dumps(resultado, ensure_ascii=False, indent=1), encoding="utf-8")
    informe.update({"segundos_total": round(time.time() - t0, 1), "segundos_carga_y_render": round(t_carga, 1),
                    "codificaciones": sam.codificaciones, "memoria_mb_pico": memoria_mb()[1]})
    (salida / "informe-sam.json").write_text(json.dumps(informe, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in informe.items() if k != "candidatos"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
