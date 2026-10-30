"""Medición del contenido técnico de un plano PDF (skill mupa-medicion-planos): pisos desde las elevaciones,
polígono, área y frente del lote desde la geometría vectorial, y unidades de vivienda de la planta típica.

Cada resultado es un hecho con procedencia, en el mismo formato que precheck/planos/extractores.py. Ante la duda
(interpretación de la norma que cambia el conteo, escala sin confirmar, varios frentes), estado «revision».
"""
from __future__ import annotations

import math
import re
from collections import defaultdict
from typing import Iterable, Optional

from precheck.planos.extractores import _hecho, _sin_tildes, bloque_normativo, es_norma, escalas
from precheck.planos.lineas import Linea, es_escaneada

# ---------------------------------------------------------------------------------------------------------------
# Pisos (Acuerdo 61 de 2021, PLOT: definición de «Altura máxima de edificio», «Sótano» y Art. 38).

#: Art. 38: «Se entenderá por piso, un nivel habitable de hasta 4.50 m de altura entre losas».
ALTURA_MAX_PISO_M = 4.50
#: Un rótulo y su cota están en la misma columna de la elevación si sus centros difieren menos que esto (pt).
_TOL_COLUMNA = 15.0
#: Menos niveles emparejados que esto no es una elevación (puede ser un rótulo suelto en una planta).
_MIN_NIVELES = 3

_ROTULO_NIVEL = re.compile(r"^(?!.*\bPLANTA\b)(?!SUBE\b).{0,28}\bNIV(?:EL)?\b.{0,24}$|^LOSA TECHO$")
_COTA = re.compile(r"^[+±-]\s?(\d{1,3}\.\d{2})$")
_BAJO_RASANTE = re.compile(r"SOTANO")
_PLANTA_BAJA = re.compile(r"\bPB\b|PLANTA BAJA|\bP\.B\.?")
_NO_ES_PISO = re.compile(r"MAQUINAS|TANQUE|LOSA TECHO|\bTECHO\b")
_SOCIAL_SUPERIOR = re.compile(r"\bAS\s*\d*\b|AREA SOCIAL|AZOTEA|TERRAZA")
_HABITABLE = re.compile(r"PISO HABITABLE")

_NOTA_NORMA = ("Cuenta según el Acuerdo 61 de 2021 (PLOT), definición de «Altura máxima de edificio» y Art. 38: "
               "desde la planta baja hasta el último piso, con el mezzanine; sin sótanos ni cuarto de máquinas.")


def _centro(ln: Linea) -> tuple[float, float]:
    return (ln.bbox[0] + ln.bbox[2]) / 2, (ln.bbox[1] + ln.bbox[3]) / 2


def _union(lineas: list[Linea], metodo: Optional[str] = None, confianza: float = 0.99) -> Linea:
    return Linea("", lineas[0].pagina, (min(ln.bbox[0] for ln in lineas), min(ln.bbox[1] for ln in lineas),
                                        max(ln.bbox[2] for ln in lineas), max(ln.bbox[3] for ln in lineas)),
                 metodo or lineas[0].metodo, confianza)


def _niveles_de_pagina(lineas: list[Linea]) -> tuple[list[dict], list[float]]:
    """Rótulos de nivel emparejados con su cota por columna. Devuelve los niveles y la columna de cada «PISO HABITABLE»."""
    texto = [(ln, _sin_tildes(ln.texto).upper().strip()) for ln in lineas]
    rotulos = [(ln, t) for ln, t in texto if _ROTULO_NIVEL.match(t)]
    cotas = [(ln, float(m.group(1))) for ln, t in texto if (m := _COTA.match(t))]
    habitables = [ln for ln, t in texto if _HABITABLE.search(t)]
    if len(rotulos) < _MIN_NIVELES or not cotas:
        return [], []
    # La columna es el eje en que varían los rótulos (en hojas giradas 270° los niveles se leen a lo largo de x).
    xs, ys = [_centro(ln)[0] for ln, _ in rotulos], [_centro(ln)[1] for ln, _ in rotulos]
    eje = 0 if max(xs) - min(xs) >= max(ys) - min(ys) else 1
    niveles = []
    for ln, t in rotulos:
        c = _centro(ln)
        candidatas = [(abs(_centro(k)[eje] - c[eje]), abs(_centro(k)[1 - eje] - c[1 - eje]), v, k) for k, v in cotas]
        dif, _, cota, k = min(candidatas, key=lambda x: (round(x[0]), x[1]))
        if dif <= _TOL_COLUMNA:
            niveles.append({"nombre": ln.texto.strip(), "cota": cota, "_t": t, "_ln": ln, "_eje": c[eje]})
    return niveles, [_centro(h)[eje] for h in habitables]


