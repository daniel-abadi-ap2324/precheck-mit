#!/usr/bin/env python3
"""Banco local, sin IA, de la lectura de planos escaneados: OCR de la hoja entera (lo que hoy ven buscar_texto y
texto_pagina) contra leer_zona en mosaico (precheck/planos/ocr_zona.py).

Referencia: lo que leyeron las corridas de Claude en esos planos (lote.json de cada PreCheck terminado), solo los datos
del plano con lámina, método lectura o visión, confianza ≥ 0.85 y el valor que más se repite. De ellos se prueban los que
se pueden buscar como texto sin ambigüedad: números de 3 cifras o más (733.14, 27.41, 1:100) y algunos textos impresos
(finca, corregimiento, orden de conservación). Un 0, un 4 o «arquitectura» no se prueban: no son texto que el OCR tenga
que leer tal cual.

Para cada valor se mira si aparece en el texto de su lámina: antes (OCR de la hoja a 150 ppp, scripts/ocr_laminas.py)
y después (leer_zona sobre un mosaico de 3×3 zonas con solape, primero solo Tesseract y luego también RapidOCR).

Uso: python scripts/banco_ocr_zona.py <carpeta web/.data> <salida.json> [--plan plan-xxxx=Nombre ...] [--cache DIR]
"""
from __future__ import annotations

import argparse
import collections
import glob
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

#: Textos impresos que se prueban (el resto de los datos de texto son interpretación, no lectura).
CLAVES_TEXTO = {"lote.finca", "lote.corregimiento", "lote.orden_conservacion"}
MOSAICO = 3
SOLAPE = 0.08


def _hojas(nodo, ruta=""):
    if isinstance(nodo, dict) and "valor" in nodo:
        yield ruta, nodo
    elif isinstance(nodo, dict):
        for k, v in nodo.items():
            yield from _hojas(v, f"{ruta}.{k}" if ruta else k)


def referencia(datos: str, planes: dict[str, str]) -> list[dict]:
    """Valores de referencia por plano y lámina: el más votado entre las corridas de Claude, si lo escribe al menos la
    cuarta parte de ellas (y dos como mínimo). Se cuenta por nombre de plano: el mismo PDF subido dos veces (Ancón) son dos
    planes con las mismas láminas; se lee el primero."""
    votos: dict = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    corridas: collections.Counter = collections.Counter()
    primero: dict[str, str] = {}
    for d in glob.glob(os.path.join(datos, "prechecks", "pck-*")):
        try:
            estado = json.load(open(os.path.join(d, "estado.json"), encoding="utf-8"))
            lote = json.load(open(os.path.join(d, "lote.json"), encoding="utf-8"))
        except (OSError, ValueError):
            continue
        ia = estado.get("ia") or {}
        plan = next((p for p in estado.get("planIds", []) if p in planes), None)
        if not plan or not str(ia.get("modelo") or "").startswith("claude") or ia.get("status") != "done":
            continue
        nombre = planes[plan]
        primero.setdefault(nombre, min(p for p, n in planes.items() if n == nombre))
        corridas[nombre] += 1
        for clave, h in _hojas(lote):
            f, v = h.get("fuente") or {}, h.get("valor")
            if f.get("metodo") not in ("lectura", "vision") or not isinstance(f.get("pagina"), int) or (h.get("confianza") or 0) < 0.85:
                continue
            if isinstance(v, bool) or not isinstance(v, (int, float, str)):
                continue
            votos[nombre][(clave, f["pagina"])][v] += 1
    salida = []
    for nombre, por_clave in votos.items():
        for (clave, pagina), c in sorted(por_clave.items()):
            valor, n = c.most_common(1)[0]
            if n >= max(2, corridas[nombre] / 4) and patron(clave, valor):
                salida.append({"plan": primero[nombre], "plano": nombre, "clave": clave, "pagina": pagina, "valor": valor,
                               "votos": n, "corridas": corridas[nombre]})
    return salida


def patron(clave: str, valor) -> re.Pattern | None:
    """Expresión que encuentra el valor en el texto del OCR, o None si el valor no se puede buscar sin ambigüedad."""
    if isinstance(valor, str):
        if clave not in CLAVES_TEXTO or len(valor) < 3:
            return None
        # Sin tildes: el membrete dice «ANCON» y el dato es «Ancón».
        return re.compile(re.escape(_sin_tildes(valor)), re.IGNORECASE)
    if clave.endswith("escala_denominador"):
        return re.compile(rf"1\s*[:/]\s*{int(valor)}(?![\d])")
    texto = f"{valor:.3f}".rstrip("0").rstrip(".") if isinstance(valor, float) else str(valor)
    if sum(ch.isdigit() for ch in texto) < 3:
        return None
    entero, _, dec = texto.partition(".")
    cuerpo = re.escape(entero) + (rf"[.,]{dec}0*" if dec else r"(?:[.,]0+)?")
    # Admite un «0,» de miles delante: el cuadro de Ancón escribe «0 HAS + 0,500.00 m2».
    return re.compile(rf"(?:(?<![\d.,])|(?<=\b0[.,])){cuerpo}(?![\d])")


