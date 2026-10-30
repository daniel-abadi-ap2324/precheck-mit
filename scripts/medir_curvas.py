#!/usr/bin/env python3
"""Equidistancia de las curvas de nivel de un plano vectorial, para el dato `plano.intervalo_curvas_nivel_m`.

Las corridas de la IA no la leían bien: en Panamá Norte veían solo los rótulos pares (cada 2 m) y no los impares
intercalados (cada 1 m); en Bella Vista no veían las dos únicas curvas («30.00» y «30.30»). Esta medida es determinista y
combina dos vías:

1. Serie de rótulos del texto del PDF. Las curvas se rotulan con su cota y un decimal («67.0», «71.0»), muchas veces
   repetida a lo largo de la curva. Se toman los rótulos de esa forma de cada lámina, se busca la serie de cotas distintas
   con pasos de hasta 5 m, y la equidistancia es el paso más chico que se repite (al menos 3 veces seguidas).
2. Rótulos sobre las curvas dibujadas (cuando la serie no aparece, por ejemplo con solo dos curvas o rótulos con dos
   decimales). Una curva de nivel es un trazo sin relleno, largo y suave (muchos segmentos con giros chicos). Un rótulo
   es un número con 1–2 decimales, solo en su línea, o un glifo vectorial (texto convertido a trazos sobre una máscara
   blanca, como exporta AutoCAD) leído con RapidOCR si está instalado. Se acepta solo si una curva lo atraviesa o termina
   en su borde y corre paralela a él; así no se confunden con las cotas («1.50», «2.50»), que van junto a líneas rectas.
   Con dos cotas distintas basta: la equidistancia es el paso entre ellas (todas deben caer en esa retícula).

Límites (por eso es una ayuda y no la última palabra): no mide planos escaneados; si las curvas están explotadas en
segmentos sueltos y no hay serie en el texto, no las ve; sin RapidOCR no lee los rótulos vectoriales. Si no halla nada,
lo dice y la IA mira la lámina con el criterio.

Uso: python scripts/medir_curvas.py <plano.pdf>
"""
from __future__ import annotations

import importlib.util
import json
import logging
import math
import re
import sys
from collections import Counter
from pathlib import Path

ROTULO_CURVA = re.compile(r"^\d{1,3}\.0$")
ROTULO_NUMERICO = re.compile(r"^\d{1,3}[.,]\d{1,2}$")
PASO_MAX = 5.0
PASO_MIN = 0.1
REPETICIONES_MIN = 3

# Curva de nivel dibujada: trazo sin relleno, con muchos segmentos, largo respecto del rótulo y suave.
CURVA_SEGMENTOS_MIN = 8
CURVA_GIRO_MEDIO_MAX = 20.0      # grados por vértice
CURVA_GIRO_MAX = 60.0            # grados en un solo vértice
CURVA_GIRO_TOTAL_MIN = 15.0      # grados: una recta no es curva
CURVA_LARGO_EN_ALTURAS = 15      # longitud mínima de la curva en alturas de rótulo
ROTULO_PARALELO_MAX = 25.0       # grados entre el rótulo y la tangente de la curva
ROTULO_HOLGURA_EN_ALTURAS = 0.5  # la curva debe tocar la caja del rótulo ampliada esta fracción de su altura
CORTE_HOLGURA_EN_ALTURAS = 1.0   # si la curva se corta para el rótulo, su extremo queda a menos de una altura de él
MASCARA_LADO_MAX = 150.0         # pt: una máscara de rótulo es chica
GLIFOS_MIN = 2
RECTA_ITEMS_MAX = 4              # una línea de cota es un trazo suelto (línea, con o sin extensiones), no una curva
LINEA_COTA_EN_ALTURAS = 1.5      # la línea de cota va pegada al texto: a menos de esta fracción de su altura
OCR_ZOOM = 4
IMAGEN_ESCANEO_MIN = 0.5         # fracción de la lámina que cubre la imagen de un escaneo


def serie(valores: list[float]) -> dict | None:
    """La serie de cotas de curvas y su equidistancia, o None si los valores no forman una serie."""
    unicos = sorted(set(valores))
    if len(unicos) < REPETICIONES_MIN + 1:
        return None
    difs = [round(b - a, 2) for a, b in zip(unicos, unicos[1:])]
    pasos = Counter(d for d in difs if 0 < d <= PASO_MAX)
    validos = sorted(p for p, n in pasos.items() if n >= REPETICIONES_MIN)
    if not validos:
        return None
    paso = validos[0]
    con_paso = [(a, b) for a, b, d in zip(unicos, unicos[1:], difs) if d == paso]
    return {"equidistancia_m": paso, "desde": con_paso[0][0], "hasta": con_paso[-1][1],
            "otros_pasos": {str(p): n for p, n in pasos.items() if p != paso}}