def pisos(lineas: Iterable[Linea]) -> dict:
    """proyecto.pisos_totales desde la elevación o el corte con más niveles."""
    por_pagina: dict[int, list[Linea]] = defaultdict(list)
    for ln in lineas:
        por_pagina[ln.pagina].append(ln)
    mejor: tuple[list[dict], list[float]] = ([], [])
    for pag in sorted(por_pagina):
        niveles, habitables = _niveles_de_pagina(por_pagina[pag])
        if len(niveles) > len(mejor[0]):
            mejor = (niveles, habitables)
    niveles, habitables = mejor
    if not niveles:
        return _hecho("proyecto.pisos_totales", None, None, 0.5, "no_encontrado",
                      nota="No se encontró una elevación o un corte con los niveles rotulados y sus cotas.")
    niveles.sort(key=lambda n: n["cota"])
    pb = next((n for n in niveles if _PLANTA_BAJA.search(n["_t"])), None)
    fuente = _union([n["_ln"] for n in niveles])
    if pb is None:
        return _hecho("proyecto.pisos_totales", None, fuente, 0.5, "revision",
                      nota="Hay niveles rotulados pero ninguno se identifica como planta baja; no se puede fijar el nivel 0.")
    sobre = [n for n in niveles if n["cota"] >= pb["cota"] and not _BAJO_RASANTE.search(n["_t"])]
    contados = [n for n in sobre if not _NO_ES_PISO.search(n["_t"])]
    notas = [_NOTA_NORMA]

    def altura(n: dict) -> Optional[float]:
        arriba = [m["cota"] for m in sobre if m["cota"] > n["cota"]]
        return round(min(arriba) - n["cota"], 2) if arriba else None

    candidatos = [len(contados)]
    ultimo = contados[-1]
    if ultimo is not pb and _SOCIAL_SUPERIOR.search(ultimo["_t"]):
        h = altura(ultimo)
        marcado = any(abs(col - ultimo["_eje"]) <= _TOL_COLUMNA for col in habitables)
        alto = f" ({h:.2f} m entre losas)" if h is not None else ""
        if marcado:
            candidatos = [len(contados), len(contados) - 1]
            notas.append(f"El último nivel, «{ultimo['nombre']}»{alto}, es un área social y el plano lo rotula "
                         "«ULTIMO PISO HABITABLE»: por el Art. 38 cuenta como piso. No contaría si fuera azotea con "
                         "estructuras que solo cubren áreas sociales.")
        else:
            candidatos = [len(contados) - 1, len(contados)]
            notas.append(f"El último nivel, «{ultimo['nombre']}»{alto}, parece azotea o área social: el Art. 38 no la "
                         "cuenta salvo que sea espacio habitable.")
    altos = [(n, h) for n in contados if (h := altura(n)) is not None and h > ALTURA_MAX_PISO_M]
    if altos:
        candidatos = [candidatos[0], candidatos[0] + len(altos)]
        notas.append("Entre losas de más de 4.50 m (el Art. 38 define el piso hasta 4.50 m): "
                     + ", ".join(f"«{n['nombre']}» {h:.2f} m" for n, h in altos) + ".")
    bajos = [n["nombre"] for n in niveles if n not in sobre]
    if bajos:
        notas.append("No cuentan (bajo la planta baja): " + ", ".join(bajos) + ".")
    lista = [{"nombre": n["nombre"], "cota": n["cota"], "altura_m": altura(n)} for n in contados]
    if len(set(candidatos)) > 1:
        return _hecho("proyecto.pisos_totales", None, fuente, 0.6, "revision", candidatos=candidatos, niveles=lista,
                      nota=" ".join(notas))
    return _hecho("proyecto.pisos_totales", candidatos[0], fuente, 0.9, "ok", niveles=lista, nota=" ".join(notas))


# ---------------------------------------------------------------------------------------------------------------
# Lote: polígono cerrado a escala, área y frente.

