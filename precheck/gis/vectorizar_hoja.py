#!/usr/bin/env python3
"""Convierte hojas PDF del Documento Gráfico de Zonificación (DPU/MUPA, Anexo 6 del PLOT) en GeoJSON.

Las hojas publicadas en dpu.mupa.gob.pa son PDF vectoriales a 1:5,000 en WGS 84 / UTM 17N, con la
grilla rotulada (p. ej. 668000 / 1000000). Este script:
  1. georreferencia la hoja ajustando una transformación lineal a los rótulos de la grilla;
  2. forma polígonos a partir de los trazos de límite de zona (rojo continuo por defecto);
  3. asigna a cada polígono los códigos de zona rotulados dentro (1R4, 1ZM6, MP-C2, "1P / 1ZM6", EOT...).

Uso:
  vectorizar_hoja.py hoja1.pdf [hoja2.pdf ...] --salida zonas.geojson [--wgs84] [--control control.png]

Cada polígono sale con: codigos (lista), codigo (si hay uno solo), estado (ok | sin_etiqueta | conflicto),
hoja, fecha_hoja, area_m2. Los rótulos de la hoja dicen "sólo a manera de referencia": el resultado sirve
para el PreCheck, pero la norma aplicable a un lote la certifica la DPUOT (certificación de uso de suelo).
Requiere: pip install pymupdf shapely  (pyproj para --wgs84; pillow para --control)
"""
import argparse
import collections
import json
import re
import sys

import pymupdf
from shapely.affinity import affine_transform
from shapely.geometry import LineString, Point, box, mapping
from shapely.ops import polygonize, unary_union

# Códigos en mayúsculas con al menos una letra y un dígito (1R4, 1ZM6, MP-C2, 3A-SINAP, RM3-C2), o EOT / ZOT
CODIGO = re.compile(r"^((?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9]{1,6}(-[A-Z0-9]{1,6}){0,2}|EOT|ZOT)$")
ROJO = (1.0, 0.0, 0.0)
MESES = r"(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Setiembre|Octubre|Noviembre|Diciembre)\s+\d{4}"


def georreferenciar(pagina):
    """Ajusta E = a*x + b y N = c*y + d con los rótulos de la grilla. Devuelve (params, marco, residuo_m)."""
    este, norte = [], []
    for x0, y0, x1, y1, t, *_ in pagina.get_text("words"):
        if re.fullmatch(r"[5-8]\d{5}", t):          # Este UTM 17N en Panamá
            este.append(((x0 + x1) / 2, float(t)))
        elif re.fullmatch(r"1?\d{6}", t) and 800000 <= float(t) <= 1100000:  # Norte
            norte.append(((y0 + y1) / 2, float(t)))
    if len({v for _, v in este}) < 2 or len({v for _, v in norte}) < 2:
        raise ValueError("no se encontraron al menos dos rótulos de grilla por eje")

    def ajuste(pares):
        n = len(pares)
        mx = sum(p for p, _ in pares) / n
        mv = sum(v for _, v in pares) / n
        sxx = sum((p - mx) ** 2 for p, _ in pares)
        a = sum((p - mx) * (v - mv) for p, v in pares) / sxx
        b = mv - a * mx
        res = max(abs(a * p + b - v) for p, v in pares)
        return a, b, res

    a, b, re_ = ajuste(este)
    c, d, rn = ajuste(norte)
    escala = abs(a) * 72 / 0.0254  # m reales por m de papel
    return (a, 0, 0, c, b, d), escala, max(re_, rn)


def marco_mapa(pagina):
    """El rectángulo relleno más grande que no es la página: el área del mapa."""
    pag = pagina.rect
    cands = [x["rect"] for x in pagina.get_drawings()
             if x.get("fill") and x["rect"].width * x["rect"].height < 0.95 * pag.width * pag.height]
    return max(cands, key=lambda r: r.width * r.height)


def rotulos(pagina, marco):
    """Códigos de zona dentro del marco, uniendo rótulos compuestos 'A / B' de la misma línea."""
    palabras = [w for w in pagina.get_text("words")
                if marco.contains(pymupdf.Point((w[0] + w[2]) / 2, (w[1] + w[3]) / 2))]
    por_linea = collections.defaultdict(list)
    for w in palabras:
        por_linea[(w[5], w[6])].append(w)
    salida = []
    for ws in por_linea.values():
        ws.sort(key=lambda w: w[7])
        i = 0
        while i < len(ws):
            if CODIGO.match(ws[i][4]):
                grupo = [ws[i]]
                if ws[i][4] == "ZOT" and i + 1 < len(ws) and re.fullmatch(r"[A-Z]\d+", ws[i + 1][4]):
                    grupo.append(ws[i + 1])  # "ZOT E3"
                    i += 1
                while i + 2 < len(ws) and ws[i + 1][4] == "/" and CODIGO.match(ws[i + 2][4]):
                    grupo += [ws[i + 1], ws[i + 2]]
                    i += 2
                texto = " / ".join(g[4] for g in grupo if g[4] != "/").replace("ZOT / ", "ZOT ")
                x0, y0 = min(g[0] for g in grupo), min(g[1] for g in grupo)
                x1, y1 = max(g[2] for g in grupo), max(g[3] for g in grupo)
                salida.append((texto, Point((x0 + x1) / 2, (y0 + y1) / 2)))
            i += 1
    return salida


