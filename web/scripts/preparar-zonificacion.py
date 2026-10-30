"""Prepara la zonificación real del Documento Gráfico (Anexo 6 del PLOT) para el frontend.

Entrada: una carpeta con un GeoJSON por hoja (EPSG:32617), producido por precheck/gis/vectorizar_hoja.py sobre
las 78 hojas del índice (Zonificacion_MUPA/wgs84/mosaico.geojson; San Francisco con los mosaicos de 2025).
Salidas:
  public/data/dgz/<hoja>.geojson   WGS84, simplificado a 0,5 m, con familia de zona y código de ficha.
  public/data/dgz/index.json       por hoja: escala, fecha, PDF, bbox, conteos por estado y residuo de georreferencia.
  src/mocks/data/parcels.json      lotes de DEMOSTRACIÓN dentro del polígono real 1RM-2 más grande de la hoja
                                   10-3B, cada uno con la zona real que tiene debajo y el corregimiento que
                                   contiene su centroide (public/data/base/corregimientos.geojson, IGNTG-ANATI 2024).
Uso: python preparar-zonificacion.py CARPETA_VECTORES MOSAICO.geojson   (requiere shapely y pyproj)
"""
import json
import re
import sys

from pyproj import Transformer
from shapely.geometry import box, mapping, shape
from shapely.ops import transform

A_WGS = Transformer.from_crs(32617, 4326, always_xy=True).transform


def codigo_ficha(codigo):
    """«1RM-2» → «RM-2»; «1P / 1ZM6» → «ZM6» (uso futuro). Los códigos del MIVIOT quedan igual."""
    if not codigo:
        return None
    futuro = codigo.split("/")[-1].strip()
    return futuro[1:] if re.fullmatch(r"1[A-Z].*", futuro) else futuro


def familia(codigo, estado):
    if estado == "sin_etiqueta":
        return "sin_etiqueta"
    if estado == "conflicto":
        return "conflicto"
    c = codigo or ""
    if c.startswith("3"):
        return "proteccion"
    if c.startswith("2"):
        return "urbanizable"
    if not c.startswith("1"):
        return "miviot"          # MP-*, EOT, ZOT, R2A-E, RM3…: normas del MIVIOT, sin ficha del PLOT
    f = codigo_ficha(c)
    if f.startswith("RM"):
        return "residencial_alta"
    if f.startswith("R"):
        return "residencial"
    if f.startswith("ZM"):
        return "mixta"
    if f in ("CU", "CV"):
        return "comercial"
    if f in ("PV", "PL", "PD", "PU"):
        return "espacio_publico"
    if f in ("EP", "IS", "SV"):
        return "equipamiento"
    return "otro"


def main(carpeta, mosaico):
    import pathlib
    indice_mosaico = {f["properties"]["hoja"]: f for f in json.load(open(mosaico))["features"]}
    salida = pathlib.Path("public/data/dgz")
    salida.mkdir(parents=True, exist_ok=True)
    indice, zonas_10_3b = [], []
    for archivo in sorted(pathlib.Path(carpeta).glob("*.geojson")):
        hoja = archivo.stem
        datos = json.load(open(archivo))
        feats, estados, fecha = [], {"ok": 0, "sin_etiqueta": 0, "conflicto": 0}, None
        for i, ft in enumerate(datos["features"]):
            p = ft["properties"]
            g = shape(ft["geometry"]).simplify(0.5, preserve_topology=True)
            if g.is_empty:
                continue
            codigo = p.get("codigo")
            props = {
                "id": f"DGZ-{hoja}-{i:04d}",
                "codigo": codigo,
                "codigos": p.get("codigos") or [],
                "codigo_ficha": codigo_ficha(codigo) if p.get("estado") == "ok" else None,
                "familia": familia(codigo, p.get("estado")),
                "estado": p.get("estado"),
                "hoja": hoja,
                "fecha_hoja": p.get("fecha_hoja"),
                "area_m2": round(g.area, 1),
            }
            fecha = fecha or p.get("fecha_hoja")
            estados[p.get("estado")] = estados.get(p.get("estado"), 0) + 1
            if hoja == "10-3B":
                zonas_10_3b.append((g, props))
            gw = transform(A_WGS, g)
            geo = json.loads(json.dumps(mapping(gw)), parse_float=lambda s: round(float(s), 6))
            feats.append({"type": "Feature", "geometry": geo, "properties": props})
        json.dump({"type": "FeatureCollection", "features": feats}, open(salida / f"{hoja}.geojson", "w"),
                  ensure_ascii=False, separators=(",", ":"))
        m = indice_mosaico.get(hoja, {"properties": {}, "geometry": None})
        bbox = shape(m["geometry"]).bounds if m["geometry"] else None
        indice.append({"hoja": hoja, "escala": m["properties"].get("escala"), "pdf": m["properties"].get("pdf"),
                       "fecha_hoja": fecha, "bbox": [round(v, 6) for v in bbox] if bbox else None,
                       "poligonos": len(feats), "por_estado": estados})
    json.dump({"generado_desde": "Documento Gráfico de Zonificación (Anexo 6 del PLOT), DPU",
               "hojas": indice}, open(salida / "index.json", "w"), ensure_ascii=False, indent=1)
    print(f"{len(indice)} hojas, {sum(h['poligonos'] for h in indice)} polígonos")
    if zonas_10_3b:
        lotes_demo(zonas_10_3b)


