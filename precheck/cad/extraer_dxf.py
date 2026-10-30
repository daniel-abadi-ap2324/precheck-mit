#!/usr/bin/env python3
"""Extrae hechos de un DXF (lote, huella, estacionamientos, cotas, retiros) con procedencia.

Uso: extraer_dxf.py plano.dxf --mapeo mapeo_capas.json [--salida hechos.json]

mapeo_capas.json:
{
  "lindero": ["^LINDERO$", "LOTE"],          # regex sobre nombres de capa
  "huella_construccion": ["HUELLA", "PB-MUROS-EXT"],
  "estacionamiento_bloques": ["ESTAC"],       # regex sobre nombres de bloque
  "cota": ["COTA", "DIM"]
}
Requiere: pip install ezdxf shapely
"""
import argparse
import hashlib
import json
import re

import ezdxf
from ezdxf import path as ezpath

A_METROS = {1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1.0}


def coincide(nombre, patrones):
    return any(re.search(p, nombre, re.IGNORECASE) for p in patrones)


def poligono(e, factor):
    """Vértices de una polilínea cerrada, aproximando arcos (bulge)."""
    if e.dxftype() not in ("LWPOLYLINE", "POLYLINE") or not e.is_closed:
        return None
    pts = [(v.x * factor, v.y * factor) for v in ezpath.make_path(e).flattening(distance=0.01)]
    return pts if len(pts) >= 3 else None


def area(pts):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1], strict=True))) / 2


def hecho(valor, unidad, conf, handle, capa, nota=None):
    h = {"valor": valor, "unidad": unidad, "confianza": conf,
         "fuente": {"metodo": "cad", "handle": handle, "capa": capa}}
    if nota:
        h["nota"] = nota
    return h


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dxf")
    ap.add_argument("--mapeo", required=True)
    ap.add_argument("--salida")
    a = ap.parse_args()
    mapeo = json.load(open(a.mapeo, encoding="utf-8"))
    doc = ezdxf.readfile(a.dxf)
    msp = doc.modelspace()

    ins = doc.header.get("$INSUNITS", 0)
    factor = A_METROS.get(ins, 1.0)
    conf_base = 0.99 if ins in A_METROS else 0.5  # sin unidades: todo va a revisión

    lotes, huellas, alertas = [], [], []
    estac, cotas = 0, []
    for e in msp:
        capa = e.dxf.layer
        if coincide(capa, mapeo.get("lindero", [])):
            p = poligono(e, factor)
            if p:
                lotes.append((e.dxf.handle, capa, p))
        elif coincide(capa, mapeo.get("huella_construccion", [])):
            p = poligono(e, factor)
            if p:
                huellas.append((e.dxf.handle, capa, p))
        if e.dxftype() == "INSERT" and coincide(e.dxf.name, mapeo.get("estacionamiento_bloques", [])):
            estac += 1
        if e.dxftype() == "DIMENSION" and coincide(capa, mapeo.get("cota", [".*"])):
            medido = e.get_measurement()
            medido = medido * factor if isinstance(medido, (int, float)) else None
            texto = e.dxf.get("text", "")
            c = {"handle": e.dxf.handle, "capa": capa, "medido_m": medido, "texto": texto}
            if texto and texto not in ("", "<>") and medido is not None:
                num = re.search(r"[\d]+(?:[.,]\d+)?", texto)
                if num and abs(float(num.group().replace(",", ".")) - medido) > 0.01:
                    c["alerta"] = "texto de cota difiere del valor medido"
                    alertas.append(f"cota {e.dxf.handle}: texto '{texto}' vs medido {medido:.3f} m")
            cotas.append(c)

    hechos = {"_origen": {"archivo": a.dxf, "sha256": hashlib.sha256(open(a.dxf, "rb").read()).hexdigest(),
                          "unidades_insunits": ins, "factor_a_m": factor}}
    if len(lotes) == 1:
        h, capa, p = lotes[0]
        hechos["lote"] = {"area_m2": hecho(round(area(p), 3), "m2", conf_base, h, capa)}
    elif len(lotes) > 1:
        alertas.append(f"{len(lotes)} polígonos de lindero: no se puede decidir cuál es el lote")
    else:
        alertas.append("no se encontró polígono de lindero cerrado")

    if huellas:
        total = sum(area(p) for _, _, p in huellas)
        hechos["huella"] = {"area_m2": hecho(round(total, 3), "m2", conf_base,
                                             [h for h, _, _ in huellas], huellas[0][1])}
        if len(lotes) == 1:
            try:
                from shapely.geometry import Polygon
                lote_poly = Polygon(lotes[0][2]).exterior
                d = min(Polygon(p).distance(lote_poly) for _, _, p in huellas)
                hechos["huella"]["retiro_minimo_m"] = hecho(
                    round(d, 3), "m", min(conf_base, 0.8), None, None,
                    "distancia mínima a cualquier lindero; asignar frente/lateral/posterior requiere revisión")
                hechos["ocupacion_pct"] = hecho(round(100 * total / area(lotes[0][2]), 2), "%", conf_base,
                                                None, None, "calculado: huella / lote")
            except ImportError:
                alertas.append("shapely no instalado: no se calcularon retiros")

    hechos["estacionamientos"] = {"cantidad": hecho(estac, "unidades", conf_base if estac else 0.5, None, None,
                                                    None if estac else "0 bloques: verificar mapeo")}
    hechos["cotas"] = cotas
    hechos["_alertas"] = alertas
    out = json.dumps(hechos, indent=2, ensure_ascii=False)
    if a.salida:
        open(a.salida, "w", encoding="utf-8").write(out)
        print(f"{len(alertas)} alerta(s) -> {a.salida}")
    else:
        print(out)


if __name__ == "__main__":
    main()
