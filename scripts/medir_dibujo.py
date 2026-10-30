#!/usr/bin/env python3
"""Medidas sobre el dibujo vectorial de una zona de una lámina, para la revisión con DeepSeek (herramienta `medir_dibujo`).

DeepSeek mira recortes de unos 384 tokens y no puede medir sobre la imagen: la rotura del cordón, el frente o las
alturas eran los datos en que más se apartaba de Opus. Esta herramienta lee las líneas del PDF (no la imagen) y da,
para una zona en fracciones 0–1 de la hoja «como se lee» (el mismo sistema que texto_pagina y buscar_texto):

- `escala`: el denominador con que se pasan los puntos de la hoja a metros. Se COMPRUEBA con las cotas impresas:
  cada texto de cota («6.90», «13.00 m») se empareja con las líneas paralelas cercanas, y gana la escala que más
  cotas explican con un error ≤ 2 % (lecciones L-0003 y L-0015: no fiarse de una sola cota). Con 2 o más cotas es
  «comprobada»; si no, la declarada en regiones.json o en la lámina («declarada», sin comprobar); si tampoco, no hay
  escala y solo se dan puntos.
- `cotas`: las cotas escritas en la zona con la línea que miden y su largo a esa escala (lo que el plano ya declara).
- `segmentos`: las líneas más largas de la zona en metros, con su orientación y extremos.
- `separaciones`: distancias entre líneas paralelas consecutivas (horizontales y verticales) que cruzan buena parte
  de la zona: niveles de una elevación, anchos de acera o de rampa, retiros entre lindero y pared.
- `distancia`: entre dos puntos dados (`--de`, `--a`).

La escala se calibra con las cotas de la zona (una lámina puede tener dibujos a escalas distintas); si en la zona hay
menos de 2, con las de la lámina entera, y se dice. Los segmentos de la lámina se guardan en
`<carpeta>/tmp/medir/` para no releer el PDF en cada llamada (una lámina de Tocumen trae más de un millón de trazos).

Uso:
  python scripts/medir_dibujo.py --pdf original.pdf --pagina N --zona x0,y0,x1,y1 [--de x,y --a x,y] [--carpeta DIR]
Imprime un JSON.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import statistics
import sys
from pathlib import Path
from typing import Optional

RAIZ = Path(__file__).resolve().parent.parent
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

from precheck.planos import detectores as de  # noqa: E402
from precheck.planos import medicion as me  # noqa: E402

PT_M = me._PT_M
#: Escalas de arquitectura (detalles a localización). Una escala implícita a ≤ SNAP de una de ellas se redondea.
ESCALAS = (10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000)
SNAP = 0.01
#: Error máximo entre la cota escrita y la línea medida para que la cota cuente como control.
TOL_COTA = 0.02
#: Cotas que deben coincidir para dar la escala por comprobada.
MIN_COTAS = 2
#: Texto de cota: número en metros con decimales, con «m» opcional. «+3.00» (nivel) o «12.50 m²» no lo son.
COTA = re.compile(r"^(\d{1,4})[.,](\d{1,3})\s*(?:m|ml|mts?\.?)?$", re.IGNORECASE)
#: Emparejamiento: recta casi paralela al texto, a esta distancia como mucho (en alturas de letra) y con el texto
#: dentro del tramo; se prueban las CANDIDATAS más cercanas.
PARALELO = 0.97
DIST_LETRAS = 4.0
CANDIDATAS = 5
#: Trazos más cortos que esto (pt) no se guardan (tramas, letras dibujadas).
LARGO_MIN_PT = 1.0
#: Separaciones: líneas que cruzan al menos esta fracción de la zona; las que caen a menos de AGRUPA_PT se juntan.
CRUCE_MIN = 0.25
AGRUPA_PT = 0.5
SEP_MIN_M = 0.05
MAX_COTAS, MAX_SEGMENTOS, MAX_SEPARACIONES = 40, 25, 30


# ---------------------------------------------------------------------------------------------------------------
# Geometría pura (puntos de la hoja como se lee; x a la derecha, y hacia abajo). Se prueba con datos sintéticos.

def valor_cota(texto: str) -> Optional[float]:
    m = COTA.match(texto.strip())
    return float(f"{m[1]}.{m[2]}") if m else None


def candidatas(cota, segs) -> list[tuple[int, float]]:
    """Tramos que puede medir una cota, del más cercano al más lejano: (desplazamiento en pt de la recta respecto del
    texto, largo en pt). `cota` tiene x, y, tam, dx, dy y caja; `segs` es un arreglo (N, ≥4) x0, y0, x1, y1.

    Una línea de cota suele venir partida por su propio texto (y el texto, con un recuadro blanco detrás del mismo
    ancho en todas las cotas, que daría una escala falsa). Por eso: se ignora lo que cae dentro del recuadro del texto;
    los trozos paralelos al texto sobre una misma recta se unen si el hueco entre ellos no pasa del ancho del texto más
    dos letras; y el tramo que contiene el texto se corta en las marcas que lo cruzan (rayitas oblicuas o líneas de
    extensión), porque en una cadena de cotas cada texto mide solo su trozo."""
    import numpy as np  # noqa: PLC0415

    s = np.asarray(segs, dtype=float)
    if not len(s):
        return []
    ux, uy = cota.dx, cota.dy
    nx, ny = -uy, ux
    tam = max(cota.tam, 1.0)
    ancho = abs(cota.caja[2] - cota.caja[0]) if abs(ux) >= abs(uy) else abs(cota.caja[3] - cota.caja[1])
    tope = DIST_LETRAS * tam
    # Coordenadas de los extremos en el sistema del texto: t a lo largo de la escritura, o a lo ancho.
    ax, ay, bx, by = s[:, 0] - cota.x, s[:, 1] - cota.y, s[:, 2] - cota.x, s[:, 3] - cota.y
    ta, tb = ax * ux + ay * uy, bx * ux + by * uy
    oa, ob = ax * nx + ay * ny, bx * nx + by * ny
    largo = np.hypot(bx - ax, by - ay)
    with np.errstate(divide="ignore", invalid="ignore"):
        cos = np.abs((tb - ta) / largo)
    c0, c1, c2, c3 = cota.caja
    dentro = ((np.minimum(s[:, 0], s[:, 2]) >= c0 - 1.5) & (np.maximum(s[:, 0], s[:, 2]) <= c2 + 1.5)
              & (np.minimum(s[:, 1], s[:, 3]) >= c1 - 1.5) & (np.maximum(s[:, 1], s[:, 3]) <= c3 + 1.5))
    par = (largo > 0) & (cos >= PARALELO) & ~dentro & (np.abs((oa + ob) / 2) <= tope)
    marcas = (largo > 0) & (cos < 0.9) & ~dentro
    tramos = []
    if not par.any():
        return []
    grupos: dict[float, list[tuple[float, float]]] = {}
    for o, t0, t1 in zip((oa[par] + ob[par]) / 2, np.minimum(ta[par], tb[par]), np.maximum(ta[par], tb[par])):
        grupos.setdefault(round(float(o) * 2) / 2, []).append((float(t0), float(t1)))
    hueco = ancho + 2 * tam
    for o, intervalos in grupos.items():
        intervalos.sort()
        unidos = [list(intervalos[0])]
        for t0, t1 in intervalos[1:]:
            if t0 - unidos[-1][1] <= hueco:
                unidos[-1][1] = max(unidos[-1][1], t1)
            else:
                unidos.append([t0, t1])
        tramo = next(((a, b) for a, b in unidos if a <= 0.5 * ancho and b >= -0.5 * ancho), None)
        if tramo is None:
            continue
        a, b = tramo
        # Marcas que cruzan la recta (o la tocan a ≤ 1 pt) dentro del tramo y fuera del texto.
        m0, m1 = oa[marcas] - o, ob[marcas] - o
        cruza = (m0 * m1 <= 0) | (np.minimum(np.abs(m0), np.abs(m1)) <= 1.0)
        with np.errstate(divide="ignore", invalid="ignore"):
            k = np.where(m1 != m0, m0 / (m0 - m1), 0.0)
        tc = ta[marcas] + np.clip(k, 0, 1) * (tb[marcas] - ta[marcas])
        tc = tc[cruza & (tc >= a - 1.0) & (tc <= b + 1.0)]
        izq, der = tc[tc < -0.5 * ancho], tc[tc > 0.5 * ancho]
        a2 = float(izq.max()) if len(izq) else a
        b2 = float(der.min()) if len(der) else b
        if b2 - a2 >= ancho:
            tramos.append((abs(o), b2 - a2))
    tramos.sort()
    return [(k, largo_t) for k, (_, largo_t) in enumerate(tramos[:CANDIDATAS])]


def calibrar(cotas: list[tuple[float, list[tuple[int, float]]]]) -> Optional[dict]:
    """Escala que más cotas explican. `cotas`: (valor en m, candidatas) por cota. Para cada escala implícita de
    cualquier candidata se cuentan las cotas que tienen alguna candidata a ≤ TOL_COTA; gana la de más cotas y su
    valor es la mediana de las implícitas que la apoyan (redondeada a la escala estándar si cae a ≤ SNAP). None si
    ninguna escala junta MIN_COTAS cotas."""
    implicitas = [(k, v / (largo * PT_M)) for k, (v, cand) in enumerate(cotas) for _, largo in cand if largo > 0 and v > 0]
    mejor = None
    for _, e in implicitas:
        apoyo = {}
        for k, e2 in implicitas:
            if abs(e2 - e) / e <= TOL_COTA and (k not in apoyo or abs(e2 - e) < abs(apoyo[k] - e)):
                apoyo[k] = e2
        if mejor is None or len(apoyo) > len(mejor):
            mejor = apoyo
    if not mejor or len(mejor) < MIN_COTAS:
        return None
    valor = statistics.median(mejor.values())
    estandar = min(ESCALAS, key=lambda s: abs(s - valor) / s)
    if abs(estandar - valor) / estandar <= SNAP:
        valor = float(estandar)
    return {"valor": round(valor, 1), "cotas": sorted(mejor), "estandar": valor in ESCALAS}


def separaciones(segs, zona: tuple[float, float, float, float], horizontal: bool) -> list[tuple[float, float]]:
    """Posiciones (pt) de las líneas horizontales (o verticales) que cruzan al menos CRUCE_MIN de la zona, agrupadas
    a AGRUPA_PT; devuelve pares (desde, hasta) consecutivos."""
    import numpy as np  # noqa: PLC0415

    s = np.asarray(segs, dtype=float)
    if not len(s):
        return []
    x0, y0, x1, y1 = zona
    a, b, c, d = s[:, 0], s[:, 1], s[:, 2], s[:, 3]
    largo = np.hypot(c - a, d - b)
    if horizontal:
        recta, p, lo, hi, z0, z1, q0, q1 = np.abs(d - b), (b + d) / 2, np.minimum(a, c), np.maximum(a, c), x0, x1, y0, y1
    else:
        recta, p, lo, hi, z0, z1, q0, q1 = np.abs(c - a), (a + c) / 2, np.minimum(b, d), np.maximum(b, d), y0, y1, x0, x1
    cruce = np.clip(np.minimum(hi, z1) - np.maximum(lo, z0), 0, None)
    ok = (largo > 0) & (recta <= 0.02 * largo) & (p >= q0) & (p <= q1) & (cruce >= CRUCE_MIN * (z1 - z0))
    grupos: list[float] = []
    for v in np.sort(p[ok]):
        if grupos and v - grupos[-1] <= AGRUPA_PT:
            continue
        grupos.append(float(v))
    return list(zip(grupos, grupos[1:]))


def en_zona(segs, zona):
    """Segmentos (arreglo N×≥4) cuyo rectángulo envolvente toca la zona."""
    import numpy as np  # noqa: PLC0415

    s = np.asarray(segs, dtype=float)
    if not len(s):
        return s
    x0, y0, x1, y1 = zona
    ok = (np.maximum(s[:, 0], s[:, 2]) >= x0) & (np.minimum(s[:, 0], s[:, 2]) <= x1) & (np.maximum(s[:, 1], s[:, 3]) >= y0) & (np.minimum(s[:, 1], s[:, 3]) <= y1)
    return s[ok]


# ---------------------------------------------------------------------------------------------------------------
# Lectura del caso.

def _segmentos_pagina(pagina, n: int, cache: Optional[Path]):
    import numpy as np  # noqa: PLC0415

    ruta = cache / f"segs_v2_p{n}.npy" if cache else None
    if ruta and ruta.exists():
        return np.load(ruta).astype(float)
    s = de.segmentos(pagina)
    if len(s):
        s = s[np.hypot(s[:, 2] - s[:, 0], s[:, 3] - s[:, 1]) >= LARGO_MIN_PT, :4]
        # La misma línea suele venir dibujada 2 a 4 veces (en un sentido y en el otro): se deja una.
        a, b = s[:, :2], s[:, 2:4]
        primero = (a[:, 0] < b[:, 0]) | ((a[:, 0] == b[:, 0]) & (a[:, 1] <= b[:, 1]))
        s = np.where(primero[:, None], s, np.hstack([b, a]))
        _, unicos = np.unique(np.round(s, 1), axis=0, return_index=True)
        s = s[np.sort(unicos)].astype(np.float32)
    if ruta:
        ruta.parent.mkdir(parents=True, exist_ok=True)
        np.save(ruta, s)
    return s.astype(float)


def _json(ruta: Optional[Path]) -> Optional[dict]:
    try:
        return json.loads(ruta.read_text(encoding="utf-8")) if ruta and ruta.exists() else None
    except (OSError, ValueError):
        return None


def escala_declarada(carpeta: Optional[Path], n: int) -> tuple[Optional[float], str]:
    """La escala de la hoja en regiones.json o la de la lámina en extraccion.json (sin comprobar)."""
    if not carpeta:
        return None, "sin carpeta del caso"
    sys.path.insert(0, str(RAIZ / "scripts"))
    import medir_retiro as mr  # noqa: PLC0415

    reg = _json(mr._buscar(carpeta, "regiones.json", None)) or {}
    esc = ((reg.get("paginas") or {}).get(str(n)) or {}).get("escala")
    if isinstance(esc, (int, float)) and esc > 0:
        return float(esc), "regiones.json (escala de la hoja)"
    from precheck.planos import regiones as rg  # noqa: PLC0415

    esc = rg._escalas_lamina(_json(mr._buscar(carpeta, "extraccion.json", None))).get(n)
    return (float(esc), "extraccion.json (escala de la lámina)") if esc else (None, "ni regiones.json ni la lámina dicen la escala")


def _f(v: float) -> float:
    return round(v, 3)


def medir(pdf: str, pagina: int, zona_frac: tuple[float, float, float, float], de_pt: Optional[tuple[float, float]] = None,
          a_pt: Optional[tuple[float, float]] = None, carpeta: Optional[str] = None) -> dict:
    """Ver el docstring del módulo. `zona_frac`, `de_pt` y `a_pt` en fracciones 0–1 de la hoja como se lee."""
    import pymupdf  # noqa: PLC0415

    with pymupdf.open(pdf) as doc:
        return _medir_doc(doc, pagina, zona_frac, de_pt, a_pt, carpeta)


def _medir_doc(doc, pagina: int, zona_frac, de_pt, a_pt, carpeta: Optional[str]) -> dict:
    if not 1 <= pagina <= len(doc):
        return {"error": f"la lámina {pagina} no existe (el PDF tiene {len(doc)})"}
    pg = doc[pagina - 1]
    W, H = pg.rect.width, pg.rect.height
    carpeta_p = Path(carpeta) if carpeta else None
    segs = _segmentos_pagina(pg, pagina, carpeta_p / "tmp" / "medir" if carpeta_p else None)
    if not len(segs):
        return {"lamina": pagina, "error": "la lámina no tiene dibujo vectorial (escaneada): no se puede medir aquí; usa las cotas escritas"}
    fx0, fy0, fx1, fy1 = zona_frac
    zona = (fx0 * W, fy0 * H, fx1 * W, fy1 * H)
    mx, my = 0.1 * (zona[2] - zona[0]), 0.1 * (zona[3] - zona[1])
    amplia = (zona[0] - mx, zona[1] - my, zona[2] + mx, zona[3] + my)
    palabras = de.palabras(pg)

    def cotas_en(z):
        out = []
        for w in palabras:
            v = valor_cota(w.texto)
            if v is not None and z[0] <= w.x <= z[2] and z[1] <= w.y <= z[3]:
                out.append((w, v))
        return out

    locales = en_zona(segs, amplia)
    cotas = cotas_en(amplia)
    pares = [(v, candidatas(w, locales)) for w, v in cotas]
    cal = calibrar(pares)
    alcance = "zona"
    if cal is None:
        todas = cotas_en((0, 0, W, H))
        pares_h = [(v, candidatas(w, segs)) for w, v in todas]
        cal_h = calibrar(pares_h)
        if cal_h:
            cal, alcance = cal_h, "lámina entera (en la zona hay menos de 2 cotas que coincidan)"
            cotas_ctrl = [(todas[k][1], pares_h[k][1]) for k in cal_h["cotas"]]
    if cal:
        escala = cal["valor"]
        fuente = "comprobada"
        if alcance == "zona":
            cotas_ctrl = [(pares[k][0], pares[k][1]) for k in cal["cotas"]]
        controles = []
        for v, cand in cotas_ctrl[:8]:
            largo = min((l for _, l in cand), key=lambda l: abs(l * escala * PT_M - v))
            controles.append({"cota_m": v, "medido_m": round(largo * escala * PT_M, 2), "error_pct": round(100 * abs(largo * escala * PT_M - v) / v, 1)})
        nota = (f"{len(cal['cotas'])} cotas coinciden a ≤ {TOL_COTA:.0%} con esta escala ({alcance})"
                + ("" if cal["estandar"] else "; escala no estándar: el dibujo pudo ajustarse a la hoja"))
        info = {"valor": escala, "fuente": fuente, "nota": nota, "cotas_control": controles}
    else:
        escala, origen = escala_declarada(carpeta_p, pagina)
        fuente = "declarada" if escala else "sin_escala"
        info = {"valor": escala, "fuente": fuente,
                "nota": (f"sin comprobar con cotas ({origen}): confianza 0.8 como mucho" if escala
                         else f"no hay 2 cotas que coincidan y {origen}: no conviertas puntos a metros")}

    m = (lambda pt: round(pt * escala * PT_M, 2)) if escala else (lambda pt: None)
    salida: dict = {"lamina": pagina, "zona": [fx0, fy0, fx1, fy1], "escala": info}

    lista_cotas = []
    for (w, v), (_, cand) in zip(cotas, pares):
        if not (zona[0] <= w.x <= zona[2] and zona[1] <= w.y <= zona[3]):
            continue
        item = {"texto": w.texto, "x": _f(w.x / W), "y": _f(w.y / H)}
        if escala:
            largo = min((l for _, l in cand), key=lambda l: abs(l * escala * PT_M - v)) if cand else None
            # Solo se da la línea cuando confirma la cota: una cota sin línea recta de ese largo (un lindero quebrado,
            # un texto de otro dibujo) no es un error del plano y su valor sigue siendo el escrito.
            item["coincide"] = largo is not None and abs(largo * escala * PT_M - v) / v <= TOL_COTA
            if item["coincide"]:
                item["linea_medida_m"] = m(largo)
        lista_cotas.append(item)
    salida["cotas"] = lista_cotas[:MAX_COTAS]
    if len(lista_cotas) > MAX_COTAS:
        salida["cotas_sin_mostrar"] = len(lista_cotas) - MAX_COTAS

    dentro = en_zona(segs, zona)
    import numpy as np  # noqa: PLC0415

    # Las líneas que se listan quedan enteras dentro de la zona (con su margen): el marco de la hoja o un lindero que
    # solo la cruza no son medidas de lo que se pidió.
    enteras = dentro[(np.minimum(dentro[:, 0], dentro[:, 2]) >= amplia[0]) & (np.maximum(dentro[:, 0], dentro[:, 2]) <= amplia[2])
                     & (np.minimum(dentro[:, 1], dentro[:, 3]) >= amplia[1]) & (np.maximum(dentro[:, 1], dentro[:, 3]) <= amplia[3])] if len(dentro) else dentro
    orden = np.argsort(-np.hypot(enteras[:, 2] - enteras[:, 0], enteras[:, 3] - enteras[:, 1])) if len(enteras) else []
    segs_out = []
    for s in enteras[orden[:MAX_SEGMENTOS]] if len(enteras) else []:
        largo = math.hypot(s[2] - s[0], s[3] - s[1])
        ori = "H" if abs(s[3] - s[1]) <= 0.02 * largo else "V" if abs(s[2] - s[0]) <= 0.02 * largo else "oblicuo"
        segs_out.append({"largo_m": m(largo), "largo_pt": round(largo, 1), "orientacion": ori,
                         "de": [_f(s[0] / W), _f(s[1] / H)], "a": [_f(s[2] / W), _f(s[3] / H)]})
    salida["segmentos"] = segs_out

    seps = {}
    for nombre, horiz, tam in (("horizontales", True, H), ("verticales", False, W)):
        filas = [{"desde": _f(p0 / tam), "hasta": _f(p1 / tam), "m": m(p1 - p0)} for p0, p1 in separaciones(dentro, zona, horiz)]
        filas = [f for f in filas if f["m"] is None or f["m"] >= SEP_MIN_M]
        seps[nombre] = filas[:MAX_SEPARACIONES]
    salida["separaciones"] = {**seps, "nota": "distancias entre líneas paralelas consecutivas que cruzan al menos un cuarto de la zona (y de arriba abajo para las horizontales, x de izquierda a derecha para las verticales)"}

    if de_pt and a_pt:
        d = math.hypot((a_pt[0] - de_pt[0]) * W, (a_pt[1] - de_pt[1]) * H)
        salida["distancia"] = {"de": list(de_pt), "a": list(a_pt), "m": m(d), "pt": round(d, 1)}
    return salida


def _par(texto: str, n: int) -> tuple[float, ...]:
    v = tuple(float(x) for x in texto.split(","))
    if len(v) != n or any(not 0 <= x <= 1 for x in v):
        raise argparse.ArgumentTypeError(f"se esperaban {n} fracciones 0–1 separadas por comas")
    return v


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--pagina", type=int, required=True)
    ap.add_argument("--zona", type=lambda t: _par(t, 4), required=True)
    ap.add_argument("--de", type=lambda t: _par(t, 2))
    ap.add_argument("--a", type=lambda t: _par(t, 2))
    ap.add_argument("--carpeta")
    a = ap.parse_args(argv)
    x0, y0, x1, y1 = a.zona
    if x1 <= x0 or y1 <= y0:
        print(json.dumps({"error": "zona inválida: x1 > x0 y y1 > y0"}, ensure_ascii=False))
        return 0
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(medir(a.pdf, a.pagina, a.zona, a.de, a.a, a.carpeta), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
