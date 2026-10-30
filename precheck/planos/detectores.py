"""Detectores vectoriales de regiones que no dependen de polígonos cerrados ni de la escala de la hoja.

Trabajan en puntos de la hoja «como se lee» (con la rotación de la página aplicada; origen arriba a la izquierda),
el mismo sistema que `regiones.Hoja.leida`. Los usa `regiones.propuesta_vectorial`.

- Estacionamientos por numeración: los números de plaza del texto (1, 2, 3…; tolera huecos en la numeración)
  agrupados en filas rectas, y las líneas separadoras paralelas y equiespaciadas que cruzan la fila. Un polígono por
  plaza entre dos separadores, con el fondo de los separadores. Sin separadores no se propone nada: una fila de
  números sola puede ser cualquier cosa (ejes, peldaños, lotes de una urbanización).
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Optional

from precheck.planos.medicion import _DIST_CALLE

# ---------------------------------------------------------------------------------------------------------------
# Datos de la hoja: segmentos y palabras en puntos «como se lee».


@dataclass
class Palabra:
    texto: str
    x: float          # centro
    y: float
    tam: float        # tamaño de letra (pt)
    caja: tuple[float, float, float, float]
    dx: float = 1.0   # dirección de escritura (unitaria, como se lee)
    dy: float = 0.0


def trazos_crudos(dibujos: list):
    """Segmentos de los dibujos de la página en el sistema del PDF sin rotar: arreglo de numpy (N, 6) con x0, y0, x1, y1,
    grosor del trazo y 1 si es la cuerda de una curva (0 si es una línea o el lado de un rectángulo o cuadrilátero)."""
    import numpy as np  # noqa: PLC0415

    filas = []
    for dr in dibujos:
        w = dr.get("width") or 0.0
        for it in dr["items"]:
            if it[0] == "l":
                filas.append((it[1].x, it[1].y, it[2].x, it[2].y, w, 0))
            elif it[0] == "re":
                r = it[1]
                q = [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]
                filas += [(*q[k], *q[(k + 1) % 4], w, 0) for k in range(4)]
            elif it[0] == "qu":
                q = [(p.x, p.y) for p in (it[1].ul, it[1].ur, it[1].lr, it[1].ll)]
                filas += [(*q[k], *q[(k + 1) % 4], w, 0) for k in range(4)]
            elif it[0] == "c":
                filas.append((it[1].x, it[1].y, it[4].x, it[4].y, w, 1))
    return np.array(filas, dtype=float) if filas else np.zeros((0, 6))


def a_leida(pagina, crudos):
    """Segmentos crudos (sin las cuerdas de curvas) → puntos como se lee: arreglo (N, 5) x0, y0, x1, y1, grosor."""
    import numpy as np  # noqa: PLC0415

    s = crudos[crudos[:, 5] == 0] if len(crudos) else np.zeros((0, 6))
    m = pagina.rotation_matrix
    a, b, c, d, e, f = m.a, m.b, m.c, m.d, m.e, m.f
    x0, y0 = pagina.rect.x0, pagina.rect.y0
    # Punto × matriz de pymupdf: x' = a x + c y + e; y' = b x + d y + f.
    out = np.empty((len(s), 5))
    out[:, 0] = a * s[:, 0] + c * s[:, 1] + e - x0
    out[:, 1] = b * s[:, 0] + d * s[:, 1] + f - y0
    out[:, 2] = a * s[:, 2] + c * s[:, 3] + e - x0
    out[:, 3] = b * s[:, 2] + d * s[:, 3] + f - y0
    out[:, 4] = s[:, 4]
    return out


def segmentos(pagina, dibujos: Optional[list] = None, curvas: bool = False, leida: bool = True):
    """Segmentos rectos de la página (líneas y lados de rectángulos y cuadriláteros) en puntos como se lee: arreglo de
    numpy (N, 5) x0, y0, x1, y1, grosor. Con `leida=False`, en el sistema del PDF sin rotar y (con `curvas`) también
    las cuerdas de las curvas (el formato de `trazos_crudos`)."""
    crudos = trazos_crudos(pagina.get_drawings() if dibujos is None else dibujos)
    if not leida:
        return crudos if curvas else crudos[crudos[:, 5] == 0]
    return a_leida(pagina, crudos)


def palabras(pagina) -> list[Palabra]:
    """Fragmentos de texto (spans) con su centro, tamaño de letra y dirección de escritura, en puntos como se lee."""
    import pymupdf  # noqa: PLC0415

    m = pagina.rotation_matrix
    x0, y0 = pagina.rect.x0, pagina.rect.y0
    salida = []
    for b in pagina.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            ddx, ddy = ln.get("dir", (1.0, 0.0))
            # Solo la parte lineal de la matriz (sin traslación) para girar la dirección.
            dx, dy = ddx * m.a + ddy * m.c, ddx * m.b + ddy * m.d
            nd = math.hypot(dx, dy) or 1.0
            for s in ln["spans"]:
                t = s["text"].strip()
                if not t:
                    continue
                bx0, by0, bx1, by1 = s["bbox"]
                p0 = pymupdf.Point(bx0, by0) * m
                p1 = pymupdf.Point(bx1, by1) * m
                caja = (min(p0.x, p1.x) - x0, min(p0.y, p1.y) - y0, max(p0.x, p1.x) - x0, max(p0.y, p1.y) - y0)
                salida.append(Palabra(t, (caja[0] + caja[2]) / 2, (caja[1] + caja[3]) / 2, float(s["size"]), caja,
                                      dx / nd, dy / nd))
    return salida


# ---------------------------------------------------------------------------------------------------------------
# Frente del lote por los rótulos de calle (lo usan la huella de un podio y scripts/medir_retiro.py).

#: Un rótulo de calle o acera marca un lado si está a menos de esto (pt) de la recta del lado, con su pie dentro del
#: lado (con un margen de MARGEN_PIE de su largo), fuera del lote y escrito paralelo al lado (|cos| ≥ PARALELO_ROTULO).
DIST_ROTULO_PT = _DIST_CALLE
MARGEN_PIE = 0.10
PARALELO_ROTULO = 0.80


def direccion_lado(lado) -> tuple[float, float]:
    """Dirección unitaria de un lado (LineString de dos puntos)."""
    (x0, y0), (x1, y1) = lado.coords[0], lado.coords[1]
    n = math.hypot(x1 - x0, y1 - y0)
    return ((x1 - x0) / n, (y1 - y0) / n) if n else (1.0, 0.0)


def rotulos_de_calle(rotulos: list) -> list:
    """Rótulos (con .texto) de calle o acera (ACERA, CALLE, AVENIDA, AVE), sin los internos ni «centro de calle»."""
    from precheck.planos import medicion as me  # noqa: PLC0415
    from precheck.planos.extractores import _sin_tildes  # noqa: PLC0415

    salida = []
    for r in rotulos:
        t = _sin_tildes(r.texto).upper()
        if me._CALLE.search(t) and not me._NO_CALLE.search(t):
            salida.append(r)
    return salida


def rotulos_junto_al_lado(lado, lote_p, rotulos: list) -> list[str]:
    """Textos de los rótulos de calle (con .texto, .x, .y, .dx, .dy) que marcan este lado como frente (ver
    DIST_ROTULO_PT)."""
    (ax, ay) = lado.coords[0]
    ux, uy = direccion_lado(lado)
    largo = lado.length
    salida = []
    for r in rotulos:
        if lote_p.contains(_punto(r.x, r.y)):
            continue
        t = (r.x - ax) * ux + (r.y - ay) * uy
        if t < -MARGEN_PIE * largo or t > (1 + MARGEN_PIE) * largo:
            continue
        perp = abs((r.x - ax) * -uy + (r.y - ay) * ux)
        if perp > DIST_ROTULO_PT:
            continue
        if abs(r.dx * ux + r.dy * uy) < PARALELO_ROTULO:
            continue
        salida.append(r.texto.strip())
    return salida


def lados_frente(lote: list[tuple[float, float]], rotulos: list) -> list[int]:
    """Índices de los lados del lote (el lado i va del vértice i al i+1) con un rótulo de calle junto a ellos."""
    from shapely.geometry import LineString  # noqa: PLC0415

    from shapely.ops import unary_union  # noqa: PLC0415

    piezas = piezas_poligono(lote)
    if not piezas:
        return []
    lote_p = unary_union(piezas)
    calle = rotulos_de_calle(rotulos)
    lados = [LineString([lote[i], lote[(i + 1) % len(lote)]]) for i in range(len(lote))]
    return [i for i, lado in enumerate(lados) if lado.length > 0 and rotulos_junto_al_lado(lado, lote_p, calle)]


# ---------------------------------------------------------------------------------------------------------------
# Estacionamientos por numeración y separadores.

_NUMERO = re.compile(r"^\d{1,3}$")
#: El número siguiente (n+1…n+3: tolera huecos en la numeración) se busca a menos de esto × tamaño de letra.
DIST_SIGUIENTE = 14.0
SALTO_MAX = 3
#: Una fila recta: pasos entre números parecidos (×0.6–1.6 de la mediana) y sin quiebres de más de 12°.
PASO_MIN, PASO_MAX = 0.6, 1.6
QUIEBRE_GRADOS = 12.0
MIN_FILA = 3
#: Separadores: no paralelos a la fila (más de 25°), todos con la misma inclinación (±3°).
ANGULO_MIN_SEPARADOR = 25.0
TOL_ANGULO_SEPARADOR = 3.0
#: Proporción largo / ancho de una plaza (de 4.5 × 3.0 a 6.5 × 2.3 m, con margen de dibujo).
PROPORCION = (1.35, 3.0)
#: Medidas de la plaza en metros (solo se comprueban si se conoce la escala de la hoja).
ANCHO_M = (2.0, 3.6)
LARGO_M = (4.0, 7.0)
#: Fracción mínima de los números de una fila que quedan entre dos separadores.
MIN_COBERTURA = 0.6


@dataclass
class Plaza:
    puntos: list[tuple[float, float]]
    numero: int


@dataclass
class Fila:
    numeros: list[int]
    plazas: list[Plaza] = field(default_factory=list)
    ancho_pt: float = 0.0
    largo_pt: float = 0.0
    motivo: str = ""      # por qué se descartó (vacío si es una fila de plazas)


def _numeros(palabras_: list[Palabra]) -> list[tuple[int, float, float, float]]:
    return [(int(p.texto), p.x, p.y, p.tam) for p in palabras_ if _NUMERO.match(p.texto) and int(p.texto) > 0]


def _cadenas(nums: list[tuple[int, float, float, float]]) -> list[list[int]]:
    """Índices de números encadenados n → n+1 (o n+2, n+3 si falta alguno), cada uno con su vecino más cercano."""
    por_valor: dict[int, list[int]] = {}
    for i, (n, *_r) in enumerate(nums):
        por_valor.setdefault(n, []).append(i)
    sucesor: dict[int, tuple[float, int]] = {}
    for i, (n, x, y, tam) in enumerate(nums):
        for k in range(1, SALTO_MAX + 1):
            cerca = [(math.dist((x, y), nums[j][1:3]), j) for j in por_valor.get(n + k, [])]
            cerca = [c for c in cerca if c[0] <= DIST_SIGUIENTE * tam]
            if cerca:
                sucesor[i] = min(cerca)
                break
    # Cada número tiene a lo sumo un antecesor: el más cercano.
    antecesor: dict[int, tuple[float, int]] = {}
    for i, (d, j) in sucesor.items():
        if j not in antecesor or d < antecesor[j][0]:
            antecesor[j] = (d, i)
    siguiente = {i: j for j, (_, i) in antecesor.items()}
    cadenas = []
    for i in range(len(nums)):
        if i in antecesor:
            continue
        c = [i]
        while c[-1] in siguiente and len(c) <= len(nums):
            c.append(siguiente[c[-1]])
        if len(c) >= MIN_FILA:
            cadenas.append(c)
    return cadenas


def _tramos_rectos(cadena: list[int], nums) -> list[list[int]]:
    """Parte una cadena en tramos rectos con paso parecido (las filas que doblan una esquina siguen numeradas)."""
    tramos: list[list[int]] = [[cadena[0]]]
    for j in cadena[1:]:
        t = tramos[-1]
        a, b = nums[t[-1]][1:3], nums[j][1:3]
        paso = math.dist(a, b)
        if len(t) >= 2:
            pasos = sorted(math.dist(nums[t[k]][1:3], nums[t[k + 1]][1:3]) for k in range(len(t) - 1))
            med = pasos[len(pasos) // 2]
            p0, p1 = nums[t[0]][1:3], nums[t[-1]][1:3]
            dir_t = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
            dir_p = math.atan2(b[1] - a[1], b[0] - a[0])
            quiebre = abs((math.degrees(dir_p - dir_t) + 180) % 360 - 180)
            if not PASO_MIN * med <= paso <= PASO_MAX * med or quiebre > QUIEBRE_GRADOS:
                tramos.append([j])
                continue
        t.append(j)
    return [t for t in tramos if len(t) >= MIN_FILA]


def hay_numeracion(palabras_: list[Palabra]) -> bool:
    """¿Hay al menos una cadena de números seguidos? (para no leer los trazos de la hoja si no hace falta)."""
    nums = _numeros(palabras_)
    return len(nums) >= MIN_FILA and bool(_cadenas(nums))


def filas_de_plazas(palabras_: list[Palabra], segs, escala: Optional[float] = None) -> list[Fila]:
    """Filas de plazas numeradas con sus separadores. Devuelve todas las filas candidatas; las descartadas llevan
    `motivo` (para depurar) y ninguna plaza. `segs`: los de `segmentos()`."""
    import numpy as np  # noqa: PLC0415

    nums = _numeros(palabras_)
    filas: list[Fila] = []
    if len(nums) < MIN_FILA or len(segs) == 0:
        return filas
    ux_s = segs[:, 2] - segs[:, 0]
    uy_s = segs[:, 3] - segs[:, 1]
    largo_s = np.hypot(ux_s, uy_s)
    for cadena in _cadenas(nums):
        for tramo in _tramos_rectos(cadena, nums):
            filas.append(_fila(tramo, nums, segs, ux_s, uy_s, largo_s, escala))
    # Un número en dos filas (cadenas que se cruzan): se queda la primera fila válida.
    vistos: set[tuple[float, float]] = set()
    for f in filas:
        if f.motivo:
            continue
        f.plazas = [p for p in f.plazas if _clave(p) not in vistos]
        vistos.update(_clave(p) for p in f.plazas)
    return filas


def _clave(p: Plaza) -> tuple[float, float]:
    cx = sum(q[0] for q in p.puntos) / len(p.puntos)
    cy = sum(q[1] for q in p.puntos) / len(p.puntos)
    return round(cx), round(cy)


def _fila(tramo: list[int], nums, segs, ux_s, uy_s, largo_s, escala: Optional[float]) -> Fila:
    import numpy as np  # noqa: PLC0415

    valores = [nums[i][0] for i in tramo]
    fila = Fila(valores)
    P = np.array([nums[i][1:3] for i in tramo], dtype=float)
    O = P.mean(axis=0)
    # Eje de la fila: dirección principal de los centros de los números.
    _, _, vt = np.linalg.svd(P - O)
    u = vt[0]
    if u[0] < 0 or (abs(u[0]) < 1e-9 and u[1] < 0):
        u = -u
    v = np.array([-u[1], u[0]])
    t = (P - O) @ u
    orden = np.argsort(t)
    t = t[orden]
    valores = [valores[i] for i in orden]
    paso = float(np.median(np.diff(t)))
    if paso <= 0:
        fila.motivo = "paso nulo"
        return fila
    # Segmentos cerca de la fila.
    A = segs[:, 0:2] - O
    B = segs[:, 2:4] - O
    tA, sA, tB, sB = A @ u, A @ v, B @ u, B @ v
    tm, sm = (tA + tB) / 2, (sA + sB) / 2
    cerca = ((largo_s >= 0.5 * paso) & (largo_s <= 6 * paso) & (np.abs(sm) <= 4 * paso)
             & (tm >= t[0] - 1.5 * paso) & (tm <= t[-1] + 1.5 * paso))
    # Que crucen la línea de los números (los números están dentro de la plaza, entre dos separadores).
    cruza = cerca & (np.minimum(sA, sB) <= 0) & (np.maximum(sA, sB) >= 0)
    idx = np.nonzero(cruza)[0]
    if len(idx) < 2:
        fila.motivo = "sin separadores"
        return fila
    ang = np.degrees(np.arctan2(sB[idx] - sA[idx], tB[idx] - tA[idx])) % 180.0
    no_paralelo = (ang >= ANGULO_MIN_SEPARADOR) & (ang <= 180 - ANGULO_MIN_SEPARADOR)
    idx, ang = idx[no_paralelo], ang[no_paralelo]
    if len(idx) < 2:
        fila.motivo = "sin separadores no paralelos"
        return fila
    # Inclinación de los separadores: entre las más frecuentes (histograma de 2°, con las vecinas), la que deja más
    # números entre dos separadores (un rayado es frecuente pero no separa los números).
    hist = np.bincount((ang // 2).astype(int), minlength=91)
    suav = hist + np.roll(hist, 1) + np.roll(hist, -1)
    mejor: Optional[tuple] = None
    for b in [int(b) for b in np.argsort(-suav)[:4] if suav[b] >= 2]:
        sel = np.abs(ang - (b + 0.5) * 2) <= TOL_ANGULO_SEPARADOR
        if sel.sum() < 2:
            continue
        r = _plazas_con_inclinacion(idx[sel], ang[sel], t, valores, paso, O, u, v, tA, sA, tB, sB)
        if mejor is None or len(r[0]) > len(mejor[0]):
            mejor = r
    if mejor is None:
        fila.motivo = "sin separadores con una inclinación común"
        return fila
    plazas, fila.ancho_pt, fila.largo_pt = mejor
    if fila.ancho_pt <= 0 or not PROPORCION[0] <= fila.largo_pt / fila.ancho_pt <= PROPORCION[1]:
        fila.motivo = f"proporción {fila.largo_pt / max(fila.ancho_pt, 1e-9):.2f}"
        return fila
    if escala:
        k = escala * 0.0254 / 72
        if not (ANCHO_M[0] <= fila.ancho_pt * k <= ANCHO_M[1] and LARGO_M[0] <= fila.largo_pt * k <= LARGO_M[1]):
            fila.motivo = f"medidas a 1:{escala:g}: {fila.ancho_pt * k:.2f} × {fila.largo_pt * k:.2f} m"
            return fila
    if len(plazas) < MIN_FILA or len(plazas) < MIN_COBERTURA * len(valores):
        fila.motivo = f"cobertura {len(plazas)}/{len(valores)}"
        return fila
    fila.plazas = plazas
    return fila


def _plazas_con_inclinacion(idx, ang, t, valores, paso, O, u, v, tA, sA, tB, sB):
    """(plazas, ancho, largo) de una fila con los separadores `idx` (todos con la inclinación `ang`)."""
    import numpy as np  # noqa: PLC0415

    phi = float(np.median(ang))
    seno = math.sin(math.radians(phi))
    cot = math.cos(math.radians(phi)) / seno
    # Dónde cruza cada separador la línea de los números, y su extensión a lo ancho de la fila.
    ds = sB[idx] - sA[idx]
    cruce = tA[idx] + (0 - sA[idx]) * (tB[idx] - tA[idx]) / np.where(np.abs(ds) < 1e-9, 1e-9, ds)
    s_lo = np.minimum(sA[idx], sB[idx])
    s_hi = np.maximum(sA[idx], sB[idx])
    orden = np.argsort(cruce)
    cruce, s_lo, s_hi = cruce[orden], s_lo[orden], s_hi[orden]
    # Separadores repetidos (varios trazos casi en el mismo sitio): uno solo, con la extensión mediana.
    grupos: list[list[int]] = []
    for k in range(len(cruce)):
        if grupos and cruce[k] - cruce[grupos[-1][0]] <= 0.15 * paso:
            grupos[-1].append(k)
        else:
            grupos.append([k])
    seps = [(float(np.mean(cruce[g])), float(np.median(s_lo[g])), float(np.median(s_hi[g]))) for g in grupos]
    cruces = [s[0] for s in seps]
    plazas, usados = [], set()
    for tn, n in zip(t, valores):
        i_izq = max((i for i, c in enumerate(cruces) if c < tn), default=None, key=lambda i: cruces[i])
        i_der = min((i for i, c in enumerate(cruces) if c > tn), default=None, key=lambda i: cruces[i])
        if i_izq is not None and tn - cruces[i_izq] > 1.0 * paso:
            i_izq = None
        if i_der is not None and cruces[i_der] - tn > 1.0 * paso:
            i_der = None
        if i_izq is None and i_der is None:
            continue
        izq = cruces[i_izq] if i_izq is not None else cruces[i_der] - paso
        der = cruces[i_der] if i_der is not None else cruces[i_izq] + paso
        if not 0.6 * paso <= der - izq <= 1.5 * paso:
            continue
        usados.update(i for i in (i_izq, i_der) if i is not None)
        plazas.append((izq, der, n))
    if not plazas:
        return [], 0.0, 0.0
    # El fondo de la fila: mediana de los extremos de los separadores que delimitan plazas.
    lo = float(np.median([seps[i][1] for i in usados]))
    hi = float(np.median([seps[i][2] for i in usados]))

    def punto(tt: float, ss: float) -> tuple[float, float]:
        q = O + (tt + ss * cot) * u + ss * v
        return float(q[0]), float(q[1])

    return ([Plaza([punto(a, lo), punto(b, lo), punto(b, hi), punto(a, hi)], n) for a, b, n in plazas],
            paso * seno, (hi - lo) / seno)


# ---------------------------------------------------------------------------------------------------------------
# Lote por sus vértices rotulados (1, 2, … N) y las líneas de propiedad entre ellos.

#: Los vértices del lote se rotulan con números del mismo tamaño de letra (±1 %), 1…N sin repetir ni faltar.
MAX_VERTICES = 30
TOL_TAM_VERTICE = 0.01
#: El vértice está a menos de esto × tamaño de letra de su número.
RADIO_VERTICE = 6.0
#: Cada lado tiene que estar dibujado (líneas a menos de TOL_LADO de su recta) en esta fracción al menos
#: (las líneas de propiedad suelen ir a trazos).
MIN_COBERTURA_LADO = 0.45
#: Distancia máxima de un trazo a la recta del lado para que lo dibuje: × tamaño de letra (entre 1.5 y 5 pt).
TOL_LADO = 0.25
MIN_COBERTURA_MEDIA = 0.7


@dataclass
class LoteRotulado:
    puntos: list[tuple[float, float]]
    cobertura: list[float]


def _cobertura(a, b, segs, tol: float) -> float:
    """Fracción del lado a→b cubierta por trazos paralelos a él (a menos de `tol`)."""
    import numpy as np  # noqa: PLC0415

    ax, ay = a
    dx, dy = b[0] - ax, b[1] - ay
    largo = math.hypot(dx, dy)
    if largo < 1e-6 or len(segs) == 0:
        return 0.0
    ux, uy = dx / largo, dy / largo
    t1 = (segs[:, 0] - ax) * ux + (segs[:, 1] - ay) * uy
    t2 = (segs[:, 2] - ax) * ux + (segs[:, 3] - ay) * uy
    s1 = -(segs[:, 0] - ax) * uy + (segs[:, 1] - ay) * ux
    s2 = -(segs[:, 2] - ax) * uy + (segs[:, 3] - ay) * ux
    ok = (np.abs(s1) <= tol) & (np.abs(s2) <= tol) & (np.abs(t2 - t1) > 1e-6)
    lo = np.clip(np.minimum(t1, t2)[ok], 0, largo)
    hi = np.clip(np.maximum(t1, t2)[ok], 0, largo)
    if len(lo) == 0:
        return 0.0
    orden = np.argsort(lo)
    cubierto, fin = 0.0, 0.0
    for x0, x1 in zip(lo[orden], hi[orden]):
        if x1 <= fin:
            continue
        cubierto += x1 - max(x0, fin)
        fin = x1
    return cubierto / largo


def _esquinas(puntos: list[tuple[float, float]], segs, tol: float, radio: float) -> list[tuple[float, float]]:
    """Ajusta cada vértice a la intersección de las rectas de sus dos lados (ajustadas a los trazos que los dibujan):
    con un lado a trazos, el extremo más cercano al vértice puede quedar antes de la esquina."""
    import numpy as np  # noqa: PLC0415

    n = len(puntos)
    rectas = []
    for i in range(n):
        a, b = np.array(puntos[i]), np.array(puntos[(i + 1) % n])
        d = b - a
        largo = float(np.hypot(*d))
        u = d / largo
        nrm = np.array([-u[1], u[0]])
        P = np.vstack([segs[:, 0:2], segs[:, 2:4]])
        s = (P - a) @ nrm
        t = (P - a) @ u
        ok = (np.abs(s) <= tol) & (t >= -tol) & (t <= largo + tol)
        if ok.sum() >= 2:
            q = P[ok]
            c = q.mean(axis=0)
            _, _, vt = np.linalg.svd(q - c)
            rectas.append((c, vt[0]))
        else:
            rectas.append((a, u))
    salida = []
    for i in range(n):
        (c1, u1), (c2, u2) = rectas[i - 1], rectas[i]
        det = u1[0] * (-u2[1]) - u1[1] * (-u2[0])
        if abs(det) < 1e-6:
            salida.append(puntos[i])
            continue
        r = c2 - c1
        k = (r[0] * (-u2[1]) - r[1] * (-u2[0])) / det
        q = c1 + k * u1
        # Solo si la esquina queda cerca del vértice elegido (si no, las rectas no son las de esos lados).
        salida.append((float(q[0]), float(q[1])) if math.dist(q, puntos[i]) <= radio else puntos[i])
    return salida


def _grupos_vertices(palabras_: list[Palabra]) -> list[list[Palabra]]:
    """Números 1…N (N ≥ 3) del mismo tamaño de letra, cada uno una sola vez, ordenados."""
    nums = sorted((p for p in palabras_ if _NUMERO.match(p.texto) and 1 <= int(p.texto) <= MAX_VERTICES),
                  key=lambda p: p.tam)
    grupos: list[list[Palabra]] = []
    for p in nums:
        if grupos and p.tam <= grupos[-1][0].tam * (1 + TOL_TAM_VERTICE):
            grupos[-1].append(p)
        else:
            grupos.append([p])
    salida = []
    for g in grupos:
        valores = sorted(int(p.texto) for p in g)
        if len(valores) >= 3 and valores == list(range(1, len(valores) + 1)):
            salida.append(sorted(g, key=lambda p: int(p.texto)))
    return salida


def hay_vertices(palabras_: list[Palabra]) -> bool:
    return bool(_grupos_vertices(palabras_))


def lotes_rotulados(palabras_: list[Palabra], segs) -> list[LoteRotulado]:
    """Polígonos cerrados por las líneas de propiedad entre vértices rotulados 1…N (N ≥ 3) del mismo tamaño de letra.
    Cada vértice se ajusta al extremo de trazo cercano que mejor dibuja sus dos lados."""
    import numpy as np  # noqa: PLC0415

    if len(segs) == 0:
        return []
    extremos = np.vstack([segs[:, 0:2], segs[:, 2:4]])
    largos = np.hypot(segs[:, 2] - segs[:, 0], segs[:, 3] - segs[:, 1])
    salida = []
    for g in _grupos_vertices(palabras_):
        tam = g[0].tam
        radio, tol = RADIO_VERTICE * tam, min(max(TOL_LADO * tam, 1.5), 5.0)
        # Candidatos de cada vértice: extremos de trazos cercanos al número (los más cercanos primero).
        cand = []
        for p in g:
            d = np.hypot(extremos[:, 0] - p.x, extremos[:, 1] - p.y)
            cerca = np.nonzero(d <= radio)[0]
            cerca = cerca[np.argsort(d[cerca])][:40]
            pts = []
            for i in cerca:
                q = (float(extremos[i, 0]), float(extremos[i, 1]))
                if all(math.dist(q, r) > 0.2 for r in pts):
                    pts.append(q)
            cand.append(pts[:12] or [(p.x, p.y)])
        n = len(g)
        # Solo trazos que pueden ser lados: cerca de la caja de los vértices y más largos que el tamaño de letra.
        xs = [q[0] for c in cand for q in c]
        ys = [q[1] for c in cand for q in c]
        sel = ((np.maximum(segs[:, 0], segs[:, 2]) >= min(xs) - radio) & (np.minimum(segs[:, 0], segs[:, 2]) <= max(xs) + radio)
               & (np.maximum(segs[:, 1], segs[:, 3]) >= min(ys) - radio) & (np.minimum(segs[:, 1], segs[:, 3]) <= max(ys) + radio)
               & (largos >= 0.3 * tam))
        s = segs[sel]
        elegido = [0] * n
        cache: dict[tuple, float] = {}

        def cob(i: int, a: int, j: int, b: int) -> float:
            k = (i, a, j, b)
            if k not in cache:
                cache[k] = _cobertura(cand[i][a], cand[j][b], s, tol)
            return cache[k]

        for _ in range(3):  # ajuste por coordenadas: cada vértice, el candidato que mejor dibuja sus dos lados
            for i in range(n):
                ant, sig = (i - 1) % n, (i + 1) % n
                elegido[i] = max(range(len(cand[i])),
                                 key=lambda a: cob(ant, elegido[ant], i, a) + cob(i, a, sig, elegido[sig]))
        coberturas = [cob(i, elegido[i], (i + 1) % n, elegido[(i + 1) % n]) for i in range(n)]
        if min(coberturas) < MIN_COBERTURA_LADO or sum(coberturas) / n < MIN_COBERTURA_MEDIA:
            continue
        puntos = _esquinas([cand[i][elegido[i]] for i in range(n)], s, tol, radio)
        from shapely.geometry import Polygon  # noqa: PLC0415

        pol = Polygon(puntos)
        if not pol.is_valid or pol.area < (4 * tam) ** 2:
            continue
        salida.append(LoteRotulado(puntos, [round(c, 3) for c in coberturas]))
    return salida


# ---------------------------------------------------------------------------------------------------------------
# Huella: los espacios cerrados con un rótulo de ambiente dentro, unidos.

#: Rótulos de ambientes techados (se comparan sin tildes y con el texto espaciado «S A L A» compactado).
AMBIENTE = re.compile(
    r"\b(?:LOCAL|SALA|COMEDOR|COCINA|COCINETA|RECAMARA|DORMITORIO|HABITACION|BANO|SERVICIO|DEPOSITO|LAVANDERIA|"
    r"ESTUDIO|OFICINA|LOBBY|VESTIBULO|FOYER|PORTAL|GARAJE|ESTACIONAMIENTO|CUARTO|CTO|BODEGA|GALERA|TIENDA|RECEPCION|"
    r"SEGURIDAD|BASURA|CLOSET|ALACENA|HALL|SHOWROOM|COMERCIO|AULA|CONSULTORIO)\b|\b(?:REC|DEP|LAV)\.|\bS/S\b|\bS\.S\.")
#: Espacios no techados o abiertos: no son huella aunque estén cerrados.
NO_TECHADO = re.compile(r"TERRAZA|PATIO|JARDIN|AREA\s*VERDE|GRAMA|PISCINA|BALCON|AZOTEA|PLAZA|RODADURA")
#: Un espacio que ocupa más que esto del lote es una fuga (pared abierta) y no un ambiente.
MAX_AMBIENTE_LOTE = 0.6
#: Fracción máxima de un espacio que puede quedar fuera del lote.
MAX_FUERA_LOTE = 0.1
LADO_RASTER_PX = 2500
#: Los ambientes se unen a través de muros, mobiliario y espacios sin rótulo (escaleras, ductos, clósets) de hasta
#: ≈ 2 m (con la escala de la hoja o la implícita en el área escrita).
CIERRE_M = 2.0


def compactar(texto: str) -> str:
    """«C O M E D O R» → «COMEDOR» (rótulos con letras espaciadas)."""
    return re.sub(r"(?<=\b\w) (?=\w\b)", "", texto)


def es_ambiente(texto: str) -> bool:
    from precheck.planos.extractores import _sin_tildes  # noqa: PLC0415

    t = compactar(_sin_tildes(texto).upper())
    return bool(AMBIENTE.search(t)) and not NO_TECHADO.search(t)


#: Un podio de estacionamientos sin rótulos de ambiente se reconoce por su texto dentro del lote: una rampa y un nivel
#: de estacionamiento (semisótano, sótano o mezzanine).
_RAMPA = re.compile(r"\bRAMPAS?\b")
_NIVEL_PODIO = re.compile(r"SEMI\s*-?\s*SOTANO|\bSOTANO|MEZZANINE|MEZANINE")


def es_podio(lote: list[tuple[float, float]], palabras_: list[Palabra]) -> bool:
    """¿Hay dentro del lote una RAMPA y un SEMISÓTANO, SÓTANO o MEZZANINE (en el mismo rótulo o en otros)?"""
    from shapely.ops import unary_union  # noqa: PLC0415

    from precheck.planos.extractores import _sin_tildes  # noqa: PLC0415

    piezas = piezas_poligono(lote)
    if not piezas:
        return False
    L = unary_union(piezas)
    textos = [compactar(_sin_tildes(p.texto).upper()) for p in palabras_ if L.contains(_punto(p.x, p.y))]
    return any(_RAMPA.search(t) for t in textos) and any(_NIVEL_PODIO.search(t) for t in textos)


def huella_por_ambientes(pagina, lote: list[tuple[float, float]], palabras_: list[Palabra],
                         excluir: Optional[list[tuple[float, float]]] = None,
                         pt_por_m: Optional[float] = None, info: Optional[dict] = None) -> list[list[tuple[float, float]]]:
    """Polígonos de la huella (puntos como se lee) dentro del lote: los espacios en blanco de la hoja rasterizada que
    contienen un rótulo de ambiente, sin los que se fugan (más del 60 % del lote o fuera del lote), sin los no
    techados (terraza, patio, jardín) y sin los que contienen un punto de `excluir` (plazas de estacionamiento
    descubiertas). Los ambientes se unen a través de los muros y el mobiliario (cierre de ≈ 2 m), sin huecos
    interiores, y de esa envolvente se quitan los espacios abiertos (los que se fugan, tocan el lindero o están
    vetados). Las circulaciones y plazas descubiertas sin rótulo de ambiente no entran, salvo en un podio de
    estacionamientos (RAMPA y SEMISÓTANO/SÓTANO/MEZZANINE dentro del lote, ver `es_podio`): ahí entra el resto del lote
    sin espacios abiertos, sin acercarse a los frentes más que los ambientes rotulados. `pt_por_m`: puntos de la hoja
    por metro real (de la escala); sin ella, el cierre es ≈ 1.2 % del lado del lote."""
    import cv2  # noqa: PLC0415
    import numpy as np  # noqa: PLC0415
    import pymupdf  # noqa: PLC0415
    from shapely.geometry import Polygon  # noqa: PLC0415

    from shapely.ops import unary_union  # noqa: PLC0415

    piezas = piezas_poligono(lote)   # un lote que se toca a sí mismo puede ser dos piezas: se usan todas
    if not piezas:
        return []
    L = unary_union(piezas)
    R = L.buffer(0.02 * math.sqrt(L.area))
    bx0, by0, bx1, by1 = R.bounds
    zoom = LADO_RASTER_PX / max(bx1 - bx0, by1 - by0)
    clip = pymupdf.Rect(bx0 + pagina.rect.x0, by0 + pagina.rect.y0, bx1 + pagina.rect.x0, by1 + pagina.rect.y0)
    pix = pagina.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip, colorspace=pymupdf.csGRAY, alpha=False)
    gris = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    alto, ancho = gris.shape

    def a_px(x: float, y: float) -> tuple[int, int]:
        return int(round((x - bx0) * zoom)), int(round((y - by0) * zoom))

    tinta = (gris < 200).astype(np.uint8)
    tinta = cv2.dilate(tinta, np.ones((3, 3), np.uint8))  # cierra huecos de un píxel entre trazos
    rotulos = [p for p in palabras_ if es_ambiente(p.texto) and L.buffer(1.0).contains(_punto(p.x, p.y))]
    otros = [p for p in palabras_ if NO_TECHADO.search(compactar(p.texto.upper())) or not es_ambiente(p.texto)]
    n, comp = cv2.connectedComponents((1 - tinta).astype(np.uint8), connectivity=4)
    mascara_lote = np.zeros_like(tinta)
    cv2.fillPoly(mascara_lote, [np.array([a_px(x, y) for x, y in g.exterior.coords], np.int32) for g in piezas], 1)
    area_lote = int(mascara_lote.sum())
    if area_lote == 0:
        return []
    areas = np.bincount(comp.ravel(), minlength=n)
    dentro = np.bincount(comp.ravel(), weights=mascara_lote.ravel(), minlength=n)
    def espacio(p: Palabra) -> int:
        """El espacio en blanco alrededor del rótulo (las letras son tinta): el más frecuente en su caja ampliada."""
        mx, my = (p.caja[2] - p.caja[0]) * 0.3 + 1, (p.caja[3] - p.caja[1]) * 0.3 + 1
        return _mas_frecuente(p.caja[0] - mx, p.caja[1] - my, p.caja[2] + mx, p.caja[3] + my)

    def _mas_frecuente(cx0: float, cy0: float, cx1: float, cy1: float) -> int:
        x0, y0 = a_px(cx0, cy0)
        x1, y1 = a_px(cx1, cy1)
        trozo = comp[max(0, y0):max(0, y1 + 1), max(0, x0):max(0, x1 + 1)].ravel()
        trozo = trozo[trozo > 0]
        return int(np.bincount(trozo).argmax()) if len(trozo) else 0

    puntos_px = [a_px(x, y) for x, y in (excluir or [])]
    vetados = set()
    for x, y in (excluir or []):   # el centro de una plaza suele caer en su número (tinta): se mira alrededor
        vetados.add(_mas_frecuente(x - 3, y - 3, x + 3, y + 3))
    for p in otros:   # un rótulo de terraza o patio veta su espacio
        if NO_TECHADO.search(compactar(p.texto.upper())):
            vetados.add(espacio(p))
    vetados.discard(0)
    elegidos = set()
    for p in rotulos:
        c = espacio(p)
        if c == 0 or c in vetados:
            continue
        if areas[c] > MAX_AMBIENTE_LOTE * area_lote or areas[c] - dentro[c] > MAX_FUERA_LOTE * areas[c]:
            continue  # fuga: el espacio no está cerrado
        if c not in elegidos and puntos_px and _rodea(comp == c, puntos_px):
            vetados.add(c)  # un estacionamiento con plazas dibujadas dentro está descubierto
            continue
        elegidos.add(c)
    if info is not None:
        info.update({"rotulos": [p.texto for p in rotulos], "elegidos": sorted(elegidos), "vetados": sorted(vetados),
                     "areas": {c: round(areas[c] / area_lote, 4) for c in elegidos}})
    if not elegidos:
        return []
    # Espacios abiertos: los que no son ambientes y se fugan, salen del lote, tocan el lindero o están vetados
    # (terrazas, patios, plazas). La edificación es el resto del lote (ambientes, muros, mobiliario, ductos)…
    borde = np.zeros_like(tinta)
    grueso = max(3, int(round(0.004 * math.sqrt(area_lote))))
    cv2.polylines(borde, [np.array([a_px(x, y) for x, y in g.exterior.coords], np.int32) for g in piezas], True, 1,
                  grueso * 2 + 1)
    toca = np.bincount(comp.ravel(), weights=(borde & mascara_lote).ravel(), minlength=n) > 0
    abiertos = [c for c in range(1, n) if c not in elegidos
                and (areas[c] > MAX_AMBIENTE_LOTE * area_lote or areas[c] - dentro[c] > MAX_FUERA_LOTE * areas[c]
                     or toca[c] or c in vetados)]
    edif = (mascara_lote.astype(bool) & ~np.isin(comp, abiertos)).astype(np.uint8)
    # …sin las líneas sueltas de los espacios abiertos (cotas, separadores, rayados), que no tienen grueso…
    k = max(5, int(round(0.006 * math.sqrt(area_lote))) | 1)
    edif = cv2.morphologyEx(edif, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    # …y solo cerca de los ambientes rotulados: su unión cerrada con el grueso de un muro y el mobiliario
    # (≈ CIERRE_M metros; sin escala, ≈ 1.2 % del lado del lote) y sin huecos interiores.
    ambientes = np.isin(comp, list(elegidos)).astype(np.uint8)
    k = int(round(CIERRE_M * pt_por_m * zoom)) if pt_por_m else int(round(0.012 * math.sqrt(area_lote)))
    k = max(3, k | 1)
    ambientes = cv2.morphologyEx(ambientes, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    contornos, _ = cv2.findContours(ambientes, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    lleno = np.zeros_like(ambientes)
    cv2.drawContours(lleno, contornos, -1, 1, thickness=cv2.FILLED)
    sel = (lleno & (edif | ambientes)).astype(np.uint8)
    # Podio de estacionamientos sin rótulos de ambiente (Bella Vista): la planta baja es casi toda techada (plazas
    # bajo la torre, rampas, circulación) pero solo rotula lobby, seguridad, depósito, cuarto eléctrico y basura (6 % de
    # la huella), y el retiro posterior salía de esos cuartos (10.32 m) cuando el podio está adosado (0 m). La señal es
    # el texto dentro del lote: una RAMPA y un SEMISÓTANO, SÓTANO o MEZZANINE (Tocumen no tiene ninguno). Entonces entra
    # la envolvente «lote menos espacios abiertos demostrados» (`edif`), con un tope: nada nuevo se acerca a un lindero
    # de frente (rótulo de calle junto al lado, la misma regla de scripts/medir_retiro.py) ni a un chaflán entre dos
    # frentes más que los ambientes rotulados. Sin ese tope la envolvente cubre el 92 % del lote y deja los frentes a
    # 0.15/0.03 m (correctos: 1.61/2.57): un retiro frontal falso y un incumplimiento inventado. Sin frente reconocido
    # no se extiende nada. No se agrega «ESTAC.» a AMBIENTE: en San Francisco «ESTAC. LIVIANOS» es descubierto. La
    # versión que solo unía la franja de ≈ 3 m junto a los linderos que no son frente daba el posterior a 0 pero IoU
    # 0.27 en Bella Vista (verdad: la envolvente de la planta baja); esta da 0.93 con los mismos frentes.
    frentes = lados_frente(lote, palabras_) if es_podio(lote, palabras_) else []
    if frentes and sel.any():
        nl = len(lote)
        guardados = set(frentes) | {i for i in range(nl) if (i - 1) % nl in frentes and (i + 1) % nl in frentes}
        permitido = np.ones(tinta.shape, dtype=bool)
        hay = sel.astype(bool)
        for i in sorted(guardados):
            fuera = np.ones_like(tinta)
            cv2.line(fuera, a_px(*lote[i]), a_px(*lote[(i + 1) % nl]), 0, 1)
            dist = cv2.distanceTransform(fuera, cv2.DIST_L2, 3)   # píxeles hasta el lado i
            permitido &= dist >= float(dist[hay].min())
        sel = (hay | (edif.astype(bool) & permitido)).astype(np.uint8)
        if info is not None:
            info["podio"] = {"frentes": frentes, "guardados": sorted(guardados)}
    contornos, _ = cv2.findContours(sel, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    salida = []
    for c in contornos:
        if cv2.contourArea(c) < 0.002 * area_lote:
            continue
        aprox = cv2.approxPolyDP(c, 0.002 * cv2.arcLength(c, True), True).reshape(-1, 2)
        if len(aprox) < 3:
            continue
        pol = Polygon([(bx0 + x / zoom, by0 + y / zoom) for x, y in aprox])
        if not pol.is_valid:
            pol = pol.buffer(0)
        pol = pol.intersection(L.buffer(0.005 * math.sqrt(L.area)))
        for g in getattr(pol, "geoms", [pol]):
            if g.geom_type == "Polygon" and not g.is_empty and g.area > 0:
                salida.append([(float(x), float(y)) for x, y in list(g.exterior.coords)[:-1]])
    return salida


def _rodea(mascara, puntos_px: list[tuple[int, int]]) -> bool:
    """¿Algún punto cae dentro del contorno exterior (con huecos rellenos) de la máscara?"""
    import cv2  # noqa: PLC0415
    import numpy as np  # noqa: PLC0415

    contornos, _ = cv2.findContours(mascara.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    return any(cv2.pointPolygonTest(c, (float(x), float(y)), False) >= 0 for c in contornos for x, y in puntos_px)


def piezas_poligono(puntos) -> list:
    """Piezas (polígonos de shapely válidos, con área) del polígono: una polilínea de lote que se toca a sí misma
    (dos fincas unidas por una esquina) da, al repararla con buffer(0), un MultiPolygon de dos piezas."""
    from shapely.geometry import Polygon  # noqa: PLC0415

    try:
        P = Polygon(puntos)
        if not P.is_valid:
            P = P.buffer(0)
    except Exception:  # noqa: BLE001 — geometría imposible
        return []
    return [g for g in getattr(P, "geoms", [P]) if g.geom_type == "Polygon" and not g.is_empty and g.area > 0]


def poligono_simple(puntos):
    """La pieza mayor del polígono (ver `piezas_poligono`), o None si no tiene área."""
    piezas = piezas_poligono(puntos)
    return max(piezas, key=lambda g: g.area) if piezas else None


def _punto(x: float, y: float):
    from shapely.geometry import Point  # noqa: PLC0415

    return Point(x, y)


# ---------------------------------------------------------------------------------------------------------------
# Acera y área verde: solo con su rótulo y un contorno que la cierre.

ROTULO_ACERA = re.compile(r"^\s*ACERA\b(?!.{25,})")
ROTULO_VERDE = re.compile(r"^\s*(?:GRAMA|AREA\s+VERDE|JARDIN(?:ERA)?|ZONA\s+VERDE)\b(?!.{25,})")
#: Una franja de acera o un área verde no ocupa más que esto del lote.
MAX_FRANJA_LOTE = 0.5


def _texto_rotulo(texto: str) -> str:
    from precheck.planos.extractores import _sin_tildes  # noqa: PLC0415

    return compactar(_sin_tildes(texto).upper())


def areas_verdes(pagina, lote: list[tuple[float, float]], palabras_: list[Palabra],
                 dibujos: Optional[list] = None) -> list[list[tuple[float, float]]]:
    """Polígonos cerrados con relleno verde que contienen un rótulo GRAMA / ÁREA VERDE / JARDÍN, cerca del lote
    (puntos como se lee). Sin relleno verde no se propone nada: los rótulos sueltos sobre una franja sin contorno no
    alcanzan."""
    from shapely.geometry import Point, Polygon  # noqa: PLC0415

    L = poligono_simple(lote)
    if L is None:
        return []
    zona = L.buffer(0.5 * math.sqrt(L.area))
    rotulos = [p for p in palabras_ if ROTULO_VERDE.match(_texto_rotulo(p.texto)) and zona.contains(Point(p.x, p.y))]
    if not rotulos:
        return []
    dibujos = pagina.get_drawings() if dibujos is None else dibujos
    m = pagina.rotation_matrix
    x0, y0 = pagina.rect.x0, pagina.rect.y0
    verdes = []
    for dr in dibujos:
        f = dr.get("fill")
        if not f or len(f) < 3 or not (f[1] >= f[0] + 0.02 and f[1] >= f[2] + 0.02):
            continue
        pts = []
        for it in dr["items"]:
            if it[0] == "l":
                pts += [it[1], it[2]]
            elif it[0] == "c":
                pts += [it[1], it[4]]
            elif it[0] == "re":
                pts += [it[1].tl, it[1].tr, it[1].br, it[1].bl]
            elif it[0] == "qu":
                pts += [it[1].ul, it[1].ur, it[1].lr, it[1].ll]
        if len(pts) < 3:
            continue
        try:
            P = Polygon([((q * m).x - x0, (q * m).y - y0) for q in pts])
            P = P if P.is_valid else P.buffer(0)
        except Exception:  # noqa: BLE001
            continue
        if P.is_empty or P.area <= 0 or P.area > MAX_FRANJA_LOTE * L.area or not P.intersects(zona):
            continue
        verdes.append(P)
    salida = []
    for r in rotulos:
        pt = Point(r.x, r.y)
        dentro = [P for P in verdes if P.contains(pt) and P.area >= (3 * r.tam) ** 2]
        if not dentro:
            continue
        P = min(dentro, key=lambda P: P.area)
        for g in getattr(P, "geoms", [P]):
            if g.geom_type == "Polygon":
                v = [(float(x), float(y)) for x, y in list(g.exterior.coords)[:-1]]
                if v not in salida:
                    salida.append(v)
    return salida


def aceras(pagina, lote: list[tuple[float, float]], palabras_: list[Palabra],
           pt_por_m: Optional[float] = None) -> list[list[tuple[float, float]]]:
    """Franjas de acera (puntos como se lee): el espacio en blanco que contiene un rótulo ACERA, recortado al frente
    del lote (entre las perpendiculares por los extremos del lindero más cercano) y hasta el primer trazo que la
    cierra (cordón, grama, línea de construcción). Si el espacio se fuga más allá de ≈ 3 veces la distancia del
    rótulo al lindero (sin cordón dibujado), no se propone."""
    import cv2  # noqa: PLC0415
    import numpy as np  # noqa: PLC0415
    import pymupdf  # noqa: PLC0415
    from shapely.geometry import LineString, Point, Polygon  # noqa: PLC0415

    L = poligono_simple(lote)
    if L is None:
        return []
    lado = math.sqrt(L.area)
    zona = L.buffer(0.3 * lado)
    rotulos = [p for p in palabras_ if ROTULO_ACERA.match(_texto_rotulo(p.texto))
               and zona.contains(Point(p.x, p.y)) and not L.contains(Point(p.x, p.y))]
    if not rotulos:
        return []
    bx0, by0, bx1, by1 = zona.bounds
    zoom = LADO_RASTER_PX / max(bx1 - bx0, by1 - by0)
    clip = pymupdf.Rect(bx0 + pagina.rect.x0, by0 + pagina.rect.y0, bx1 + pagina.rect.x0, by1 + pagina.rect.y0)
    pix = pagina.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip, colorspace=pymupdf.csGRAY, alpha=False)
    gris = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    tinta = cv2.dilate((gris < 200).astype(np.uint8), np.ones((3, 3), np.uint8))
    n, comp = cv2.connectedComponents((1 - tinta).astype(np.uint8), connectivity=4)

    def a_px(x: float, y: float) -> tuple[int, int]:
        return int(round((x - bx0) * zoom)), int(round((y - by0) * zoom))

    v = list(L.exterior.coords)[:-1]
    lados = [LineString([v[i], v[(i + 1) % len(v)]]) for i in range(len(v))]
    c_lote = L.centroid
    salida = []
    for r in rotulos:
        pt = Point(r.x, r.y)
        i = min(range(len(lados)), key=lambda k: lados[k].distance(pt))
        d = lados[i].distance(pt)
        if d > 0.2 * lado or (pt_por_m and d > 8 * pt_por_m):
            continue
        (ax, ay), (bx, by) = lados[i].coords
        ux, uy = bx - ax, by - ay
        largo = math.hypot(ux, uy)
        nx, ny = -uy / largo, ux / largo
        if (c_lote.x - ax) * nx + (c_lote.y - ay) * ny > 0:
            nx, ny = -nx, -ny          # la normal hacia afuera del lote
        prof = 3 * d + 2 * r.tam
        franja = Polygon([(ax, ay), (bx, by), (bx + nx * prof, by + ny * prof), (ax + nx * prof, ay + ny * prof)])
        mx, my = (r.caja[2] - r.caja[0]) * 0.3 + 1, (r.caja[3] - r.caja[1]) * 0.3 + 1
        x0, y0 = a_px(r.caja[0] - mx, r.caja[1] - my)
        x1, y1 = a_px(r.caja[2] + mx, r.caja[3] + my)
        trozo = comp[max(0, y0):max(0, y1 + 1), max(0, x0):max(0, x1 + 1)].ravel()
        trozo = trozo[trozo > 0]
        if not len(trozo):
            continue
        c = int(np.bincount(trozo).argmax())
        mascara = (comp == c).astype(np.uint8)
        dentro_franja = np.zeros_like(mascara)
        cv2.fillPoly(dentro_franja, [np.array([a_px(x, y) for x, y in franja.exterior.coords], np.int32)], 1)
        # Fuga: más de la mitad del espacio del rótulo cae, a lo ancho, fuera de la franja de 3 × d.
        lejos = franja.buffer(0)
        fuera_ancho = Polygon([(ax + nx * prof, ay + ny * prof), (bx + nx * prof, by + ny * prof),
                               (bx + nx * 3 * prof, by + ny * 3 * prof), (ax + nx * 3 * prof, ay + ny * 3 * prof)])
        m_fuera = np.zeros_like(mascara)
        cv2.fillPoly(m_fuera, [np.array([a_px(x, y) for x, y in fuera_ancho.exterior.coords], np.int32)], 1)
        if (mascara & m_fuera).sum() > 0.2 * (mascara & dentro_franja).sum():
            continue
        sel = mascara & dentro_franja
        sel = cv2.morphologyEx(sel, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        contornos, _ = cv2.findContours(sel, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contornos:
            continue
        cmax = max(contornos, key=cv2.contourArea)
        aprox = cv2.approxPolyDP(cmax, 0.004 * cv2.arcLength(cmax, True), True).reshape(-1, 2)
        if len(aprox) < 3:
            continue
        P = Polygon([(bx0 + x / zoom, by0 + y / zoom) for x, y in aprox]).buffer(0)
        if P.is_empty or P.area < 0.002 * L.area or P.distance(lados[i]) > 2 * r.tam or lejos.is_empty:
            continue
        g = max(getattr(P, "geoms", [P]), key=lambda g: g.area)
        pts = [(float(x), float(y)) for x, y in list(g.exterior.coords)[:-1]]
        if pts not in salida:
            salida.append(pts)
    return salida