_PT_M = 0.0254 / 72  # metros por punto a escala 1:1
ESCALAS_ESTANDAR = (50, 75, 100, 125, 150, 200, 250, 300, 400, 500)
#: El área del polígono a una escala debe coincidir con el área escrita del lote dentro de esto.
TOL_AREA = 0.02
#: Un lado es frente si su punto medio está a menos de esto (pt) de un rótulo de acera o calle.
_DIST_CALLE = 120.0
_CALLE = re.compile(r"ACERA|\bCALLE\b|AVENIDA|\bAVE\b")
_NO_CALLE = re.compile(r"INTERNA|CENTRO DE CALLE")
#: «CALLE UNO Y CALLE DOS»: la dirección nombra dos calles (lote de esquina o entre calles).
_DOS_CALLES = re.compile(r"\bY\s+(?:CALLE|AVENIDA|AVE\.?)\s")


def _poligonos(pagina, dibujos: Optional[list] = None) -> list[list[tuple[float, float]]]:
    """Polilíneas cerradas de la página (vértices sin repetir). `dibujos`: los de `get_drawings()` si ya se leyeron."""
    salida = []
    for dr in (pagina.get_drawings() if dibujos is None else dibujos):
        pts = []
        for it in dr["items"]:
            if it[0] == "l":
                pts += [(it[1].x, it[1].y), (it[2].x, it[2].y)]
            elif it[0] == "re":
                r = it[1]
                pts += [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]
            elif it[0] == "qu":
                q = it[1]
                pts += [(p.x, p.y) for p in (q.ul, q.ur, q.lr, q.ll)]
        figura = any(it[0] in ("re", "qu") for it in dr["items"])  # rectángulos y cuadriláteros ya son cerrados
        v: list[tuple[float, float]] = []
        for p in pts:
            if not v or abs(p[0] - v[-1][0]) + abs(p[1] - v[-1][1]) > 0.01:
                v.append(p)
        cerrado = figura or bool(dr.get("closePath")) or (len(v) > 3 and abs(v[0][0] - v[-1][0]) + abs(v[0][1] - v[-1][1]) < 1)
        if len(v) > 1 and abs(v[0][0] - v[-1][0]) + abs(v[0][1] - v[-1][1]) < 1:
            v = v[:-1]
        if cerrado and len(v) >= 3:
            salida.append(v)
    return salida


def _area(v: list[tuple[float, float]]) -> float:
    return abs(sum(v[i][0] * v[i - 1][1] - v[i - 1][0] * v[i][1] for i in range(len(v)))) / 2


#: Un lote es un dibujo: dentro tiene trazos (la planta, líneas de construcción, cotas), no solo texto. Un cuadro de
#: notas, una tabla o una leyenda que a alguna escala mide el área del lote no lo es. Cuentan los trazos enteros dentro
#: del polígono que no son reglas de tabla (horizontales o verticales de más del 60 % del cuadro).
MIN_TRAZOS_DENTRO = 4
#: …y tiene que haber más trazos de dibujo que palabras dentro / 2 (una leyenda tiene símbolos, pero mucho texto).
TRAZOS_POR_PALABRA = 0.5
#: Un cuadro titulado así (dentro o justo encima) es texto, no el lote.
_TITULO_CUADRO = re.compile(r"^\s*(?:NOTAS?|NOTA\s+IMPORTANTE|LEYENDA|SIMBOLOG|CUADRO|TABLA|RESUMEN|INDICE|ABREVIATURAS)\b")
#: …o está rotulado como línea de propiedad fuera del polígono y a menos de esto (pt) de su borde.
_DIST_ROTULO_PROPIEDAD = 40.0
_ROTULOS_PROPIEDAD = ("LINEA DE PROPIEDAD", "LÍNEA DE PROPIEDAD", "LINDERO")
_FRACCION_REGLA = 0.6


def _interior(v: list[tuple[float, float]]):
    from shapely.geometry import Polygon  # noqa: PLC0415

    p = Polygon(v)
    if not p.is_valid:
        p = p.buffer(0)
    if p.is_empty:
        return p
    return p.buffer(-max(0.5, 0.005 * math.sqrt(max(p.area, 0.0))))