def paso_entre(valores: list[float]) -> dict | None:
    """Equidistancia entre cotas de curvas aceptadas por geometría: el paso más chico entre cotas distintas, siempre que
    todas caigan en esa retícula (así «1.50» y «2.37» no dan un paso). Bastan dos cotas."""
    unicos = sorted(set(round(v, 2) for v in valores))
    if len(unicos) < 2:
        return None
    paso = min(round(b - a, 2) for a, b in zip(unicos, unicos[1:]))
    if not PASO_MIN <= paso <= PASO_MAX:
        return None
    if any(abs(v / paso - round(v / paso)) > 0.02 for v in unicos):
        return None
    return {"equidistancia_m": paso, "desde": unicos[0], "hasta": unicos[-1], "cotas": unicos}


# --- geometría -------------------------------------------------------------------------------------------------------

def _segmentos(dibujo: dict, M) -> list[tuple]:
    """Segmentos (a, b) del trazo en coordenadas de la página rotada (las curvas Bézier, por sus extremos)."""
    import pymupdf  # noqa: PLC0415

    segs = []
    for it in dibujo["items"]:
        if it[0] == "l":
            segs.append((pymupdf.Point(it[1]) * M, pymupdf.Point(it[2]) * M))
        elif it[0] == "c":
            segs.append((pymupdf.Point(it[1]) * M, pymupdf.Point(it[4]) * M))
        elif it[0] == "re":
            r = pymupdf.Rect(it[1]) * M
            segs += [(r.tl, r.tr), (r.tr, r.br), (r.br, r.bl), (r.bl, r.tl)]
        elif it[0] == "qu":
            q = pymupdf.Quad(it[1]) * M
            segs += [(q.ul, q.ur), (q.ur, q.lr), (q.lr, q.ll), (q.ll, q.ul)]
    return segs


def _forma(segs: list[tuple]) -> tuple[float, float, float, float]:
    """(longitud, giro total, giro medio por vértice, giro máximo) en pt y grados."""
    largo = giro = giro_max = 0.0
    n = 0
    prev = None
    for a, b in segs:
        d = abs(b - a)
        largo += d
        if d < 1e-6:
            continue
        ang = math.atan2(b.y - a.y, b.x - a.x)
        if prev is not None:
            g = math.degrees(abs((ang - prev + math.pi) % (2 * math.pi) - math.pi))
            giro += g
            giro_max = max(giro_max, g)
            n += 1
        prev = ang
    return largo, giro, giro / n if n else 0.0, giro_max


def _cruzan(a, b, c, d) -> bool:
    def o(p, q, r):
        return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
    return o(a, b, c) * o(a, b, d) < 0 and o(c, d, a) * o(c, d, b) < 0


def _toca(rect, a, b) -> bool:
    """True si el segmento entra en el rectángulo o lo cruza."""
    if rect.contains(a) or rect.contains(b):
        return True
    bordes = [(rect.tl, rect.tr), (rect.tr, rect.br), (rect.br, rect.bl), (rect.bl, rect.tl)]
    return any(_cruzan(a, b, c, d) for c, d in bordes)


def _angulo(a, b) -> float:
    """Dirección de a→b en grados, módulo 180 (un rótulo se lee igual al derecho o al revés)."""
    return math.degrees(math.atan2(b.y - a.y, b.x - a.x)) % 180.0


def _paralelos(a1: float, a2: float) -> bool:
    d = abs(a1 - a2) % 180.0
    return min(d, 180.0 - d) <= ROTULO_PARALELO_MAX


