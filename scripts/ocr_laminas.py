#!/usr/bin/env python3
"""OCR de las láminas escaneadas de un PDF para las herramientas de DeepSeek (buscar_texto y texto_pagina), con caché.

Para cada lámina pedida (o todas las que no tienen texto vectorial) corre el mismo lector que usa el extractor
(precheck.planos.lineas.lineas_ocr: Tesseract con detección de orientación) y guarda `<cache>/ocr_p<N>.json`:
[{"t": texto de la línea, "x", "y", "w", "h": fracciones 0–1 de la hoja enderezada, "c": confianza}]. Una lámina ya en
caché no se vuelve a leer. Imprime un JSON con las láminas leídas y cuántas líneas tiene cada una.

Uso: python scripts/ocr_laminas.py <pdf> <carpeta_cache> [pagina ...]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pymupdf

RAIZ = Path(__file__).resolve().parents[1]
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))


def ocr_pagina(doc, numero: int, cache: Path) -> list[dict]:
    """Líneas OCR de la lámina `numero` (1-based), desde la caché si existe."""
    ruta = cache / f"ocr_p{numero}.json"
    if ruta.exists():
        return json.loads(ruta.read_text(encoding="utf-8"))
    from precheck.planos.lineas import lineas_ocr  # noqa: PLC0415

    lineas, _img, ancho, alto = lineas_ocr(doc[numero - 1], numero)
    salida = [
        {"t": ln.texto, "x": round(ln.bbox[0] / ancho, 3), "y": round(ln.bbox[1] / alto, 3),
         "w": round((ln.bbox[2] - ln.bbox[0]) / ancho, 3), "h": round((ln.bbox[3] - ln.bbox[1]) / alto, 3), "c": ln.confianza}
        for ln in lineas if ln.texto.strip()
    ]
    cache.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(salida, ensure_ascii=False), encoding="utf-8")
    return salida


def main(argv=None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) < 2:
        print(__doc__)
        return 2
    pdf, cache = args[0], Path(args[1])
    doc = pymupdf.open(pdf)
    pedidas = [int(a) for a in args[2:]] or [i + 1 for i, pg in enumerate(doc) if not pg.get_text("words")]
    hechas = {}
    for n in pedidas:
        if 1 <= n <= len(doc):
            hechas[n] = len(ocr_pagina(doc, n, cache))
    print(json.dumps({"laminas": hechas, "cache": str(cache)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