def trazos_dentro(trazos, v: list[tuple[float, float]]) -> int:
    """Cuántos trazos (filas x0, y0, x1, y1 de `detectores.segmentos`) quedan enteros dentro del polígono, sin contar
    sus propios lados ni las reglas de una tabla (horizontales o verticales que cruzan más del 60 % del cuadro)."""
    import numpy as np  # noqa: PLC0415
    from shapely import contains_xy  # noqa: PLC0415

    if trazos is None or len(trazos) == 0:
        return 0
    q = _interior(v)
    if q.is_empty:
        return 0
    x0, y0, x1, y1 = q.bounds
    t = trazos
    caja = ((t[:, 0] >= x0) & (t[:, 0] <= x1) & (t[:, 1] >= y0) & (t[:, 1] <= y1)
            & (t[:, 2] >= x0) & (t[:, 2] <= x1) & (t[:, 3] >= y0) & (t[:, 3] <= y1))
    t = t[caja]
    if len(t) == 0:
        return 0
    t = t[contains_xy(q, t[:, 0], t[:, 1]) & contains_xy(q, t[:, 2], t[:, 3])]
    dx, dy = np.abs(t[:, 2] - t[:, 0]), np.abs(t[:, 3] - t[:, 1])
    regla = (((dy <= 0.02 * dx) & (dx >= _FRACCION_REGLA * (x1 - x0)))
             | ((dx <= 0.02 * dy) & (dy >= _FRACCION_REGLA * (y1 - y0))))
    return int((~regla).sum())


def es_dibujo(pagina, v: list[tuple[float, float]], trazos, palabras: Optional[list] = None) -> bool:
    """¿El polígono (en el sistema del PDF sin rotar) es un dibujo y no un cuadro de texto? Sí si contiene trazos de
    dibujo (más que la mitad de sus palabras y sin título de cuadro: NOTAS, LEYENDA, CUADRO…), o si una «LÍNEA DE
    PROPIEDAD» está rotulada fuera de él junto a su borde (el rótulo dentro de una nota no cuenta).
    `palabras`: las de `get_text("words")` de la página, si ya se leyeron."""
    from shapely.geometry import Point, Polygon  # noqa: PLC0415

    q = _interior(v)
    pol = Polygon(v)
    palabras = pagina.get_text("words") if palabras is None else palabras
    dentro = [w for w in palabras if not q.is_empty and q.contains(Point((w[0] + w[2]) / 2, (w[1] + w[3]) / 2))]
    x0, y0, x1, y1 = pol.bounds
    encima = [w for w in palabras if x0 - 5 <= (w[0] + w[2]) / 2 <= x1 + 5 and y0 - 40 <= (w[1] + w[3]) / 2 <= y0 + 5]
    lineas: dict[tuple, list] = {}
    for w in dentro + encima:
        lineas.setdefault((w[5], w[6]), []).append(w[4])
    if any(_TITULO_CUADRO.match(_sin_tildes(" ".join(t)).upper()) for t in lineas.values()):
        return False
    n = trazos_dentro(trazos, v)
    if n >= MIN_TRAZOS_DENTRO and n >= TRAZOS_POR_PALABRA * len(dentro):
        return True
    borde = pol.exterior
    for rotulo in _ROTULOS_PROPIEDAD:
        for r in pagina.search_for(rotulo):
            c = Point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)
            if not pol.contains(c) and borde.distance(c) <= _DIST_ROTULO_PROPIEDAD:
                return True
    return False


