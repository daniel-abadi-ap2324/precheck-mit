#!/usr/bin/env python3
"""Mide qué tan buenas son las regiones de un `regiones.json` comparándolas con una verdad de referencia.

La verdad (`verdad.json`) tiene el mismo formato que `regiones.json` (contrato común) y tres campos extra opcionales:
  - `alcance`: {"<página>": [polígono, …]} — zona evaluada de la hoja (el dibujo de implantación). Las propuestas cuyo
    centroide cae fuera quedan «fuera de alcance» y no cuentan. Sin `alcance`, se evalúa la hoja entera.
  - `totales`: {"estacionamiento": N} — número total de plazas contado en el plano (p. ej. por su numeración).
  - en cada región de estacionamiento, `conteo`: número de plazas que abarca el polígono (fila o bloque); sin él, 1.

Solo se evalúan las páginas que tienen regiones en la verdad y los tipos presentes en la verdad de esa página
(más `TIPOS_EVALUADOS`). Las propuestas en otras páginas son «fuera de alcance»; las de otros tipos, «no evaluadas»
(salvo que coincidan con una región de la verdad de otro tipo: entonces son «tipo equivocado»).

Criterios (fijos y declarados):
  - IoU por tipo: intersección / unión de la unión de polígonos de ese tipo (propuesta vs verdad). En fracciones de la
    hoja: la escala distinta de cada eje se cancela en el cociente.
  - Emparejamiento uno a uno, voraz por IoU descendente; un par es válido si IoU ≥ 0.3 o, solo en estacionamientos,
    si el centroide de la propuesta cae dentro de la plaza de la verdad.
  - Estacionamientos en bloques (`conteo` > 1): las plazas propuestas cuyo centroide cae dentro del bloque cuentan como
    acierto hasta `conteo`; las demás son falsas.
  - Trabajo de corrección: borrar = propuestas falsas; crear = regiones (o plazas) de la verdad sin pareja;
    ajustar = parejas con IoU < 0.8 (las plazas contra un bloque no se ajustan) + propuestas de tipo equivocado.

Uso:
  python scripts/medir_regiones.py --propuesta regiones.json --verdad verdad.json [--json salida.json]
         [--imagen comparacion.png] [--fondo r1.png] [--lado 1600] [--tapar x0,y0,x1,y1 …]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

TIPOS_EVALUADOS = ("lote", "huella", "estacionamiento", "acera", "area_verde")
IOU_PAREJA = 0.3
IOU_AJUSTE = 0.8


# ---------------------------------------------------------------------------------------------------------------
# Geometría.

def poligono(puntos):
    """Polígono de shapely (válido) o None."""
    from shapely.geometry import Polygon

    try:
        p = Polygon([tuple(map(float, q)) for q in puntos])
    except Exception:  # noqa: BLE001
        return None
    if not p.is_valid:
        p = p.buffer(0)
    return None if p.is_empty or p.area <= 0 else p


def iou(a, b) -> float:
    """IoU de dos geometrías de shapely (o None)."""
    if a is None or b is None or a.is_empty or b.is_empty:
        return 0.0
    u = a.union(b).area
    return a.intersection(b).area / u if u > 0 else 0.0


def union(geoms):
    from shapely.ops import unary_union

    g = [x for x in geoms if x is not None]
    return unary_union(g) if g else None


def compatible(prop, verd, centroide: bool = False) -> tuple[bool, float]:
    """(¿pareja válida?, IoU): IoU ≥ 0.3 o, con `centroide`, el centroide de la propuesta dentro de la verdad."""
    i = iou(prop, verd)
    return (i >= IOU_PAREJA or (centroide and verd.contains(prop.centroid))), i


def emparejar(props: list, verds: list, centroide: bool = False) -> tuple[list[tuple[int, int, float]], list[int], list[int]]:
    """Emparejamiento uno a uno voraz por IoU descendente. Devuelve (parejas (ip, iv, iou), props sin pareja,
    verdades sin pareja). `props` y `verds` son geometrías de shapely."""
    candidatos = []
    for ip, p in enumerate(props):
        for iv, v in enumerate(verds):
            ok, i = compatible(p, v, centroide)
            if ok:
                # A igual IoU (p. ej. 0 con centroide dentro), primero la de mayor intersección relativa.
                candidatos.append((i, p.intersection(v).area / p.area if p.area else 0, ip, iv))
    candidatos.sort(key=lambda c: (-c[0], -c[1]))
    usados_p, usados_v, parejas = set(), set(), []
    for i, _, ip, iv in candidatos:
        if ip in usados_p or iv in usados_v:
            continue
        usados_p.add(ip)
        usados_v.add(iv)
        parejas.append((ip, iv, i))
    return (parejas, [i for i in range(len(props)) if i not in usados_p],
            [i for i in range(len(verds)) if i not in usados_v])


# ---------------------------------------------------------------------------------------------------------------
# Medición.

def _regiones(doc: dict) -> list[dict]:
    salida = []
    for r in doc.get("regiones") or []:
        if not isinstance(r, dict) or not isinstance(r.get("puntos"), list):
            continue
        g = poligono(r["puntos"])
        if g is not None:
            salida.append({**r, "_g": g})
    return salida


def _r(x: Optional[float], n: int = 3) -> Optional[float]:
    return None if x is None else round(x, n)


def medir(propuesta: dict, verdad: dict) -> dict:
    """Métricas de `propuesta` contra `verdad` (dos documentos con el formato de regiones.json)."""
    props_todas = _regiones(propuesta)
    verds_todas = _regiones(verdad)
    paginas = sorted({str(r["pagina"]) for r in verds_todas}, key=int)
    alcance = verdad.get("alcance") or {}
    totales = verdad.get("totales") or {}
    resultado = {"paginas": {}, "fuera_de_alcance": 0, "no_evaluadas": {}, "tipo_equivocado": [],
                 "trabajo": {"borrar": 0, "crear": 0, "ajustar": 0, "total": 0},
                 "criterios": {"iou_pareja": IOU_PAREJA, "iou_ajuste": IOU_AJUSTE}}
    resultado["fuera_de_alcance"] = sum(1 for r in props_todas if str(r.get("pagina")) not in paginas)
    for pag in paginas:
        zona = union(poligono(a) for a in alcance.get(pag, [])) if alcance.get(pag) else None
        verds = [r for r in verds_todas if str(r["pagina"]) == pag]
        props = []
        for r in (r for r in props_todas if str(r.get("pagina")) == pag):
            if zona is not None and not zona.contains(r["_g"].centroid):
                resultado["fuera_de_alcance"] += 1
            else:
                props.append(r)
        tipos = sorted(set(TIPOS_EVALUADOS) | {r["tipo"] for r in verds}, key=lambda t: (t not in TIPOS_EVALUADOS, t))
        por_tipo = {}
        sobrantes_p, sobrantes_v = [], []  # (región, tipo) sin pareja, para buscar tipos equivocados
        for t in tipos:
            P = [r for r in props if r.get("tipo") == t]
            V = [r for r in verds if r.get("tipo") == t]
            m = {"propuestas": len(P), "verdad": len(V),
                 "iou_union": _r(iou(union(r["_g"] for r in P), union(r["_g"] for r in V))) if (P or V) else None}
            if t == "estacionamiento":
                m.update(_medir_estacionamientos(P, V, totales.get("estacionamiento")))
                sobrantes_p += [P[i] for i in m.pop("_falsas")]
                sobrantes_v += [V[i] for i in m.pop("_faltantes_idx")]
            else:
                parejas, fp, fv = emparejar([r["_g"] for r in P], [r["_g"] for r in V])
                m.update({"emparejadas": len(parejas),
                          "iou_parejas": [_r(i) for _, _, i in parejas],
                          "a_ajustar": sum(1 for _, _, i in parejas if i < IOU_AJUSTE),
                          "falsas": len(fp), "faltantes": len(fv)})
                sobrantes_p += [P[i] for i in fp]
                sobrantes_v += [V[i] for i in fv]
            por_tipo[t] = m
        # Propuestas de tipos no evaluados: candidatas a «tipo equivocado» o «no evaluadas».
        otras = [r for r in props if r.get("tipo") not in tipos]
        # Tipo equivocado: una propuesta sin pareja de su tipo que coincide (IoU ≥ 0.3) con una verdad sin pareja de
        # otro tipo. Cuenta como «ajustar» (cambiar el tipo) y deja de ser falsa / faltante.
        cand = []
        for ip, p in enumerate(sobrantes_p + otras):
            for iv, v in enumerate(sobrantes_v):
                if p.get("tipo") != v.get("tipo"):
                    i = iou(p["_g"], v["_g"])
                    if i >= IOU_PAREJA:
                        cand.append((i, ip, iv))
        cand.sort(reverse=True)
        lista_p = sobrantes_p + otras
        up, uv, equivocadas = set(), set(), []
        for i, ip, iv in cand:
            if ip in up or iv in uv:
                continue
            up.add(ip)
            uv.add(iv)
            p, v = lista_p[ip], sobrantes_v[iv]
            equivocadas.append({"pagina": int(pag), "propuesta": p.get("tipo"), "verdad": v.get("tipo"),
                                "iou": _r(i), "id": p.get("id"), "etiqueta": p.get("etiqueta", "")})
            por_tipo[v["tipo"]]["faltantes"] = por_tipo[v["tipo"]].get("faltantes", 0) - (v.get("conteo") or 1)
            if p.get("tipo") in por_tipo:
                por_tipo[p["tipo"]]["falsas"] -= 1
        resultado["tipo_equivocado"] += equivocadas
        for ip in range(len(sobrantes_p), len(lista_p)):
            if ip not in up:
                t = lista_p[ip].get("tipo")
                resultado["no_evaluadas"][t] = resultado["no_evaluadas"].get(t, 0) + 1
        falsas = sum(m.get("falsas", 0) for m in por_tipo.values())
        crear = sum(m.get("faltantes", 0) for m in por_tipo.values())
        ajustar = sum(m.get("a_ajustar", 0) for m in por_tipo.values()) + len(equivocadas)
        est = por_tipo.get("estacionamiento", {})
        crear_filas = crear - est.get("faltantes", 0) + est.get("faltantes_si_por_filas", est.get("faltantes", 0))
        resultado["paginas"][pag] = {"tipos": por_tipo, "propuestas_evaluadas": len(props),
                                     "trabajo": {"borrar": falsas, "crear": crear, "ajustar": ajustar,
                                                 "total": falsas + crear + ajustar,
                                                 "crear_si_plazas_por_filas": crear_filas,
                                                 "total_si_plazas_por_filas": falsas + crear_filas + ajustar}}
        for k in ("borrar", "crear", "ajustar"):
            resultado["trabajo"][k] += resultado["paginas"][pag]["trabajo"][k]
    resultado["trabajo"]["total"] = sum(resultado["trabajo"][k] for k in ("borrar", "crear", "ajustar"))
    return resultado


def _medir_estacionamientos(P: list[dict], V: list[dict], total_declarado: Optional[int]) -> dict:
    """Plazas: precisión y exhaustividad por unidades de plaza. Verdad plaza a plaza (emparejamiento uno a uno) o en
    bloques con `conteo` (las propuestas con centroide dentro del bloque cuentan hasta `conteo`)."""
    sueltas = [i for i, r in enumerate(V) if int(r.get("conteo") or 1) <= 1]
    bloques = [i for i, r in enumerate(V) if int(r.get("conteo") or 1) > 1]
    total_verdad = sum(int(r.get("conteo") or 1) for r in V)
    if isinstance(total_declarado, int) and total_declarado > 0:
        total_verdad = total_declarado
    parejas, fp, fv = emparejar([r["_g"] for r in P], [V[i]["_g"] for i in sueltas], centroide=True)
    aciertos = len(parejas)
    a_ajustar = sum(1 for _, _, i in parejas if i < IOU_AJUSTE)
    faltantes_idx = [sueltas[i] for i in fv]
    # Las que no se emparejaron con una plaza suelta: ¿caen en un bloque?
    restantes = list(fp)
    faltan_bloques = 0
    bloques_vacios = 0
    for ib in bloques:
        b = V[ib]
        dentro = [i for i in restantes if b["_g"].contains(P[i]["_g"].centroid)]
        n = int(b["conteo"])
        usados = dentro[:n]
        aciertos += len(usados)
        restantes = [i for i in restantes if i not in usados]
        faltan_bloques += n - len(usados)
        bloques_vacios += not usados
    propuestas = len(P)
    unidades_verdad = sum(int(r.get("conteo") or 1) for r in V)
    precision = aciertos / propuestas if propuestas else None
    exhaustividad = aciertos / total_verdad if total_verdad else None
    return {"plazas_propuestas": propuestas, "plazas_verdad": total_verdad,
            "plazas_en_poligonos_verdad": unidades_verdad, "aciertos": aciertos,
            "precision": _r(precision), "exhaustividad": _r(exhaustividad),
            "error_conteo": propuestas - total_verdad if total_verdad else None,
            "error_conteo_pct": _r((propuestas - total_verdad) / total_verdad * 100, 1) if total_verdad else None,
            "emparejadas": len(parejas), "iou_parejas_medio": _r(sum(i for *_, i in parejas) / len(parejas)) if parejas else None,
            "a_ajustar": a_ajustar, "falsas": len(restantes),
            # Si la persona dibuja las filas sin plazas como un polígono por fila (con su conteo) en vez de plaza a plaza:
            "faltantes_si_por_filas": len(fv) + bloques_vacios,
            "faltantes": len(fv) + faltan_bloques + max(0, total_verdad - unidades_verdad),
            "_falsas": restantes, "_faltantes_idx": faltantes_idx}


# ---------------------------------------------------------------------------------------------------------------
# Imagen de comparación: verdad en verde, propuesta en rojo, recortada al alcance (sin el membrete).

def imagen_comparacion(propuesta: dict, verdad: dict, fondo: Path, salida: Path, pagina: str, lado: int = 1600,
                       margen: float = 0.02, tapar: tuple = ()) -> Optional[Path]:
    """`tapar`: rectángulos (x0, y0, x1, y1) en fracciones que se cubren de blanco (p. ej. nombres de propietarios)."""
    from PIL import Image, ImageDraw

    img = Image.open(fondo).convert("RGB")
    W, H = img.size
    for x0, y0, x1, y1 in tapar:
        ImageDraw.Draw(img).rectangle((x0 * W, y0 * H, x1 * W, y1 * H), fill="white")
    ancho = max(2, W // 900)
    img = img.convert("RGBA")

    def capa(doc, color, relleno, grosor):
        """Cada documento en su capa: dentro de una capa RGBA los rellenos sobrescriben (no mezclan)."""
        c = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(c)
        for r in doc.get("regiones") or []:
            if str(r.get("pagina")) != pagina or not isinstance(r.get("puntos"), list) or len(r["puntos"]) < 3:
                continue
            d.polygon([(x * W, y * H) for x, y in r["puntos"]], fill=relleno)
        for r in doc.get("regiones") or []:
            if str(r.get("pagina")) != pagina or not isinstance(r.get("puntos"), list) or len(r["puntos"]) < 3:
                continue
            xy = [(x * W, y * H) for x, y in r["puntos"]]
            d.line(xy + [xy[0]], fill=color, width=grosor, joint="curve")
        return c

    # Verdad gruesa debajo y propuesta fina encima: un borde que coincide se ve rojo con orla verde.
    img = Image.alpha_composite(img, capa(verdad, (22, 163, 74, 255), (22, 163, 74, 40), ancho * 3))
    img = Image.alpha_composite(img, capa(propuesta, (220, 38, 38, 255), (220, 38, 38, 30), ancho))
    img = img.convert("RGB")
    zonas = (verdad.get("alcance") or {}).get(pagina) or [r["puntos"] for r in verdad.get("regiones") or []
                                                         if str(r.get("pagina")) == pagina]
    if zonas:
        xs = [p[0] for z in zonas for p in z]
        ys = [p[1] for z in zonas for p in z]
        caja = (max(0, min(xs) - margen) * W, max(0, min(ys) - margen) * H,
                min(1, max(xs) + margen) * W, min(1, max(ys) + margen) * H)
        img = img.crop(tuple(int(c) for c in caja))
    img.thumbnail((lado, lado))
    salida.parent.mkdir(parents=True, exist_ok=True)
    img.save(salida, optimize=True)
    return salida


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--propuesta", required=True, help="regiones.json a evaluar")
    ap.add_argument("--verdad", required=True, help="verdad.json de referencia")
    ap.add_argument("--json", help="escribe aquí el resultado (si no, a la salida estándar)")
    ap.add_argument("--imagen", help="PNG de comparación (verde = verdad, rojo = propuesta)")
    ap.add_argument("--fondo", help="raster de la hoja (por defecto, el `imagen` de la página junto a la propuesta)")
    ap.add_argument("--lado", type=int, default=1600)
    ap.add_argument("--tapar", action="append", default=[], metavar="x0,y0,x1,y1",
                    help="rectángulo en fracciones de la hoja que se cubre de blanco en la imagen (repetible)")
    a = ap.parse_args(argv)
    ruta_p = Path(a.propuesta)
    propuesta = json.loads(ruta_p.read_text(encoding="utf-8"))
    verdad = json.loads(Path(a.verdad).read_text(encoding="utf-8"))
    res = medir(propuesta, verdad)
    texto = json.dumps(res, ensure_ascii=False, indent=1)
    if a.json:
        Path(a.json).write_text(texto, encoding="utf-8")
    else:
        print(texto)
    if a.imagen:
        for pag in res["paginas"]:
            fondo = Path(a.fondo) if a.fondo else ruta_p.parent / ((propuesta.get("paginas") or {}).get(pag) or {}).get("imagen", f"r{pag}.png")
            if not fondo.exists():
                print(f"Sin imagen de fondo para la página {pag}: {fondo}", file=sys.stderr)
                continue
            salida = Path(a.imagen)
            if len(res["paginas"]) > 1:
                salida = salida.with_name(f"{salida.stem}-p{pag}{salida.suffix}")
            tapar = [tuple(float(v) for v in t.split(",")) for t in a.tapar]
            imagen_comparacion(propuesta, verdad, fondo, salida, pag, a.lado, tapar=tapar)
    return 0


if __name__ == "__main__":
    sys.exit(main())
