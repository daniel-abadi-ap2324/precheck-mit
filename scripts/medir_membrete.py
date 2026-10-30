#!/usr/bin/env python3
"""Mide el ancho de la franja del membrete (sellos y firma) de cada lámina, para el dato
`plano.pie_descriptivo.franja_sellos_ancho_m` (Acuerdo 110, Anexo III, num. 11: «Franja corrida de 0.10 m en la parte
inferior o lateral derecho»).

Antes, cada modelo de IA estimaba el ancho a ojo y las corridas daban 0.086, 0.09, 0.10 o 0.11 m sobre la misma lámina,
lo que cambiaba el resultado de la regla. Esta medida es determinista: busca las líneas largas del marco cerca del borde
derecho (franja lateral) y del borde inferior (franja inferior) en la miniatura de cada página y mide la distancia entre
la línea del marco y la línea interior de la franja, en milímetros reales (con el tamaño de la hoja de extraccion.json).

Uso:
  python scripts/medir_membrete.py <carpeta del caso>     (lee extraccion.json y las miniaturas p<N>.png)
Imprime un JSON: por página, el lado de la franja y su ancho en metros; y el ancho mínimo entre las láminas que la tienen.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

#: Fracción del lado de la hoja que debe cubrir una línea (en píxeles oscuros, no necesariamente seguidos: en las láminas
#: escaneadas las líneas del marco salen cortadas) para contar como línea del marco o de la franja.
LARGO_MIN = 0.55
#: Solo se buscan las líneas en esta fracción de la hoja junto al borde (la franja nunca pasa de un 20 % del ancho).
ZONA_BORDE = 0.25
#: Ancho mínimo y máximo plausible de una franja de membrete, en mm.
FRANJA_MM = (30.0, 200.0)


def _lineas(perfil: np.ndarray, largo: int) -> list[int]:
    """Posiciones (centro de cada grupo de columnas/filas contiguas) donde el trazo oscuro recorre al menos `largo` px."""
    idx = np.where(perfil >= largo)[0]
    grupos: list[list[int]] = []
    for i in idx:
        if grupos and i - grupos[-1][-1] <= 2:
            grupos[-1].append(int(i))
        else:
            grupos.append([int(i)])
    return [int(round(sum(g) / len(g))) for g in grupos]


def franja(img: np.ndarray, ancho_mm: float, alto_mm: float) -> dict | None:
    """{'lado', 'ancho_m', 'lineas_px'} de la franja del membrete de una página, o None si no se distingue."""
    oscuro = img < 128
    alto, ancho = oscuro.shape
    mm_px_x, mm_px_y = ancho_mm / ancho, alto_mm / alto
    candidatos = []
    # Franja lateral derecha: líneas verticales largas en el cuarto derecho.
    x0 = int(ancho * (1 - ZONA_BORDE))
    perfil_v = oscuro[:, x0:].sum(axis=0)
    xs = [x0 + x for x in _lineas(perfil_v, int(alto * LARGO_MIN))]
    if len(xs) >= 2:
        candidatos.append(("derecha", xs, mm_px_x))
    # Franja inferior: líneas horizontales largas en el cuarto inferior.
    y0 = int(alto * (1 - ZONA_BORDE))
    perfil_h = oscuro[y0:, :].sum(axis=1)
    ys = [y0 + y for y in _lineas(perfil_h, int(ancho * LARGO_MIN))]
    if len(ys) >= 2:
        candidatos.append(("inferior", ys, mm_px_y))
    mejores = []
    for lado, pos, mm_px in candidatos:
        marco = pos[-1]  # la línea más cercana al borde es el marco
        for interior in reversed(pos[:-1]):
            mm = (marco - interior) * mm_px
            if FRANJA_MM[0] <= mm <= FRANJA_MM[1]:
                # Se redondea a 5 mm: es la precisión de la miniatura (±2 mm) más el grosor de las líneas. Una franja dibujada
                # de 10 cm (Tocumen: 98–100 mm entre bordes de línea en el PDF vectorial) da 0.10, y una de 9 cm, 0.09.
                mejores.append({"lado": lado, "ancho_m": round(mm / 5) * 5 / 1000, "ancho_mm_medido": round(mm, 1), "lineas_px": [interior, marco]})
                break
    if not mejores:
        return None
    # Si hay franja a la derecha y abajo, la del membrete es la más ancha (la otra suele ser solo el margen del marco).
    return max(mejores, key=lambda m: m["ancho_m"])


def medir(carpeta: Path) -> dict:
    ext = json.loads((carpeta / "extraccion.json").read_text(encoding="utf-8"))
    paginas = []
    for p in ext.get("paginas", []):
        png = carpeta / (p.get("miniatura") or f"p{p['numero']}.png")
        img = cv2.imread(str(png), cv2.IMREAD_GRAYSCALE) if png.exists() else None
        if img is None or not p.get("ancho_mm") or not p.get("alto_mm"):
            paginas.append({"pagina": p["numero"], "franja": None, "motivo": "sin miniatura o sin tamaño de hoja"})
            continue
        f = franja(img, float(p["ancho_mm"]), float(p["alto_mm"]))
        paginas.append({"pagina": p["numero"], "franja": f, **({} if f else {"motivo": "no se distingue una franja de membrete"})})
    anchos = [x["franja"]["ancho_m"] for x in paginas if x["franja"]]
    return {
        "dato": "plano.pie_descriptivo.franja_sellos_ancho_m",
        "ancho_min_m": min(anchos) if anchos else None,
        "laminas_medidas": len(anchos),
        "metodo": "líneas del marco en la miniatura (scripts/medir_membrete.py), escala por el tamaño de la hoja; redondeado a 5 mm",
        "paginas": paginas,
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    print(json.dumps(medir(Path(sys.argv[1])), ensure_ascii=False, indent=1))