def lote_por_lamina(doc, lineas: Iterable[Linea], area_declarada: float,
                    poligonos: Optional[dict[int, list]] = None, trazos: Optional[dict] = None) -> dict[int, tuple]:
    """Polígono del lote en cada lámina vectorial: {página: ((diferencia, escala no rotulada), escala, m², vértices)}.
    La escala se fija porque el área del polígono a esa escala coincide con la escrita (tolerancia TOL_AREA), y el
    polígono tiene que ser un dibujo (`es_dibujo`), no un cuadro de texto. `poligonos` ({página: polígonos de
    `_poligonos`}) y `trazos` ({página: `detectores.trazos_crudos`}) evitan volver a leer los trazos; sin ellos, los
    dibujos de cada página se leen una sola vez."""
    from precheck.planos.detectores import trazos_crudos  # noqa: PLC0415

    rotuladas: dict[int, set[int]] = defaultdict(set)
    for e in escalas(list(lineas)):
        rotuladas[e["fuente"]["pagina"]].add(int(e["valor"]))
    # El lote suele dibujarse en varias láminas (conjunto, plantas): se busca en todas las vectoriales.
    por_lamina: dict[int, tuple] = {}
    for n in range(1, len(doc) + 1):
        pagina = doc[n - 1]
        if es_escaneada(pagina):
            continue  # sin trazos vectoriales que medir
        dibujos = None
        if poligonos is not None and n in poligonos:
            de_pagina = poligonos[n]
        else:
            dibujos = pagina.get_drawings()
            de_pagina = _poligonos(pagina, dibujos)
        candidatos = []
        for v in de_pagina:
            a_pt = _area(v)
            for esc in sorted(rotuladas[n] | set(ESCALAS_ESTANDAR)):
                m2 = a_pt * (esc * _PT_M) ** 2
                dif = abs(m2 - area_declarada) / area_declarada
                if dif <= TOL_AREA:
                    candidatos.append(((dif, esc not in rotuladas[n]), esc, m2, v))
        if not candidatos:
            continue
        t = trazos.get(n) if trazos is not None else None
        if t is None:
            t = trazos_crudos(pagina.get_drawings() if dibujos is None else dibujos)
        palabras = pagina.get_text("words")
        for c in sorted(candidatos, key=lambda c: c[0]):
            if es_dibujo(pagina, c[3], t, palabras):
                por_lamina[n] = c
                break
    return por_lamina


def lote(doc, lineas: Iterable[Linea], area_declarada: Optional[float]) -> tuple[dict, dict]:
    """(lote.frente_m, lote.area_geometrica_m2). La escala se fija porque el área del polígono coincide con la escrita."""
    lineas = list(lineas)
    if not area_declarada:
        nota = "Sin el área del lote escrita en el plano no se puede confirmar la escala del dibujo."
        return (_hecho("lote.frente_m", None, None, 0.5, "no_encontrado", nota=nota),
                _hecho("lote.area_geometrica_m2", None, None, 0.5, "no_encontrado", nota=nota))
    por_pagina: dict[int, list[Linea]] = defaultdict(list)
    for ln in lineas:
        por_pagina[ln.pagina].append(ln)
    por_lamina = lote_por_lamina(doc, lineas, area_declarada)
    if not por_lamina:
        nota = (f"Ningún polígono cerrado con un dibujo dentro mide {area_declarada:,.2f} m² a una escala conocida "
                f"(tolerancia {TOL_AREA:.0%}).")
        return (_hecho("lote.frente_m", None, None, 0.5, "no_encontrado", nota=nota),
                _hecho("lote.area_geometrica_m2", None, None, 0.5, "no_encontrado", nota=nota))
    medidas = {n: _medir(doc[n - 1], n, esc, v, por_pagina[n]) for n, (_, esc, _, v) in por_lamina.items()}
    n = min(por_lamina, key=lambda k: (por_lamina[k][0], k))
    (dif, _), esc, m2, _ = por_lamina[n]
    lados, caja, _ = medidas[n]
    laminas = sorted(por_lamina)
    area = _hecho("lote.area_geometrica_m2", round(m2, 2), caja, 0.9, "ok", escala=esc, lados_m=lados,
                  nota=f"Polígono del lote a 1:{esc} (página {n}; aparece en {len(laminas)} "
                       f"{'lámina' if len(laminas) == 1 else 'láminas'}: {', '.join(map(str, laminas))}); "
                       f"el área escrita es {area_declarada:,.2f} m² (diferencia {dif:.1%}).")
    unicos = [(k, medidas[k][2][0]) for k in laminas if len(medidas[k][2]) == 1]
    varios = [(k, medidas[k][2]) for k in laminas if len(medidas[k][2]) > 1]
    esquina = next((ln for ln in lineas if _DOS_CALLES.search(_sin_tildes(ln.texto).upper())), None)
    if unicos and len({round(f[0], 1) for _, f in unicos}) == 1 and esquina:
        k, (largo, rotulo) = unicos[0]
        frente = _hecho("lote.frente_m", None, medidas[k][1], 0.6, "revision", candidatos=[largo], escala=por_lamina[k][1],
                        nota=f"El lado junto a «{rotulo.texto.strip()}» mide {largo:.2f} m (página {k}), pero la dirección "
                             f"nombra dos calles («{esquina.texto.strip()}»): el otro frente no está rotulado y el revisor "
                             "decide cuál rige.")
    elif unicos and len({round(f[0], 1) for _, f in unicos}) == 1:
        k, (largo, rotulo) = unicos[0]
        frente = _hecho("lote.frente_m", largo, medidas[k][1], 0.8, "ok", escala=por_lamina[k][1],
                        nota=f"Lado del lote junto a «{rotulo.texto.strip()}» (página {k}, 1:{por_lamina[k][1]}).")
    elif unicos or varios:
        candidatos = sorted({f[0] for _, f in unicos} | {f[0] for _, fs in varios for f in fs}, reverse=True)
        frente = _hecho("lote.frente_m", None, caja, 0.6, "revision", candidatos=candidatos, escala=esc,
                        nota="El lote da a más de una calle (esquina o entre calles) o las láminas no coinciden: "
                             "el revisor decide cuál es el frente.")
    else:
        frente = _hecho("lote.frente_m", None, caja, 0.5, "revision", candidatos=lados, escala=esc,
                        nota="Ningún lado del lote tiene una acera o calle rotulada al lado; estos son todos sus lados.")
    return frente, area