CORREGIMIENTOS = "public/data/base/corregimientos.geojson"


def corregimiento_de():
    """Función punto WGS84 → nombre del corregimiento que lo contiene (None si no hay capa o cae fuera)."""
    import pathlib
    if not pathlib.Path(CORREGIMIENTOS).exists():
        return lambda punto: None
    polis = [(shape(f["geometry"]), f["properties"]["nombre"]) for f in json.load(open(CORREGIMIENTOS))["features"]]
    return lambda punto: next((nombre for g, nombre in polis if g.contains(punto)), None)


def lotes_demo(zonas):
    """Lotes de demostración dentro del 1RM-2 más grande de la hoja 10-3B.

    Direcciones genéricas («Lote de demostración N, <corregimiento>»): no son calles ni fincas reales."""
    corregimiento = corregimiento_de()
    rm2 = max((z for z in zonas if z[1]["codigo"] == "1RM-2"), key=lambda z: z[0].area)[0]
    minx, miny, maxx, maxy = rm2.bounds
    lotes, n = [], 0
    usos = ["Residencial multifamiliar", "Mixto", "Comercial", "Residencial multifamiliar", "Institucional"]
    y = maxy - 15
    while y - 40 > miny and n < 48:
        x = minx + 10
        while x + 24 < maxx and n < 48:
            ancho = 24 + ((n * 7) % 3) * 4
            lote = box(x, y - 40, x + ancho, y)
            if rm2.contains(lote.buffer(3)):
                c = lote.centroid
                zona = next((z for g, z in zonas if z["estado"] == "ok" and g.contains(c)), None)
                lw = transform(A_WGS, lote)
                cw = transform(A_WGS, c)
                correg = corregimiento(cw) or "Sin corregimiento"
                lotes.append({
                    "id": f"PAR-{81400 + n:06d}",
                    "finca": str(083076 + n * 7),
                    "areaM2": round(lote.area),
                    "zoningCode": zona["codigo_ficha"] if zona else "sin zona",
                    "zoningSource": {"hoja": zona["hoja"], "fecha": zona["fecha_hoja"], "poligono": zona["id"]} if zona else None,
                    # El lote queda entero (con 3 m de margen) dentro del 1RM-2: la norma se verifica aquí y se guarda,
                    # para no volver a deducirla del código si la hoja no carga en el navegador.
                    "normaZona": "ficha" if zona else "revision",
                    "landUse": usos[n % len(usos)],
                    "centroid": [round(cw.x, 6), round(cw.y, 6)],
                    "geometry": json.loads(json.dumps(mapping(lw)), parse_float=lambda s: round(float(s), 7)),
                    "district": "Panamá",
                    "corregimiento": correg,
                    "address": f"Lote de demostración {n + 1}, {correg}",
                })
                n += 1
            x += ancho + 4
        y -= 46
    json.dump(lotes, open("src/mocks/data/parcels.json", "w"), ensure_ascii=False, indent=1)
    print(f"{len(lotes)} lotes de demostración")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