def toca_marco(marco, r):
    """Como Rect.intersects, pero sin descartar trazos rectos: su rectángulo tiene ancho o alto cero y
    pymupdf lo trata como vacío."""
    return not (r.x1 < marco.x0 or r.x0 > marco.x1 or r.y1 < marco.y0 or r.y0 > marco.y1)


def limites(pagina, marco, colores):
    """Trazos continuos de los colores de límite de zona (lista de RGB redondeados)."""
    segs = []
    for x in pagina.get_drawings():
        col = x.get("color")
        if col is None or x.get("dashes") not in (None, "[] 0") or not toca_marco(marco, x["rect"]):
            continue
        if tuple(round(v, 2) for v in col) not in colores:
            continue
        for it in x["items"]:
            if it[0] == "l":
                segs.append(LineString([it[1], it[2]]))
            elif it[0] == "c":
                segs.append(LineString([it[1], it[2], it[3], it[4]]))
            elif it[0] == "re":
                segs.append(box(*it[1]).exterior)
    return segs


def cierres_al_marco(segs, marco, tol=1.5):
    """Los límites se recortan unas décimas de punto antes del marco: sin cerrarlos contra él, las zonas que
    tocan el borde de la hoja no forman polígono. Une al marco cada extremo que quede a menos de `tol` puntos."""
    borde = box(*marco).exterior
    extra = []
    for s in segs:
        for xy in (s.coords[0], s.coords[-1]):
            pt = Point(xy)
            if 0 < borde.distance(pt) <= tol:
                extra.append(LineString([xy, borde.interpolate(borde.project(pt)).coords[0]]))
    return extra


def caras_y_asignacion(pagina, marco, colores, etiquetas):
    segs = limites(pagina, marco, colores)
    caras = [f for f in polygonize(unary_union(segs + cierres_al_marco(segs, marco) + [box(*marco).exterior]))
             if f.area > 20]
    asignados = collections.defaultdict(set)
    for cod, pt in etiquetas:
        dentro = [i for i, f in enumerate(caras) if f.contains(pt)]
        if dentro:
            asignados[min(dentro, key=lambda i: caras[i].area)].add(cod)
    return caras, asignados


def detectar_color(pagina, marco, etiquetas, candidatos=5):
    """Prueba los colores de trazo continuo más frecuentes y elige el que deja más zonas con un único código.
    Las láminas cambian de simbología entre ediciones (p. ej. rojo 1.0 en 2023, 0.9 en San Francisco 2025)."""
    conteo = collections.Counter()
    for x in pagina.get_drawings():
        if x.get("color") is None or x.get("dashes") not in (None, "[] 0") or not toca_marco(marco, x["rect"]):
            continue
        conteo[tuple(round(v, 2) for v in x["color"])] += len(x["items"])
    # los límites de zona son de color; los grises/negros/blancos son catastro, vías y rótulos
    # (el gris de parcelas tiene decenas de miles de segmentos y haría la prueba muy lenta)
    cromaticos = [c for c in conteo if len(c) == 3 and max(c) - min(c) >= 0.3]
    lista = sorted(cromaticos or conteo, key=lambda c: -conteo[c])[:candidatos]
    # Ante empate gana el primero: el rojo puro, color habitual del límite de zona, va delante del azul de ríos.
    lista.sort(key=lambda c: c != ROJO)
    # EOT y ZOT son sobreposiciones (trazo discontinuo) que caen dentro de zonas del PLOT: si contaran, cada
    # zona con un EOT encima sería «conflicto» y ganaría un color que no es el del límite (p. ej. el de ríos).
    de_zona = [(cod, pt) for cod, pt in etiquetas if not cod.startswith(("EOT", "ZOT"))]

    def puntaje(colores):
        _, asig = caras_y_asignacion(pagina, marco, colores, de_zona)
        return sum(len(c) == 1 for c in asig.values()) - 3 * sum(len(c) > 1 for c in asig.values())

    puntajes = {c: puntaje([c]) for c in lista}
    mejor = [max(lista, key=lambda c: puntajes[c])]  # max devuelve el primero ante empate
    mejor_puntaje = puntajes[mejor[0]]
    # Una hoja puede mezclar ediciones con distinto rojo (5-5E: rojo 1.0 en Pueblo Nuevo y 0.9 en San Francisco).
    # Se suman otros rojos mientras mejoren; nunca otros tonos, que partirían las zonas por ríos o vías.
    for c in lista:
        if c not in mejor and es_rojo(c):
            p = puntaje(mejor + [c])
            if p > mejor_puntaje:
                mejor, mejor_puntaje = mejor + [c], p
    return mejor