def _medir(pagina, n: int, esc: int, v: list[tuple[float, float]], lineas: list[Linea]):
    """Lados en metros, caja del polígono en la orientación de lectura y lados que dan a una acera o calle rotulada."""
    rot = [_rotar(pagina, x, y) for x, y in v]
    caja = Linea("", n, (min(p[0] for p in rot), min(p[1] for p in rot), max(p[0] for p in rot), max(p[1] for p in rot)),
                 "pdf_geometria", 0.9)
    lados = [round(math.dist(v[i], v[(i + 1) % len(v)]) * esc * _PT_M, 2) for i in range(len(v))]
    calles = [ln for ln in lineas if _CALLE.search(t := _sin_tildes(ln.texto).upper()) and not _NO_CALLE.search(t)]
    frentes = []
    for i in range(len(rot)):
        a, b = rot[i], rot[(i + 1) % len(rot)]
        medio = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        cerca = sorted(((math.dist(medio, _centro(ln)), ln) for ln in calles if math.dist(medio, _centro(ln)) <= _DIST_CALLE),
                       key=lambda x: x[0])
        if cerca:
            frentes.append((lados[i], cerca[0][1]))
    return lados, caja, frentes


def _rotar(pagina, x: float, y: float) -> tuple[float, float]:
    import pymupdf  # noqa: PLC0415

    p = pymupdf.Point(x, y) * pagina.rotation_matrix
    return p.x, p.y


# ---------------------------------------------------------------------------------------------------------------
# Unidades de vivienda y densidad.

_TIPICA = re.compile(r"TIPICA.*?NIV\s*\+?\s*(\d{3,4})\s*@\s*\+?\s*(\d{3,4})")
_APARTAMENTO = re.compile(r"^APARTAMENTO\s+([A-Z0-9]{1,3})$")
_DENSIDAD = re.compile(r"DENSIDAD[^0-9]{0,40}(\d[\d,]*(?:\.\d+)?)\s*(?:PERS|HAB)")


def unidades(lineas: Iterable[Linea]) -> dict:
    """proyecto.unidades_vivienda = apartamentos distintos de la planta típica × pisos típicos (del título)."""
    lineas = list(lineas)
    for ln in lineas:
        m = _TIPICA.search(_sin_tildes(ln.texto).upper())
        if not m:
            continue
        pisos_tipicos = (int(m.group(2)) - int(m.group(1))) // 100 + 1
        letras = sorted({a.group(1) for x in lineas if x.pagina == ln.pagina
                         and (a := _APARTAMENTO.match(_sin_tildes(x.texto).upper().strip()))})
        if pisos_tipicos < 1 or not letras:
            continue
        return _hecho("proyecto.unidades_vivienda", len(letras) * pisos_tipicos, ln, 0.8, "ok",
                      nota=f"{len(letras)} por planta típica × {pisos_tipicos} pisos (apartamentos {', '.join(letras)}; "
                           f"«{ln.texto.strip()}»). No incluye unidades de otras plantas.")
    return _hecho("proyecto.unidades_vivienda", None, None, 0.5, "no_encontrado",
                  nota="No se encontró una planta típica con sus apartamentos rotulados.")