def _sin_tildes(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()


def _sin_espacios_en_numeros(texto: str) -> str:
    """«733. 14» y «733 .14» del OCR → «733.14»; sin tildes, para comparar textos."""
    return _sin_tildes(re.sub(r"(\d)\s*([.,])\s*(\d)", r"\1\2\3", texto))


def hallado(rx: re.Pattern, textos: list[str]) -> bool:
    return any(rx.search(_sin_espacios_en_numeros(t)) for t in textos)


def teselas(n: int = MOSAICO, solape: float = SOLAPE) -> list[tuple[float, float, float, float]]:
    paso = 1 / n
    return [(max(0.0, c * paso - solape), max(0.0, f * paso - solape), min(1.0, (c + 1) * paso + solape), min(1.0, (f + 1) * paso + solape))
            for f in range(n) for c in range(n)]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("datos", help="carpeta web/.data (prechecks y planos)")
    ap.add_argument("salida")
    ap.add_argument("--plan", action="append", default=[], help="plan-xxxx=Nombre (prefijo del id del plan)")
    ap.add_argument("--cache", default=None, help="carpeta para la caché del OCR de la hoja (por defecto, junto a la salida)")
    a = ap.parse_args(argv)
    import pymupdf  # noqa: PLC0415

    from precheck.planos.ocr_zona import leer_zona  # noqa: PLC0415
    from scripts.ocr_laminas import ocr_pagina  # noqa: PLC0415

    prefijos = dict(p.split("=", 1) for p in a.plan)
    planes = {}
    for d in glob.glob(os.path.join(a.datos, "planos", "plan-*")):
        nombre = next((v for k, v in prefijos.items() if os.path.basename(d).startswith(k)), None)
        if nombre:
            planes[os.path.basename(d)] = nombre
    ref = referencia(a.datos, planes)
    cache_base = Path(a.cache or Path(a.salida).with_suffix("")) / "ocr"
    por_lamina = collections.defaultdict(list)
    for r in ref:
        por_lamina[(r["plan"], r["pagina"])].append(r)
    tiempos = {}
    for (plan, pagina), valores in sorted(por_lamina.items()):
        pdf = os.path.join(a.datos, "planos", plan, "original.pdf")
        doc = pymupdf.open(pdf)
        if doc[pagina - 1].get_text("words"):
            for r in valores:
                r["omitido"] = "lámina vectorial"
            continue
        t = time.time()
        hoja = [ln["t"] for ln in ocr_pagina(doc, pagina, cache_base / plan)]
        t_hoja = time.time() - t
        t = time.time()
        tesseract, rapid, confs = [], [], {}
        for z in teselas():
            lec = leer_zona(doc, pagina, z, tesseract_de_respaldo=False)
            tesseract += [" ".join(t for t, _ in l["palabras"]) for l in lec.lineas()]
            rapid += [p.t for p in lec.segundo_lector]
            for p in lec.palabras:
                confs[p.t] = max(confs.get(p.t, 0), p.c)
        t_zona = time.time() - t
        tiempos[f"{planes[plan]} p{pagina}"] = {"hoja_s": round(t_hoja, 1), "mosaico_s": round(t_zona, 1)}
        for r in valores:
            rx = patron(r["clave"], r["valor"])
            r["antes_hoja"] = hallado(rx, hoja)
            r["despues_tesseract"] = hallado(rx, tesseract)
            r["despues_rapidocr"] = hallado(rx, rapid)
            r["despues"] = r["despues_tesseract"] or r["despues_rapidocr"]
            r["confianza_tesseract"] = max((c for w, c in confs.items() if rx.search(_sin_espacios_en_numeros(w))), default=None)
        print(f"{planes[plan]} p{pagina}: {sum(r['antes_hoja'] for r in valores)}→{sum(r['despues'] for r in valores)} de {len(valores)} "
              f"({t_hoja:.0f} s hoja, {t_zona:.0f} s mosaico)", flush=True)
    probados = [r for r in ref if "omitido" not in r]
    resumen = {k: sum(r[k] for r in probados) for k in ("antes_hoja", "despues_tesseract", "despues_rapidocr", "despues")}
    json.dump({"total": len(probados), "resumen": resumen, "tiempos": tiempos, "valores": ref}, open(a.salida, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(json.dumps({"total": len(probados), **resumen}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