class Rectas:
    """Segmentos de trazos cortos (≤ RECTA_ITEMS_MAX ítems: líneas de cota, extensiones, bordes) en una rejilla, para
    preguntar rápido si junto a un rótulo hay una recta paralela: la línea de cota."""

    def __init__(self, dibujos: list[dict], M, celda: float = 100.0):
        self.celda = celda
        self.celdas: dict[tuple[int, int], list] = {}
        for d in dibujos:
            if d["type"] != "s" or len(d["items"]) > RECTA_ITEMS_MAX:
                continue
            for a, b in _segmentos(d, M):
                if abs(b - a) < 1e-6:
                    continue
                for cx in range(int(min(a.x, b.x) // celda), int(max(a.x, b.x) // celda) + 1):
                    for cy in range(int(min(a.y, b.y) // celda), int(max(a.y, b.y) // celda) + 1):
                        self.celdas.setdefault((cx, cy), []).append((a, b))

    def paralela_junto_a(self, rotulo: dict) -> bool:
        """True si hay una recta paralela al rótulo, pegada a su caja y al menos de media caja de largo."""
        import pymupdf  # noqa: PLC0415

        r, h = rotulo["rect"], rotulo["altura"]
        caja = pymupdf.Rect(r.x0 - LINEA_COTA_EN_ALTURAS * h, r.y0 - LINEA_COTA_EN_ALTURAS * h,
                            r.x1 + LINEA_COTA_EN_ALTURAS * h, r.y1 + LINEA_COTA_EN_ALTURAS * h)
        largo_min = 0.5 * max(r.width, r.height)
        vistos = set()
        for cx in range(int(caja.x0 // self.celda), int(caja.x1 // self.celda) + 1):
            for cy in range(int(caja.y0 // self.celda), int(caja.y1 // self.celda) + 1):
                for a, b in self.celdas.get((cx, cy), ()):
                    clave = (a.x, a.y, b.x, b.y)
                    if clave in vistos:
                        continue
                    vistos.add(clave)
                    if (abs(b - a) >= largo_min and _paralelos(rotulo["angulo"], _angulo(a, b))
                            and _toca(caja, a, b)):
                        return True
        return False


def curvas_de_nivel(dibujos: list[dict], M, altura_rotulo: float) -> list[dict]:
    """Trazos que parecen curvas de nivel: sin relleno, largos, con muchos segmentos y giros suaves."""
    curvas = []
    for d in dibujos:
        if d["type"] != "s" or len(d["items"]) < CURVA_SEGMENTOS_MIN:
            continue
        segs = _segmentos(d, M)
        largo, giro, medio, maximo = _forma(segs)
        if (largo >= CURVA_LARGO_EN_ALTURAS * altura_rotulo and giro >= CURVA_GIRO_TOTAL_MIN
                and medio <= CURVA_GIRO_MEDIO_MAX and maximo <= CURVA_GIRO_MAX):
            import pymupdf  # noqa: PLC0415
            curvas.append({"segmentos": segs, "rect": pymupdf.Rect(d["rect"]) * M, "largo": largo, "giro": giro})
    return curvas


def sobre_curva(rotulo: dict, curvas: list[dict]) -> str | None:
    """Cómo se apoya el rótulo en una curva de nivel, o None si no se apoya.

    - «mascara»: el rótulo lleva máscara blanca y una curva pasa por ella en paralelo (el rótulo se puso sobre la línea
      para taparla, como hacen los rótulos de curvas de AutoCAD/Civil 3D).
    - «corte»: sin máscara, una curva termina dentro de la caja del rótulo (la línea se interrumpió para el rótulo) y su
      último segmento es paralelo.
    Una cota que una curva cruza de paso no cumple ninguna: la curva sigue entera y no hay máscara."""
    import pymupdf  # noqa: PLC0415

    r, angulo = rotulo["rect"], rotulo["angulo"]
    h = ROTULO_HOLGURA_EN_ALTURAS * rotulo["altura"]
    caja = pymupdf.Rect(r.x0 - h, r.y0 - h, r.x1 + h, r.y1 + h)
    for c in curvas:
        if not c["rect"].intersects(caja):
            continue
        segs = [s for s in c["segmentos"] if abs(s[1] - s[0]) > 1e-6]
        if rotulo.get("mascara"):
            if any(_toca(caja, a, b) and _paralelos(angulo, _angulo(a, b)) for a, b in segs):
                return "mascara"
        elif segs:
            hc = CORTE_HOLGURA_EN_ALTURAS * rotulo["altura"]
            caja_corte = pymupdf.Rect(r.x0 - hc, r.y0 - hc, r.x1 + hc, r.y1 + hc)
            for (a, b), extremo in ((segs[0], segs[0][0]), (segs[-1], segs[-1][1])):
                if caja_corte.contains(extremo) and _paralelos(angulo, _angulo(a, b)):
                    return "corte"
    return None


# --- rótulos ----------------------------------------------------------------------------------------------------------

def rotulos_de_texto(pag, M) -> list[dict]:
    """Números con 1–2 decimales que van solos en su línea (un rótulo de curva no lleva «N +» ni unidades)."""
    import pymupdf  # noqa: PLC0415

    giro = pymupdf.Matrix(M.a, M.b, M.c, M.d, 0, 0)
    out = []
    for b in pag.get_text("dict").get("blocks", []):
        for ln in b.get("lines", []):
            texto = "".join(s["text"] for s in ln["spans"]).strip()
            if not ROTULO_NUMERICO.match(texto):
                continue
            r = pymupdf.Rect(ln["bbox"]) * M
            d = pymupdf.Point(ln["dir"]) * giro
            out.append({"texto": texto, "valor": float(texto.replace(",", ".")), "rect": r,
                        "angulo": math.degrees(math.atan2(d.y, d.x)) % 180.0,
                        "altura": max(s["size"] for s in ln["spans"]) or min(r.width, r.height), "origen": "texto"})
    return out


def mascaras_blancas(dibujos: list[dict], M) -> list[dict]:
    """Rellenos blancos chicos (máscara de fondo de un rótulo), con su rectángulo y la dirección de su lado largo."""
    import pymupdf  # noqa: PLC0415

    out = []
    for d in dibujos:
        if d["type"] not in ("f", "fs") or d.get("fill") != (1.0, 1.0, 1.0):
            continue
        r = pymupdf.Rect(d["rect"]) * M
        if max(r.width, r.height) > MASCARA_LADO_MAX or min(r.width, r.height) < 4:
            continue
        segs = [s for s in _segmentos(d, M) if abs(s[1] - s[0]) > 1e-6]
        if not segs:
            continue
        a, b = max(segs, key=lambda s: abs(s[1] - s[0]))
        out.append({"rect": r, "angulo": _angulo(a, b)})
    return out


def mascaras_con_glifos(dibujos: list[dict], M, mascaras: list[dict], palabras: list) -> list[dict]:
    """Máscaras blancas con trazos chicos adentro y sin texto: rótulos convertidos a glifos vectoriales."""
    import pymupdf  # noqa: PLC0415

    chicos = [pymupdf.Rect(d["rect"]) * M for d in dibujos
              if d["type"] == "s" and len(d["items"]) >= 3
              and max(d["rect"][2] - d["rect"][0], d["rect"][3] - d["rect"][1]) < MASCARA_LADO_MAX]
    cajas_texto = [pymupdf.Rect(w[:4]) * M for w in palabras]
    out = []
    for m in mascaras:
        r = m["rect"]
        if any(r.intersects(t) for t in cajas_texto):
            continue
        glifos = [g for g in chicos if r.contains(g) and max(g.width, g.height) < 0.9 * max(r.width, r.height)]
        if len(glifos) < GLIFOS_MIN:
            continue
        altura = sorted(max(g.width, g.height) for g in glifos)[len(glifos) // 2]
        if altura < 3:
            continue
        out.append({"rect": r, "angulo": m["angulo"], "altura": altura, "glifos": len(glifos), "origen": "glifos",
                    "mascara": True})
    return out


def con_mascara(rotulos: list[dict], mascaras: list[dict]) -> None:
    """Marca los rótulos de texto cuyo centro cae en una máscara blanca."""
    for t in rotulos:
        centro = (t["rect"].tl + t["rect"].br) / 2
        t["mascara"] = any(m["rect"].contains(centro) for m in mascaras)


_LECTOR: list = []


def lector_ocr():
    """RapidOCR si está instalado (es el segundo lector de precheck/planos/lineas.py); si no, None."""
    if not _LECTOR:
        try:
            from rapidocr import RapidOCR  # noqa: PLC0415
            logging.getLogger("RapidOCR").setLevel(logging.ERROR)
            _LECTOR.append(RapidOCR())
        except Exception:  # noqa: BLE001 — sin la librería o sus modelos no se leen rótulos vectoriales
            _LECTOR.append(None)
    return _LECTOR[0]


def leer_glifos(pag, mascara: dict, lector=None) -> float | None:
    """Renderiza la máscara enderezada y lee el número con RapidOCR. None si no hay lector o no se lee un número."""
    import pymupdf  # noqa: PLC0415

    lector = lector or lector_ocr()
    if lector is None:
        return None
    r = mascara["rect"]
    clip = pymupdf.Rect(r.x0 - 3, r.y0 - 3, r.x1 + 3, r.y1 + 3)
    pix = pag.get_pixmap(matrix=pymupdf.Matrix(OCR_ZOOM, OCR_ZOOM).prerotate(-mascara["angulo"]), clip=clip, alpha=False)
    import numpy as np  # noqa: PLC0415
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    try:
        res = lector(img)
    except Exception:  # noqa: BLE001
        return None
    texto = " ".join(res.txts or ())
    m = re.search(r"\d{1,3}[.,]\d{1,2}", texto)
    mascara["ocr"] = texto
    return float(m.group().replace(",", ".")) if m else None


def rotulos_sobre_curvas(pag, M, palabras: list, lector=None, dibujos: list | None = None) -> dict:
    """Rótulos (texto o glifos) a los que una curva de nivel dibujada atraviesa en paralelo, con sus cotas."""
    dibujos = pag.get_cdrawings() if dibujos is None else dibujos
    mascaras = mascaras_blancas(dibujos, M)
    textos = rotulos_de_texto(pag, M)
    con_mascara(textos, mascaras)
    candidatos = textos + mascaras_con_glifos(dibujos, M, mascaras, palabras)
    if not candidatos:
        return {"curvas": 0, "rotulos": []}
    altura_ref = sorted(c["altura"] for c in candidatos)[len(candidatos) // 2]
    curvas = curvas_de_nivel(dibujos, M, altura_ref)
    aceptados = []
    if curvas:
        rectas = Rectas(dibujos, M)
        for c in candidatos:
            apoyo = sobre_curva(c, curvas)
            if not apoyo or rectas.paralela_junto_a(c):   # con línea de cota paralela al lado es una cota, no una curva
                continue
            valor = c.get("valor") if c["origen"] == "texto" else leer_glifos(pag, c, lector)
            if valor is not None:
                aceptados.append({"valor": valor, "origen": c["origen"], "apoyo": apoyo,
                                  "texto": c.get("texto", c.get("ocr")), "pos": [round(c["rect"].x0), round(c["rect"].y0)]})
    return {"curvas": len(curvas), "rotulos": aceptados}


def escaneada(pag) -> bool:
    """True si una imagen cubre al menos la mitad de la lámina (un escaneo, aunque lleve marco vectorial)."""
    import pymupdf  # noqa: PLC0415

    area = pag.rect.get_area()
    return any(pymupdf.Rect(i["bbox"]).get_area() >= IMAGEN_ESCANEO_MIN * area for i in pag.get_image_info())


def medir(pdf: str | Path, lector=None) -> dict:
    import pymupdf  # noqa: PLC0415

    doc = pymupdf.open(str(pdf))
    paginas = []
    for n, pag in enumerate(doc, start=1):
        palabras = pag.get_text("words")
        vals = [float(w[4]) for w in palabras if ROTULO_CURVA.match(w[4])]
        s = serie(vals)
        p = {"pagina": n, "escaneada": False, "rotulos": len(vals)}
        if s:
            p["serie"] = s
        else:
            dibujos = pag.get_cdrawings()
            if not palabras and (not dibujos or escaneada(pag)):   # sin texto y sin trazos, o una imagen que llena la hoja
                paginas.append({"pagina": n, "escaneada": True})
                continue
            geo = rotulos_sobre_curvas(pag, pag.rotation_matrix, palabras, lector, dibujos)
            p["curvas_dibujadas"] = geo["curvas"]
            p["rotulos_sobre_curvas"] = geo["rotulos"]
            paso = (paso_entre([r["valor"] for r in geo["rotulos"]])
                    or paso_entre([r["valor"] for r in geo["rotulos"] if r["apoyo"] == "mascara"]))
            if paso:
                p["serie"] = paso
                p["metodo"] = "rótulos sobre curvas dibujadas"
        paginas.append(p)
    con_serie = [p for p in paginas if p.get("serie")]
    escaneado = all(p["escaneada"] for p in paginas)
    eq = min((p["serie"]["equidistancia_m"] for p in con_serie), default=None)
    return {
        "dato": "plano.intervalo_curvas_nivel_m",
        "equidistancia_m": eq,
        "resultado": ("plano escaneado: no se puede medir con el texto; mira las láminas" if escaneado else
                      f"curvas rotuladas cada {eq} m (lámina {', '.join(str(p['pagina']) for p in con_serie)})" if eq else
                      "sin serie de rótulos de curvas en el texto (ni rótulos sobre curvas dibujadas; puede haber curvas con "
                      "otro formato: míralas en la lámina)"),
        "metodo": "serie de rótulos «NN.0» del texto del PDF, o rótulos sobre curvas dibujadas (scripts/medir_curvas.py)",
        "ocr_disponible": importlib.util.find_spec("rapidocr") is not None,
        "paginas": paginas,
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    print(json.dumps(medir(sys.argv[1]), ensure_ascii=False, indent=1))
