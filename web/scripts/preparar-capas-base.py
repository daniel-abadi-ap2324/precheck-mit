"""Capas base del mapa desde el índice del Documento Gráfico (carpeta Zonificacion_MUPA, fuente DPU).

Entrada: <carpeta>/wgs84/{distrito,corregimientos_limites,rios,oceano,mosaico}.geojson (EPSG:4326).
Salida:  public/data/base/*.geojson, simplificadas en metros (UTM 17N) y con coordenadas a 6 decimales.
Uso: python preparar-capas-base.py /home/app/Zonificacion_MUPA   (requiere shapely y pyproj)
"""
import json
import pathlib
import sys

from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import linemerge, transform

A_UTM = Transformer.from_crs(4326, 32617, always_xy=True).transform
A_WGS = Transformer.from_crs(32617, 4326, always_xy=True).transform
TOLERANCIA_M = {"distrito": 10, "corregimientos_limites": 15, "rios": 3, "oceano": 10, "mosaico": 0}


def redondear(geo):
    return json.loads(json.dumps(geo), parse_float=lambda s: round(float(s), 6))


def corregimientos(carpeta, salida):
    """Los 26 corregimientos del distrito 08-08 desde <carpeta>/distrito8v4.geojson (CRS84), con nombre y código."""
    datos = json.load(open(pathlib.Path(carpeta) / "distrito8v4.geojson"))
    feats = []
    for ft in datos["features"]:
        p = ft["properties"]
        g = transform(A_WGS, transform(A_UTM, shape(ft["geometry"])).simplify(8, preserve_topology=True))
        c = g.representative_point()
        feats.append({"type": "Feature", "geometry": redondear(mapping(g)), "properties": {
            "id": p["ID_CORR"], "codigo": p["COD_CORR"], "nombre": p["Corregimie"], "distrito": p["Distrito"],
            "provincia": p["Provincia"], "area_ha": round(p["Area_SQKM"] * 100, 1), "cabecera": None,
            "etiqueta": [round(c.x, 6), round(c.y, 6)]}})
    destino = salida / "corregimientos.geojson"
    json.dump({"type": "FeatureCollection", "fuente": "distrito8v4.geojson (corregimientos del distrito de Panamá, 08-08)",
               "features": feats}, open(destino, "w"), ensure_ascii=False, separators=(",", ":"))
    print(destino, destino.stat().st_size // 1024, "KB", len(feats))


def main(carpeta):
    salida = pathlib.Path("public/data/base")
    salida.mkdir(parents=True, exist_ok=True)
    corregimientos(carpeta, salida)
    for nombre, tol in TOLERANCIA_M.items():
        if nombre == "corregimientos_limites":
            continue          # las divisiones salen de distrito8v4.geojson (polígonos con nombre y código)
        datos = json.load(open(pathlib.Path(carpeta) / "wgs84" / f"{nombre}.geojson"))
        feats = []
        for ft in datos["features"]:
            g = shape(ft["geometry"])
            if g.geom_type == "MultiLineString":
                g = linemerge(g)          # vienen como miles de segmentos de dos puntos
            if tol:
                g = transform(A_WGS, transform(A_UTM, g).simplify(tol, preserve_topology=True))
            feats.append({"type": "Feature", "geometry": redondear(mapping(g)), "properties": ft.get("properties") or {}})
        destino = salida / f"{'corregimientos' if nombre == 'corregimientos_limites' else nombre}.geojson"
        json.dump({"type": "FeatureCollection", "features": feats}, open(destino, "w"), ensure_ascii=False, separators=(",", ":"))
        print(destino, destino.stat().st_size // 1024, "KB", len(feats))


if __name__ == "__main__":
    main(sys.argv[1])