def densidad(unidades_hecho: dict, lineas: Iterable[Linea] = ()) -> dict:
    """proyecto.densidad_pers_ha solo si el plano la declara: el factor de personas por unidad no está en las normas cargadas."""
    lineas = list(lineas)
    bloque = bloque_normativo(lineas)
    limites = []
    for ln in lineas:
        texto = _sin_tildes(ln.texto).upper()
        m = _DENSIDAD.search(texto)
        if not m:
            continue
        valor = float(m.group(1).replace(",", ""))
        if es_norma(ln, texto[:m.start(1)], bloque):
            # «DENSIDAD MÁXIMA: 500 personas/hectáreas»: límite de la norma transcrito, no la densidad del proyecto.
            limites.append(valor)
            continue
        return _hecho("proyecto.densidad_pers_ha", valor, ln, 0.8, "ok", nota="Densidad declarada en el plano.")
    u = unidades_hecho.get("valor")
    base = f"El plano muestra {u} unidades, pero" if u else "Sin unidades contadas y"
    norma = (" El plano transcribe la densidad máxima de la norma ("
             + ", ".join(f"{v:g}" for v in sorted(set(limites)))
             + " pers/ha), que es un límite y no la densidad del proyecto.") if limites else ""
    return _hecho("proyecto.densidad_pers_ha", None, None, 0.5, "no_encontrado",
                  nota=f"{base} las normas cargadas no fijan cuántas personas por unidad o por recámara se cuentan: "
                       "sin ese factor, con su cita, no se calcula la densidad." + norma)


# ---------------------------------------------------------------------------------------------------------------
# Ocupación (cuadro de áreas). El «área de ocupación» de muchos cuadros es la suma de las plantas o el área
# construida total, no la huella de la planta baja: si el dato no es claramente la planta baja, va a revisión.

#: Confianza máxima de una ocupación dudosa (área total o construida, o mayor que la planta baja).
CONFIANZA_OCUPACION_DUDOSA = 0.6
#: Diferencia (puntos porcentuales) a partir de la cual el índice declarado no corresponde a la planta baja.
_TOL_OCUPACION_PCT = 2.0
#: Distancia máxima (pt) entre el rótulo de una fila y la celda con su cantidad.
_DIST_CELDA = 400.0

_M2 = r"([0-9OoIlSB][0-9OoIlSB.,]*)\s*(?:M2|M²|M\?|M'|MTS2|MT2|M\b)"
_PCT = r"([0-9][0-9.,]*)\s*%"
_ROT_PCT_OCUPACION = re.compile(r"(?:INDICE|PORCENTAJE|COEFICIENTE|%)\s*(?:DE\s+)?OCUPACION|OCUPACION\s*(?:\(%\)|%)")
_ROT_AREA_OCUPACION = re.compile(r"AREA\s+(?:TOTAL\s+)?(?:DE\s+)?OCUPACION|HUELLA\s+(?:DE\s+)?(?:LA\s+)?(?:EDIFICACION|CONSTRUCCION)")
_ROT_PLANTA_BAJA = re.compile(r"PLANTA\s+(?:BAJA|0{2,3}\b|N?\s*[+]?\s*0{3}\b)|NIVEL\s*\+?\s*0{2,3}\b|\bPB\b|\bN\s*\+\s*0{3}\b")
_ROT_AREA = re.compile(r"AREA|CONSTRU|CERRADA")
_ROT_LOTE = re.compile(r"AREA\s+(?:DEL?\s+)?(?:LOTE|TERRENO)|SUPERFICIE\s+(?:DEL?\s+)?(?:LOTE|TERRENO)")
_TOTAL = re.compile(r"\bTOTAL|CONSTRUID|\bSUMA\b|ACUMULAD")


def _celda(ln: Linea, lineas: list[Linea], patron: re.Pattern) -> Optional[tuple[float, Linea]]:
    """Cantidad de una fila de cuadro: en la misma línea del rótulo o en la celda a su derecha (misma altura)."""
    from precheck.planos.extractores import numero  # noqa: PLC0415

    def leer(x: Linea) -> Optional[float]:
        m = patron.search(_sin_tildes(x.texto).upper())
        return numero(m.group(1).rstrip(".,"))[0] if m else None

    if (v := leer(ln)) is not None:
        return v, ln
    cy, alto = _centro(ln)[1], max(ln.bbox[3] - ln.bbox[1], 4.0)
    derecha = [(abs(_centro(x)[1] - cy), x.bbox[0] - ln.bbox[2], x) for x in lineas
               if x.pagina == ln.pagina and x is not ln and abs(_centro(x)[1] - cy) <= 0.8 * alto
               and -2 <= x.bbox[0] - ln.bbox[2] <= _DIST_CELDA]
    for _, _, x in sorted(derecha, key=lambda t: (round(t[0]), t[1])):
        if (v := leer(x)) is not None:
            return v, x
    return None