def es_rojo(c):
    return len(c) == 3 and c[0] >= 0.6 and c[1] <= 0.25 and c[2] <= 0.25


def procesar(ruta, colores):
    doc = pymupdf.open(ruta)
    pagina = doc[0]
    params, escala, residuo = georreferenciar(pagina)
    marco = marco_mapa(pagina)
    texto = pagina.get_text()
    hoja = re.search(r"\b(\d{1,2}-\d{1,2}[A-Z])\b", texto)
    fecha = re.search(MESES, texto)
    etiquetas = rotulos(pagina, marco)
    if colores is None:
        colores = detectar_color(pagina, marco, etiquetas)
    caras, asignados = caras_y_asignacion(pagina, marco, colores, etiquetas)
    feats = []
    for i, cara in enumerate(caras):
        geo = affine_transform(cara, params)
        cods = sorted(asignados.get(i, []))
        estado = "ok" if len(cods) == 1 else ("sin_etiqueta" if not cods else "conflicto")
        feats.append({"type": "Feature", "geometry": mapping(geo), "properties": {
            "codigos": cods, "codigo": cods[0] if len(cods) == 1 else None, "estado": estado,
            "hoja": hoja.group(1) if hoja else ruta, "fecha_hoja": fecha.group(0) if fecha else None,
            "area_m2": round(geo.area, 1), "fuente": ruta}})
    info = {"archivo": ruta, "hoja": hoja.group(1) if hoja else None, "escala_estimada": round(escala),
            "color_limite": colores,
            "residuo_georref_m": round(residuo, 2), "poligonos": len(feats),
            "por_estado": dict(collections.Counter(f["properties"]["estado"] for f in feats))}
    return feats, info, (pagina, caras, asignados)


def control(pagina, caras, asignados, ruta_png):
    import random

    from PIL import Image, ImageDraw
    pm = pagina.get_pixmap(dpi=36)
    s = 36 / 72
    img = Image.frombytes("RGB", (pm.width, pm.height), pm.samples).convert("RGBA")
    capa = Image.new("RGBA", img.size, (0, 0, 0, 0))
    dib = ImageDraw.Draw(capa)
    for i, cara in enumerate(caras):
        cods = asignados.get(i)
        if not cods:
            col = (80, 80, 80, 110)
        elif len(cods) > 1:
            col = (255, 0, 0, 170)
        else:
            random.seed(next(iter(cods)))
            col = (random.randint(40, 230), random.randint(40, 230), random.randint(40, 230), 120)
        for g in ([cara] if cara.geom_type == "Polygon" else cara.geoms):
            dib.polygon([(x * s, y * s) for x, y in g.exterior.coords], fill=col, outline=(0, 0, 0, 255))
    Image.alpha_composite(img, capa).convert("RGB").save(ruta_png)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", nargs="+")
    ap.add_argument("--salida", required=True)
    ap.add_argument("--wgs84", action="store_true", help="reproyectar a EPSG:4326 (requiere pyproj)")
    ap.add_argument("--control", help="PNG de control (sólo con una hoja)")
    ap.add_argument("--color-limite", default="auto",
                    help="RGB 0-1 del trazo de límite de zona, p. ej. 1,0,0; varios separados por ';' "
                         "(1,0,0;0.9,0,0); 'auto' los detecta por hoja")
    a = ap.parse_args()
    colores = None if a.color_limite == "auto" else [
        tuple(round(float(v), 2) for v in c.split(",")) for c in a.color_limite.split(";")]

    todas, infos = [], []
    for ruta in a.pdf:
        try:
            feats, info, ctx = procesar(ruta, colores)
        except Exception as e:
            infos.append({"archivo": ruta, "error": str(e)})
            continue
        if info["residuo_georref_m"] > 2:
            info["advertencia"] = "residuo de georreferenciación > 2 m: revisar rótulos de grilla"
        todas += feats
        infos.append(info)
        if a.control and len(a.pdf) == 1:
            control(*ctx, a.control)

    crs = "EPSG:32617"
    if a.wgs84:
        from pyproj import Transformer
        from shapely.geometry import shape
        from shapely.ops import transform
        tr = Transformer.from_crs("EPSG:32617", "EPSG:4326", always_xy=True).transform
        for f in todas:
            f["geometry"] = mapping(transform(tr, shape(f["geometry"])))
        crs = "EPSG:4326"
    fc = {"type": "FeatureCollection", "name": "zonificacion_dgz",
          "crs": {"type": "name", "properties": {"name": crs}}, "features": todas}
    with open(a.salida, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False)
    json.dump(infos, sys.stdout, ensure_ascii=False, indent=1)
    print()


if __name__ == "__main__":
    main()