def ocupacion(lineas: Iterable[Linea], area_lote_m2: Optional[float] = None) -> dict:
    """proyecto.ocupacion_pct desde el cuadro de áreas: el índice declarado o el área de ocupación ÷ área del lote.
    Se contrasta con el área de la planta baja del mismo cuadro; los límites de la norma transcrita no cuentan."""
    lineas = list(lineas)
    bloque = bloque_normativo(lineas)
    pct = area_ocup = pb = lote_cuadro = None
    for ln in lineas:
        t = _sin_tildes(ln.texto).upper()
        if ln in bloque or es_norma(ln, t):
            continue
        if pct is None and _ROT_PCT_OCUPACION.search(t):
            pct = (c, ln) if (c := _celda(ln, lineas, re.compile(_PCT))) else None
        elif area_ocup is None and _ROT_AREA_OCUPACION.search(t):
            area_ocup = (c, ln) if (c := _celda(ln, lineas, re.compile(_M2))) else None
        elif pb is None and _ROT_PLANTA_BAJA.search(t) and _ROT_AREA.search(t):
            pb = c if (c := _celda(ln, lineas, re.compile(_M2))) else None
        elif lote_cuadro is None and _ROT_LOTE.search(t):
            lote_cuadro = c if (c := _celda(ln, lineas, re.compile(_M2))) else None
    lote_m2 = area_lote_m2 or (lote_cuadro[0] if lote_cuadro else None)
    pb_pct = round(pb[0] / lote_m2 * 100, 2) if pb and lote_m2 else None
    if pct is None and area_ocup is None:
        return _hecho("proyecto.ocupacion_pct", None, None, 0.5, "no_encontrado",
                      nota="El cuadro de áreas no declara la ocupación ni el área de ocupación.")
    if pct is not None:
        (valor, celda), rotulo = pct
        origen = f"índice declarado «{rotulo.texto.strip()}»"
    else:
        (area, celda), rotulo = area_ocup
        if not lote_m2:
            return _hecho("proyecto.ocupacion_pct", None, celda, 0.5, "revision",
                          nota=f"El cuadro declara un área de ocupación de {area:,.2f} m², pero falta el área del lote.")
        valor = round(area / lote_m2 * 100, 2)
        origen = f"área de ocupación {area:,.2f} m² ÷ lote {lote_m2:,.2f} m²"
    fuente = _union([rotulo, celda], confianza=min(rotulo.confianza, celda.confianza)) if celda is not rotulo else rotulo
    dudas = []
    if _TOTAL.search(_sin_tildes(rotulo.texto).upper()):
        dudas.append("el rótulo dice total o construida (puede ser la suma de las plantas)")
    if area_ocup is not None and pct is None and pb and area_ocup[0][0] > pb[0] * 1.01:
        dudas.append(f"el área ({area_ocup[0][0]:,.2f} m²) excede la de la planta baja ({pb[0]:,.2f} m²)")
    if pb_pct is not None and abs(valor - pb_pct) > _TOL_OCUPACION_PCT:
        dudas.append(f"la planta baja del cuadro ({pb[0]:,.2f} m²) da {pb_pct:.2f} %")
    if valor > 100:
        dudas.append("supera el 100 % del lote")
    if dudas:
        candidatos = sorted({valor, pb_pct} - {None})
        return _hecho("proyecto.ocupacion_pct", None, fuente, min(fuente.confianza * 0.8, CONFIANZA_OCUPACION_DUDOSA),
                      "revision", candidatos=candidatos,
                      nota=f"Ocupación de {valor:.2f} % ({origen}), pero " + "; ".join(dudas)
                           + ". La ocupación se mide con la huella de la planta baja: el revisor decide.")
    conf = fuente.confianza * (0.85 if pct is not None else 0.75)
    return _hecho("proyecto.ocupacion_pct", valor, fuente, conf, "ok" if conf >= 0.7 else "revision",
                  nota=f"Del cuadro de áreas: {origen}.")
