"""Regiones (polígonos) de la lámina: paso 2 del flujo de tres pasos del PreCheck.

El sistema propone polígonos (lote, huella, estacionamientos…) y la persona los revisa y corrige en la web. En la
revisión (paso 3) las regiones son evidencia, nunca verdad: su confianza es siempre menor que el umbral del motor
(0.85), de modo que una región sola no decide una regla; sirve para contrastar con lo declarado y señalar
discrepancias. Formato de `regiones.json`: ver el contrato común (tipos, colores y confianza por origen).

Uso:
    python -m precheck.planos.regiones proponer --pdf original.pdf --salida carpeta [--vision [--modelo M] [--gasto carpeta]] [--extraccion extraccion.json] [--lote lote.json]
    python -m precheck.planos.regiones resumen --regiones carpeta/regiones.json --lote lote.json

`proponer` escribe `carpeta/regiones.json` y `carpeta/r<N>.png` (≈ 100 ppp, como se lee la hoja). Si ya existe
`regiones.json`, conserva las regiones confirmadas, editadas o dibujadas a mano y solo reemplaza las automáticas.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable, Iterable, Optional

from precheck.planos import detectores as de
from precheck.planos import medicion as me

# ---------------------------------------------------------------------------------------------------------------
# Contrato: tipos, colores, etiquetas y confianza por origen.

TIPOS: dict[str, tuple[str, str]] = {
    "lote": ("#2563eb", "Lote"),
    "huella": ("#dc2626", "Huella de la edificación"),
    "retiro_frontal": ("#f59e0b", "Retiro frontal"),
    "retiro_lateral": ("#d97706", "Retiro lateral"),
    "retiro_posterior": ("#b45309", "Retiro posterior"),
    "estacionamiento": ("#7c3aed", "Estacionamiento"),
    "acera": ("#6b7280", "Acera"),
    "area_verde": ("#16a34a", "Área verde"),
    "tinaquera": ("#92400e", "Tinaquera"),
    "acceso_vehicular": ("#0891b2", "Acceso vehicular"),
    "escalera_rampa": ("#db2777", "Escalera o rampa"),
    "otro": ("#64748b", "Otro"),
}
ORIGENES = ("vectorial", "vision", "humano")
#: Paso 3: nunca 100 %. Todas por debajo del umbral del motor (0.85).
CONFIANZA_CONFIRMADA = 0.80
CONFIANZA_EDITADA = 0.70
CONFIANZA_ORIGEN = {"vectorial": 0.70, "vision": 0.50, "humano": 0.70}
CONFIANZA_MAXIMA = 0.80
VERSION = 1

#: Raster de cada hoja para el editor (36" × 24" → 3600 × 2400 px).
DPI_REGIONES = 100
#: Lado mayor de la imagen que se manda al modelo de visión (las coordenadas son fracciones: la resolución no cambia nada).
LADO_VISION_PX = 1600
MAX_PAGINAS_VISION = 2
MAX_CANDIDATOS_VISION = 40
#: Por debajo de esta confianza del modelo de visión, la región se descarta.
MIN_CONFIANZA_VISION = 0.3

#: Estacionamiento: rectángulo de ≈ 2.3–3.0 × 4.5–6.0 m a la escala de la hoja (con un pequeño margen de dibujo).
ESTAC_ANCHO_M = (2.3, 3.0)
ESTAC_LARGO_M = (4.5, 6.0)
TOL_ESTAC = 0.03
#: Rectángulos repetidos: con uno solo no se etiqueta (puede ser cualquier cosa del tamaño de un carro).
MIN_ESTAC = 2
#: Un polígono cuyo ancho o alto ocupa esta fracción de la hoja es el marco de la lámina.
FRACCION_MARCO = 0.9
#: Candidatos (para el modelo de visión): área mínima como fracción del área de la hoja.
AREA_MIN_CANDIDATO = 0.0005
#: Una región automática nueva que se superpone así con una conservada (mismo tipo y página) es la misma.
IOU_DUPLICADA = 0.8
#: Una región de visión que se superpone así con una vectorial del mismo tipo y hoja es la misma (se queda la vectorial).
IOU_VISION_REPETIDA = 0.5
#: Discrepancia de medidas: más del 10 %; conteos: cualquier diferencia.
TOL_MEDIDA = 0.10

#: Hojas donde suele estar el conjunto (para el modelo de visión y para tener la imagen aunque no haya regiones).
_RELEVANTE = re.compile(r"LOCALIZACI|CONJUNTO|UBICACI|SITIO|PLANTA\s+(?:ARQUITECTONICA\s+)?BAJA|PLANTA\s+DE\s+LOTE|\bLOTE\b")
_PREFERENTE = re.compile(r"LOCALIZACI|CONJUNTO|UBICACI|SITIO")
#: Hojas sin planta (los rectángulos del tamaño de una plaza son puertas, paneles o vanos).
_NO_PLANTA = re.compile(r"ELEVACI|SECCI|CORTE|DETALLE|FACHADA", re.I)
_PLANTA = re.compile(r"PLANTA|LOCALIZACI|CONJUNTO|UBICACI|SITIO|LOTE", re.I)


def _sin_planta(titulo: str) -> bool:
    return bool(_NO_PLANTA.search(titulo)) and not _PLANTA.search(titulo)

PT_POR_MM = 72 / 25.4


# ---------------------------------------------------------------------------------------------------------------
# Utilidades geométricas (puntos en el sistema de la hoja como se lee, origen arriba a la izquierda).

def _area(v: list) -> float:
    return abs(sum(v[i][0] * v[i - 1][1] - v[i - 1][0] * v[i][1] for i in range(len(v)))) / 2


def _caja(v: list) -> tuple[float, float, float, float]:
    xs, ys = [p[0] for p in v], [p[1] for p in v]
    return min(xs), min(ys), max(xs), max(ys)


def _sin_colineales(v: list, tol: float = 0.02) -> list:
    """Quita vértices repetidos y los que están en línea recta con sus vecinos (seno del ángulo < tol)."""
    salida = list(v)
    cambio = True
    while cambio and len(salida) > 3:
        cambio = False
        for i in range(len(salida)):
            a, b, c = salida[i - 1], salida[i], salida[(i + 1) % len(salida)]
            ab, bc = math.dist(a, b), math.dist(b, c)
            if ab < 1e-6 or bc < 1e-6:
                del salida[i]
                cambio = True
                break
            cruz = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
            if abs(cruz) / (ab * bc) < tol:
                del salida[i]
                cambio = True
                break
    return salida


def _rectangulo(v: list) -> Optional[tuple[float, float]]:
    """(lado menor, lado mayor) en puntos si el polígono es un rectángulo (cuatro ángulos rectos); si no, None."""
    v = _sin_colineales(v)
    if len(v) != 4:
        return None
    for i in range(4):
        a, b, c = v[i - 1], v[i], v[(i + 1) % 4]
        u, w = (b[0] - a[0], b[1] - a[1]), (c[0] - b[0], c[1] - b[1])
        nu, nw = math.hypot(*u), math.hypot(*w)
        if nu < 1e-6 or nw < 1e-6 or abs(u[0] * w[0] + u[1] * w[1]) / (nu * nw) > 0.05:
            return None
    lados = sorted((math.dist(v[0], v[1]), math.dist(v[1], v[2])))
    return lados[0], lados[1]


def _unicos(poligonos: Iterable[list]) -> list[list]:
    """Sin repetidos: el mismo polígono suele venir dos veces (relleno y contorno)."""
    vistos, salida = set(), []
    for v in poligonos:
        clave = frozenset((round(x), round(y)) for x, y in v)
        if clave not in vistos:
            vistos.add(clave)
            salida.append(v)
    return salida


def _poligono_shapely(v: list):
    from shapely.geometry import Polygon  # noqa: PLC0415

    p = Polygon(v)
    if not p.is_valid:
        p = p.buffer(0)
    return p if not p.is_empty else None


def _iou(a: list, b: list) -> float:
    """Intersección sobre unión de dos polígonos en fracciones (es invariante a la escala de cada eje)."""
    try:
        pa, pb = _poligono_shapely(a), _poligono_shapely(b)
    except Exception:  # noqa: BLE001 — sin shapely o geometría imposible: no se consideran iguales
        return 0.0
    if pa is None or pb is None:
        return 0.0
    union = pa.union(pb).area
    return pa.intersection(pb).area / union if union > 0 else 0.0


# ---------------------------------------------------------------------------------------------------------------
# Hojas: sistema de coordenadas «como se lee».

class Hoja:
    """Una página del PDF tal como se lee: con su rotación y, en las escaneadas, con el giro que aplicó el OCR."""

    def __init__(self, pagina, numero: int, escaneada: bool, giro: int = 0):
        self.pagina, self.numero, self.escaneada, self.giro = pagina, numero, escaneada, giro % 360
        r = pagina.rect
        self.x0, self.y0 = r.x0, r.y0
        ancho, alto = r.width, r.height
        if self.giro in (90, 270):
            ancho, alto = alto, ancho
        self.ancho_pt, self.alto_pt = ancho, alto

    def leida(self, v: list) -> list[tuple[float, float]]:
        """Vértices del PDF (sin rotar) en puntos de la hoja como se lee (solo hojas vectoriales: giro 0)."""
        import pymupdf  # noqa: PLC0415

        m = self.pagina.rotation_matrix
        salida = []
        for x, y in v:
            p = pymupdf.Point(x, y) * m
            salida.append((p.x - self.x0, p.y - self.y0))
        return salida

    def fraccion(self, v: list) -> list[list[float]]:
        return [[round(min(1.0, max(0.0, x / self.ancho_pt)), 5), round(min(1.0, max(0.0, y / self.alto_pt)), 5)]
                for x, y in v]

    def imagen(self, dpi: float):
        """Raster de la hoja como se lee (PIL)."""
        from PIL import Image  # noqa: PLC0415

        pix = self.pagina.get_pixmap(dpi=dpi)
        img = Image.frombytes("RGB" if pix.n < 4 else "RGBA", (pix.width, pix.height), pix.samples)
        if self.giro:
            img = img.rotate(-self.giro, expand=True)
        return img.convert("RGB")


def _giro_por_miniatura(pagina, miniatura: Path) -> Optional[int]:
    """El giro que deja la hoja igual a la miniatura que escribió la extracción (p<N>.png): así la imagen y las
    regiones quedan en el mismo sistema que `extraccion.json` y las marcas de la web, sin volver a adivinarlo."""
    import numpy as np  # noqa: PLC0415
    from PIL import Image  # noqa: PLC0415

    try:
        ref = Image.open(miniatura).convert("L")
    except Exception:  # noqa: BLE001
        return None
    base = Image.frombytes("L", ((pix := pagina.get_pixmap(dpi=20, colorspace="gray")).width, pix.height), pix.samples)
    mejor = None
    for giro in (0, 90, 180, 270):
        img = base.rotate(-giro, expand=True) if giro else base
        if abs(img.width / img.height - ref.width / ref.height) > 0.05 * ref.width / ref.height:
            continue
        a = np.asarray(img.resize((96, 96)), dtype=float)
        b = np.asarray(ref.resize((96, 96)), dtype=float)
        dif = float(np.abs(a - b).mean())
        if mejor is None or dif < mejor[0]:
            mejor = (dif, giro)
    return mejor[1] if mejor else None


def _giro_escaneada(pagina, miniatura: Optional[Path] = None) -> int:
    """Giro (grados en sentido horario) con que el OCR enderezó la hoja escaneada. Con la miniatura de la extracción,
    el que la reproduce; si no, el detector de orientación (Tesseract), solo si está seguro."""
    from precheck.planos.lineas import CONFIANZA_ORIENTACION, DPI_OCR, orientacion  # noqa: PLC0415

    if miniatura is not None and miniatura.exists():
        giro = _giro_por_miniatura(pagina, miniatura)
        if giro is not None:
            return giro
    try:
        giro, conf = orientacion(pagina.get_pixmap(dpi=DPI_OCR).tobytes("png"))
    except Exception:  # noqa: BLE001 — sin Tesseract: la hoja como viene
        return 0
    return giro if conf >= CONFIANZA_ORIENTACION else 0


# ---------------------------------------------------------------------------------------------------------------
# Regiones: forma, identificador y confianza.

def _id(pagina: int, tipo: str, puntos: list, usados: set) -> str:
    base = hashlib.sha1(f"{pagina}|{tipo}|{[[round(x, 4), round(y, 4)] for x, y in puntos]}".encode()).hexdigest()
    for largo in range(6, len(base) + 1):
        rid = f"r-{base[:largo]}"
        if rid not in usados:
            usados.add(rid)
            return rid
    raise RuntimeError("identificador repetido")  # pragma: no cover


def region(pagina: int, tipo: str, puntos: list, origen: str, confianza: float, etiqueta: str = "") -> dict:
    return {"id": "", "pagina": pagina, "tipo": tipo, "puntos": puntos, "origen": origen,
            "confianza": round(min(confianza, CONFIANZA_ORIGEN[origen]), 2), "etiqueta": etiqueta,
            "confirmada": False, "editada": False}


def confianza_region(r: dict) -> float:
    """Confianza de una región como evidencia en la revisión (contrato: siempre < 0.85)."""
    if r.get("confirmada"):
        return CONFIANZA_CONFIRMADA
    if r.get("editada") or r.get("origen") == "humano":
        return CONFIANZA_EDITADA
    base = CONFIANZA_ORIGEN.get(r.get("origen"), CONFIANZA_ORIGEN["vision"])
    c = r.get("confianza")
    return round(min(base, c) if isinstance(c, (int, float)) and c > 0 else base, 2)


def es_conservada(r: dict) -> bool:
    return bool(r.get("confirmada") or r.get("editada") or r.get("origen") == "humano")


def puntos_validos(crudo, tol: float = 0.02) -> Optional[list[list[float]]]:
    """Polígono en fracciones 0–1: ≥ 3 vértices numéricos dentro de la hoja (con un margen que se recorta), sin repetir
    el primero al final y con área. Devuelve None si no sirve."""
    if not isinstance(crudo, list):
        return None
    pts: list[list[float]] = []
    for p in crudo:
        if not (isinstance(p, (list, tuple)) and len(p) == 2 and all(isinstance(c, (int, float)) and math.isfinite(c) for c in p)):
            return None
        x, y = float(p[0]), float(p[1])
        if x < -tol or y < -tol or x > 1 + tol or y > 1 + tol:
            return None
        q = [round(min(1.0, max(0.0, x)), 5), round(min(1.0, max(0.0, y)), 5)]
        if not pts or abs(q[0] - pts[-1][0]) + abs(q[1] - pts[-1][1]) > 1e-6:
            pts.append(q)
    if len(pts) > 1 and abs(pts[0][0] - pts[-1][0]) + abs(pts[0][1] - pts[-1][1]) <= 1e-6:
        pts.pop()
    if len(pts) < 3 or _area(pts) < 1e-6:
        return None
    return pts


# ---------------------------------------------------------------------------------------------------------------
# Propuesta vectorial.

def _escalas_lamina(extraccion: Optional[dict]) -> dict[int, int]:
    salida = {}
    for p in (extraccion or {}).get("paginas", []):
        esc = (p.get("lamina") or {}).get("escala")
        if isinstance(esc, (int, float)) and esc > 0:
            salida[int(p["numero"])] = int(esc)
    return salida


def _lados_m(v: list, escala: int) -> list[float]:
    v = _sin_colineales(v)
    return sorted(math.dist(v[i], v[(i + 1) % len(v)]) * escala * me._PT_M for i in range(len(v)))


def _lotes_confiables(lotes: dict[int, tuple]) -> dict[int, tuple]:
    """Solo los lotes a una escala rotulada en su hoja, o con los mismos lados (en metros) que uno de esos. Cualquier
    rectángulo (un cuadro de notas, el marco de una leyenda) mide el área del lote a alguna escala estándar: sin la
    escala escrita en la hoja, coincidir en área no basta."""
    rotulados = {n: t for n, t in lotes.items() if not t[0][1]}
    if not rotulados:
        return {}
    ref = min(rotulados.values(), key=lambda t: t[0])
    lados_ref = _lados_m(ref[3], ref[1])
    salida = dict(rotulados)
    for n, t in lotes.items():
        if n in salida:
            continue
        lados = _lados_m(t[3], t[1])
        if len(lados) == len(lados_ref) and all(abs(a - b) <= max(0.03 * b, 0.3) for a, b in zip(lados, lados_ref)):
            salida[n] = t
    return salida


#: La escala implícita en el área escrita se usa solo si cae a menos de esto de una escala rotulada o estándar.
TOL_ESCALA_POR_AREA = 0.02


def _escala_por_area(area_pt2: float, area_m2: Optional[float], rotuladas: set[int]) -> Optional[int]:
    """Escala (rotulada en la hoja o estándar) a la que el polígono mide el área escrita; None si ninguna cuadra."""
    if not area_m2 or area_pt2 <= 0:
        return None
    implicita = math.sqrt(area_m2 / area_pt2) / me._PT_M
    for esc in sorted(rotuladas) + list(me.ESCALAS_ESTANDAR):
        if abs(implicita - esc) / esc <= TOL_ESCALA_POR_AREA:
            return int(esc)
    return None


#: «SUPERFICIE 31450.00 M2» (Tocumen): el área del lote sin decir «del lote» (o «SUPERFICIE DEL TERRENO / DE LA
#: FINCA …»). Solo si la línea empieza así y es única. «SUPERFICIE TOTAL …» no: suele ser el área construida.
_SUPERFICIE = re.compile(r"^\s*SUPERFICIE\s*(?:(?:DEL?|DE\s+LA)\s+(?:LOTE|TERRENO|FINCA)\s*)?[:=]?\s*"
                         r"([0-9][0-9.,]*)\s*(?:M2|M²|MTS2|MT2)\b")


def area_escrita(lineas: list) -> Optional[float]:
    """Área del lote escrita como «SUPERFICIE <n> M2» (un solo valor en todo el plano); si no, None."""
    valores = set()
    for ln in lineas:
        m = _SUPERFICIE.match(_sin_tildes(ln.texto).upper())
        if m:
            from precheck.planos.extractores import numero  # noqa: PLC0415

            v, _ = numero(m.group(1).rstrip(".,"))
            if v and v > 0:
                valores.add(round(v, 2))
    return valores.pop() if len(valores) == 1 else None


#: La franja de acera se ajusta a menudo (el cordón no siempre está dibujado): menos confianza que el resto.
CONFIANZA_ACERA = 0.5
#: Acera: el detector (`detectores.aceras`) no es fiable todavía (IoU 0.50 en Panamá Norte, una cuña fuera del frente
#: en Bella Vista AR-01): no se propone; queda para la persona (docs/regiones-medicion/RESULTADOS-v2.md).
PROPONER_ACERA = False


def _menos(v: list, quitar: list[list]) -> list[list]:
    """Polígono `v` sin los polígonos `quitar` (las partes con área)."""
    from shapely.ops import unary_union  # noqa: PLC0415

    p = _poligono_shapely(v)
    if p is None:
        return []
    q = [x for x in (_poligono_shapely(w) for w in quitar) if x is not None]
    if q:
        p = p.difference(unary_union(q))
    salida = []
    for g in getattr(p, "geoms", [p]):
        if g.geom_type == "Polygon" and g.area > 0.05 * _area(v):
            salida.append([(float(x), float(y)) for x, y in list(g.exterior.coords)[:-1]])
    return salida


def _seguro(avisos: Optional[list[str]], pagina: int, nombre: str, detector, *args):
    """Corre un detector; si falla, lo avisa y devuelve [] para que el resto de la propuesta siga."""
    try:
        return detector(*args)
    except Exception as e:  # noqa: BLE001 — un detector roto no tumba la propuesta completa
        if avisos is not None:
            avisos.append(f"Detector «{nombre}», hoja {pagina}: {type(e).__name__}: {e}")
        return []


def propuesta_vectorial(doc, hojas: dict[int, Hoja], lineas: list, area_lote: Optional[float],
                        escalas_lamina: dict[int, int], titulos: Optional[dict[int, str]] = None,
                        avisos: Optional[list[str]] = None
                        ) -> tuple[list[dict], dict[int, Optional[int]], dict[int, list]]:
    """Regiones de los trazos del PDF. Devuelve (regiones, escala de cada hoja, candidatos sin etiquetar por hoja).

    - lote: el polígono que `medicion.lote_por_lamina` reconoce (su área a escala coincide con el área escrita);
    - estacionamiento: rectángulos repetidos de 2.3–3.0 × 4.5–6.0 m a la escala de la hoja (solo si se conoce),
      dentro del lote si el lote está en la hoja;
    - huella: los espacios cerrados con un rótulo de ambiente dentro del lote, unidos (`detectores.huella_por_ambientes`)."""
    from shapely.geometry import Point  # noqa: PLC0415

    vectoriales = {n: h for n, h in hojas.items() if not h.escaneada}
    poligonos: dict[int, list] = {}
    palabras: dict[int, list] = {}
    segmentos: dict[int, object] = {}
    trazos: dict[int, object] = {}
    for n, h in vectoriales.items():
        dibujos = h.pagina.get_drawings()
        poligonos[n] = _unicos(me._poligonos(h.pagina, dibujos))
        palabras[n] = de.palabras(h.pagina)
        trazos[n] = de.trazos_crudos(dibujos)
        del dibujos
        # Los trazos en el sistema de lectura solo hacen falta con una numeración (plazas) o vértices rotulados (lote).
        segmentos[n] = (de.a_leida(h.pagina, trazos[n])
                        if de.hay_numeracion(palabras[n]) or de.hay_vertices(palabras[n]) else None)
    lotes = _lotes_confiables(me.lote_por_lamina(doc, lineas, area_lote, poligonos, trazos) if area_lote else {})
    rotuladas: dict[int, set[int]] = {}
    for e in me.escalas(lineas):
        rotuladas.setdefault(int(e["fuente"]["pagina"]), set()).add(int(e["valor"]))
    regiones: list[dict] = []
    escalas: dict[int, Optional[int]] = {}
    candidatos: dict[int, list] = {}
    for n, hoja in vectoriales.items():
        # Escala de la hoja: la que da el lote por su área, la del membrete o la única rotulada en la hoja.
        unica = next(iter(rotuladas[n])) if len(rotuladas.get(n, ())) == 1 else None
        escala = lotes[n][1] if n in lotes else (escalas_lamina.get(n) or unica)
        area_hoja = hoja.ancho_pt * hoja.alto_pt
        lote_v = hoja.leida(lotes[n][3]) if n in lotes else None
        etiqueta_lote = f"Área a 1:{escala}: {lotes[n][2]:,.2f} m²" if n in lotes else ""
        implicita: Optional[float] = None
        # Lote por sus vértices rotulados y las líneas de propiedad (aunque no sea un polígono cerrado). Un solo lote
        # por hoja: si el del área escrita es otro dibujo (p. ej. la localización regional), se queda el más grande.
        if segmentos.get(n) is not None:
            rot = max(_seguro(avisos, n, "lote por vértices", de.lotes_rotulados, palabras[n], segmentos[n]),
                      key=lambda x: _area(x.puntos), default=None)
            if rot is not None and (lote_v is None or (_iou(rot.puntos, lote_v) < 0.8 and _area(rot.puntos) > _area(lote_v))):
                lote_v = rot.puntos
                esc_area = _escala_por_area(_area(lote_v), area_lote, rotuladas.get(n, set()))
                etiqueta_lote = f"Vértices 1–{len(lote_v)} rotulados y líneas de propiedad"
                if area_lote:
                    implicita = math.sqrt(area_lote / _area(lote_v)) / me._PT_M
                    etiqueta_lote += f"; con el área escrita ({area_lote:,.2f} m²), ≈ 1:{implicita:.0f}"
                escala = esc_area or (escalas_lamina.get(n) or unica)
                lotes.pop(n, None)
        escalas[n] = escala
        lote_p = _poligono_shapely(lote_v) if lote_v else None
        if lote_v:
            regiones.append(region(n, "lote", hoja.fraccion(lote_v), "vectorial", CONFIANZA_ORIGEN["vectorial"],
                                   etiqueta_lote))
        usados: set[int] = set()
        if lotes.get(n):
            usados.add(next((i for i, v in enumerate(poligonos[n]) if v is lotes[n][3]), -1))
        # Estacionamientos por tamaño (solo con la escala conocida).
        estac: list[tuple[int, list]] = []
        # (no en elevaciones, cortes o detalles: puertas y paneles miden lo que una plaza)
        if escala and not _sin_planta((titulos or {}).get(n, "")):
            k = escala * me._PT_M
            a_min = ESTAC_ANCHO_M[0] * ESTAC_LARGO_M[0] / k ** 2 * (1 - TOL_ESTAC) ** 2
            a_max = ESTAC_ANCHO_M[1] * ESTAC_LARGO_M[1] / k ** 2 * (1 + TOL_ESTAC) ** 2
            for i, v in enumerate(poligonos[n]):
                if not a_min <= _area(v) <= a_max:
                    continue
                r = _rectangulo(v)
                if not r:
                    continue
                corto, largo = r[0] * k, r[1] * k
                if not (ESTAC_ANCHO_M[0] * (1 - TOL_ESTAC) <= corto <= ESTAC_ANCHO_M[1] * (1 + TOL_ESTAC)
                        and ESTAC_LARGO_M[0] * (1 - TOL_ESTAC) <= largo <= ESTAC_LARGO_M[1] * (1 + TOL_ESTAC)):
                    continue
                vl = hoja.leida(v)
                cx, cy = sum(p[0] for p in vl) / len(vl), sum(p[1] for p in vl) / len(vl)
                if lote_p is not None and not lote_p.buffer(1.0).contains(Point(cx, cy)):
                    continue  # otro dibujo de la hoja (p. ej. la localización regional)
                # Un mismo puesto dibujado dos veces con un leve desfase: un centro a menos de 0.3 m de otro.
                if any(math.dist((cx, cy), c) * k < 0.3 for _, _, c in estac):
                    continue
                estac.append((i, vl, (cx, cy)))
            if len(estac) >= MIN_ESTAC:
                for i, vl, _ in estac:
                    usados.add(i)
                    regiones.append(region(n, "estacionamiento", hoja.fraccion(vl), "vectorial", CONFIANZA_ORIGEN["vectorial"]))
            else:
                estac = []
        # Estacionamientos por numeración y separadores (no necesitan la escala ni rectángulos cerrados).
        ya = [_poligono_shapely(vl) for _, vl, _ in estac]
        if segmentos.get(n) is not None:
            for fila in _seguro(avisos, n, "plazas por numeración", de.filas_de_plazas, palabras[n], segmentos[n], escala):
                for plaza in fila.plazas:
                    p = _poligono_shapely(plaza.puntos)
                    if p is None:
                        continue
                    # Sin filtro por el lote: la fila ya está validada por sus separadores, y una hoja puede tener
                    # dos plantas con estacionamientos (semisótano y mezzanine) pero un solo lote propuesto.
                    c = p.centroid
                    if any(q is not None and (q.contains(c) or p.contains(q.centroid)) for q in ya):
                        continue  # ya está como rectángulo
                    ya.append(p)
                    regiones.append(region(n, "estacionamiento", hoja.fraccion(plaza.puntos), "vectorial",
                                           CONFIANZA_ORIGEN["vectorial"], f"Plaza {plaza.numero}"))
        # Huella: los espacios cerrados con un rótulo de ambiente dentro (no el polígono más grande), sin las plazas.
        if lote_v:
            plazas_c = [(q.centroid.x, q.centroid.y) for q in ya if q is not None]
            esc_h = escala or implicita   # para el grueso de muros y mobiliario basta la escala aproximada
            pt_por_m = 1 / (esc_h * me._PT_M) if esc_h else None
            for v in _seguro(avisos, n, "huella", de.huella_por_ambientes, hoja.pagina, lote_v, palabras[n], plazas_c,
                             pt_por_m):
                regiones.append(region(n, "huella", hoja.fraccion(v), "vectorial", CONFIANZA_ORIGEN["vectorial"],
                                       f"Ambientes rotulados: {_area(v) / lote_p.area:.0%} del lote"))
            # Acera y área verde: solo con su rótulo y un contorno que la cierre (si no, no se proponen).
            verdes = _seguro(avisos, n, "área verde", de.areas_verdes, hoja.pagina, lote_v, palabras[n])
            for v in verdes:
                regiones.append(region(n, "area_verde", hoja.fraccion(v), "vectorial", CONFIANZA_ORIGEN["vectorial"],
                                       "Rótulo de grama o área verde en un relleno verde"))
            for v in (_seguro(avisos, n, "acera", de.aceras, hoja.pagina, lote_v, palabras[n], pt_por_m)
                      if PROPONER_ACERA else []):
                for g in _menos(v, verdes):   # la grama junto a la acera no es acera
                    regiones.append(region(n, "acera", hoja.fraccion(g), "vectorial", CONFIANZA_ACERA,
                                           "Rótulo ACERA y franja frente al lindero (revise el ancho)"))
        # Candidatos sin etiquetar (para el modelo de visión): grandes, sin el marco y, si hay lote, que lo tocan.
        cand = []
        for i, v in enumerate(poligonos[n]):
            if i in usados or _area(v) < AREA_MIN_CANDIDATO * area_hoja:
                continue
            vl = hoja.leida(v)
            x0, y0, x1, y1 = _caja(vl)
            if x1 - x0 >= FRACCION_MARCO * hoja.ancho_pt or y1 - y0 >= FRACCION_MARCO * hoja.alto_pt:
                continue
            if lote_p is not None:
                p = _poligono_shapely(vl)
                if p is None or not p.intersects(lote_p):
                    continue
            cand.append((_area(v), vl))
        cand.sort(key=lambda c: -c[0])
        candidatos[n] = [vl for _, vl in cand[:MAX_CANDIDATOS_VISION]]
    return regiones, escalas, candidatos


# ---------------------------------------------------------------------------------------------------------------
# Propuesta por visión (Claude por el CLI de Claude Code) y refinamiento opcional con SAM 2.1.

PROMPT_VISION = """Eres un asistente que marca regiones en un plano arquitectónico de anteproyecto (Panamá).
Lee con la herramienta Read la imagen {ruta} (hoja {pagina} del plano, tal como se lee).

Devuelve SOLO un objeto JSON (sin texto antes ni después, sin ```), con esta forma exacta:
{{"regiones": [{{"tipo": "<tipo>", "puntos": [[x, y], [x, y], [x, y]], "confianza": 0.0, "etiqueta": ""}}],
  "candidatos": [{{"n": 1, "tipo": "<tipo>", "confianza": 0.0}}], "estacionamientos_visibles": false}}

Reglas:
- "puntos": polígono (3 o más vértices, sin repetir el primero al final) en FRACCIÓN 0–1 del ancho y del alto de la
  imagen completa; x hacia la derecha, y hacia abajo, origen arriba a la izquierda.
- "tipo" solo puede ser uno de: {tipos}.{ya_marcado}
{definiciones}
- Marca solo lo que se ve claramente en la planta de conjunto, localización o planta baja. No marques el membrete,
  el marco de la lámina ni los cuadros de texto. Si la hoja no tiene una planta, devuelve listas vacías.
- "confianza" de 0 a 1: qué tan seguro estás de esa región. No inventes regiones.
- "estacionamientos_visibles": true si en la planta hay puestos de estacionamiento dibujados (aunque no los marques).
{bloque_candidatos}"""

DEFINICIONES = {
    "lote": "lote = linderos del terreno (uno solo)",
    "huella": "huella = contorno de la edificación en planta (techada)",
    "retiro_frontal": "retiro_frontal / retiro_lateral / retiro_posterior = franja entre la edificación y el lindero",
    "estacionamiento": "estacionamiento = un puesto (un polígono por puesto)",
    "tinaquera": "tinaquera = depósito de basura",
    "acceso_vehicular": "acceso_vehicular = entrada de vehículos desde la calle",
    "escalera_rampa": "escalera_rampa = escalera o rampa",
}

PROMPT_MOSAICO = """Eres un asistente que marca puestos de estacionamiento en un plano arquitectónico (Panamá).
Lee con la herramienta Read la imagen {ruta}: es un TROZO de la hoja {pagina}.

Devuelve SOLO un objeto JSON (sin texto antes ni después, sin ```):
{{"regiones": [{{"tipo": "estacionamiento", "puntos": [[x, y], [x, y], [x, y], [x, y]], "confianza": 0.0, "etiqueta": ""}}]}}

- Un polígono por puesto (el rectángulo o paralelogramo entre sus líneas separadoras), en FRACCIÓN 0–1 del ancho y
  del alto de ESTE trozo; x hacia la derecha, y hacia abajo. En "etiqueta", el número del puesto si se lee.
- Solo puestos que se vean enteros en el trozo. Sin puestos, devuelve "regiones": []. No inventes.
"""

BLOQUE_CANDIDATOS = """- Además, estos polígonos del dibujo vectorial no tienen tipo. Para cada uno que reconozcas, devuelve en "candidatos"
  su número y su tipo (omite los que no sepas o sean texto, membrete o cotas). Caja de cada uno en fracciones
  [x0, y0, x1, y1]:
{lista}"""


def _comando_claude() -> list[str]:
    """Mismo orden que la web (web/src/server/ia/config.ts): PRECHECK_CLAUDE_BIN, el claude.exe de npm, `claude`."""
    propio = os.environ.get("PRECHECK_CLAUDE_BIN", "").strip()
    if propio:
        import shlex  # noqa: PLC0415

        if os.name == "nt":  # rutas de Windows: sin escapes POSIX, comillas solo para agrupar
            return [t.strip('"') for t in shlex.split(propio, posix=False)]
        return shlex.split(propio)
    if os.name == "nt" and os.environ.get("APPDATA"):
        exe = Path(os.environ["APPDATA"]) / "npm" / "node_modules" / "@anthropic-ai" / "claude-code" / "bin" / "claude.exe"
        if exe.exists():
            return [str(exe)]
    return [shutil.which("claude") or "claude"]


def llamar_claude(prompt: str, carpeta: Path, modelo: str = "sonnet", limite_s: int = 600,
                  uso: Optional[list[dict]] = None) -> str:
    """Texto de la respuesta de `claude -p` (cuenta del usuario). El prompt va por stdin. Lanza RuntimeError si falla.
    Con `uso`, le agrega el costo estimado (precio de la API, no la cuota de la suscripción) y los segundos de la llamada."""
    args = [*_comando_claude(), "-p", "--model", modelo, "--allowedTools", "Read", "--add-dir", str(carpeta),
            "--output-format", "json", "--no-session-persistence", "--settings", json.dumps({"disableAllHooks": True})]
    entorno = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}  # se puede lanzar desde otra sesión
    r = subprocess.run(args, input=prompt, capture_output=True, text=True, encoding="utf-8", timeout=limite_s, env=entorno)
    try:
        salida = json.loads(r.stdout)
    except ValueError:
        raise RuntimeError(f"Claude Code no devolvió JSON (código {r.returncode}): {(r.stderr or r.stdout)[-300:]}") from None
    if r.returncode != 0 or salida.get("is_error"):
        raise RuntimeError(f"Claude Code terminó con error: {str(salida.get('result') or r.stderr)[-300:]}")
    if uso is not None:
        uso.append({"costo_usd": salida.get("total_cost_usd"), "segundos": round((salida.get("duration_ms") or 0) / 1000, 1)})
    return str(salida.get("result") or "")


# DeepSeek (API compatible con OpenAI): mismos valores que web/src/server/ia/deepseek.ts.
MODELO_DEEPSEEK = "deepseek-flash"
URL_DEEPSEEK = "https://api.deepseek.com/chat/completions"
#: USD por millón de tokens, precio de pico (el peor caso).
PRECIO_ENTRADA_DS = 0.3
PRECIO_SALIDA_DS = 1.2
#: La respuesta es un JSON corto de regiones.
MAX_TOKENS_DS = 8000
#: El prompt de Claude pide leer la imagen con Read; DeepSeek no tiene herramientas y la recibe adjunta.
_LEER_CON_READ = re.compile(r"Lee con la herramienta Read la imagen (.+?\.png)")


def _llave_deepseek() -> Optional[str]:
    """DEEPSEEK_API_KEY del entorno o la línea DEEPSEEK_API_KEY=… de ~/.config/precheck/deepseek.env. Nunca se muestra."""
    propia = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if propia:
        return propia
    try:
        texto = (Path.home() / ".config" / "precheck" / "deepseek.env").read_text(encoding="utf-8")
    except OSError:
        return None
    for linea in texto.splitlines():
        linea = linea.strip()
        if linea.startswith("DEEPSEEK_API_KEY="):
            v = linea[len("DEEPSEEK_API_KEY="):].strip().strip('"')
            return v if len(v) >= 10 else None
    return None


def _carpeta_gasto() -> Path:
    """Donde la web acumula el gasto de DeepSeek si no se pasa otra (la web pasa la suya con --gasto)."""
    return Path(__file__).resolve().parents[2] / "web" / ".data"


def leer_gasto_deepseek(carpeta: Path) -> dict:
    try:
        return json.loads((carpeta / "deepseek_gasto.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"usd": 0, "llamadas": 0, "tokens_entrada": 0, "tokens_salida": 0}


def anotar_gasto_deepseek(carpeta: Path, entrada: int, salida: int) -> dict:
    """Suma una llamada a `deepseek_gasto.json` (mismas claves y cuenta que deepseek.ts). La web y este proceso pueden
    escribirlo: el reemplazo atómico deja cada escritura entera, pero no ordena dos escrituras a la vez."""
    g = leer_gasto_deepseek(carpeta)
    costo = entrada / 1e6 * PRECIO_ENTRADA_DS + salida / 1e6 * PRECIO_SALIDA_DS
    g["usd"] = round((float(g.get("usd") or 0) + costo) * 1e6) / 1e6
    g["llamadas"] = int(g.get("llamadas") or 0) + 1
    g["tokens_entrada"] = int(g.get("tokens_entrada") or 0) + entrada
    g["tokens_salida"] = int(g.get("tokens_salida") or 0) + salida
    carpeta.mkdir(parents=True, exist_ok=True)
    tmp = carpeta / f"deepseek_gasto.json.{os.getpid()}.tmp"
    tmp.write_text(json.dumps(g, indent=1), encoding="utf-8")
    os.replace(tmp, carpeta / "deepseek_gasto.json")
    return g


def llamar_deepseek(prompt: str, carpeta: Path, modelo: str = MODELO_DEEPSEEK, limite_s: int = 600,
                    gasto: Optional[Path] = None, url: Optional[str] = None) -> str:
    """Texto de la respuesta de DeepSeek a un prompt de visión. Mismo uso que `llamar_claude`: la imagen que el prompt
    manda leer con Read (dentro de `carpeta`) va adjunta como `data:` base64 y la frase de Read se cambia. Sin
    herramientas y con salida JSON. Respeta el tope de gasto (PRECHECK_DEEPSEEK_TOPE_USD, 60 por defecto) y anota cada
    llamada en `deepseek_gasto.json`. `url` (o PRECHECK_DEEPSEEK_URL) solo para pruebas. Lanza RuntimeError si falla."""
    import base64  # noqa: PLC0415
    import urllib.error  # noqa: PLC0415
    import urllib.request  # noqa: PLC0415

    m = _LEER_CON_READ.search(prompt)
    if not m:
        raise RuntimeError("El prompt no dice qué imagen leer.")
    imagen = Path(m.group(1))
    if imagen.resolve().parent != Path(carpeta).resolve():
        raise RuntimeError("La imagen del prompt no está en la carpeta de la propuesta.")
    texto = prompt[:m.start()] + "Mira la imagen adjunta" + prompt[m.end():]
    llave = _llave_deepseek()
    if not llave:
        raise RuntimeError("No hay llave de DeepSeek (DEEPSEEK_API_KEY o ~/.config/precheck/deepseek.env).")
    carpeta_gasto = gasto or _carpeta_gasto()
    tope = float(os.environ.get("PRECHECK_DEEPSEEK_TOPE_USD") or 60)
    usd = float(leer_gasto_deepseek(carpeta_gasto).get("usd") or 0)
    if usd >= tope:
        raise RuntimeError(f"Tope de gasto de DeepSeek alcanzado ({usd:.2f} de {tope:g} USD): no se lanza.")
    datos_imagen = base64.b64encode(imagen.read_bytes()).decode("ascii")
    cuerpo = {"model": modelo, "temperature": 0, "max_tokens": MAX_TOKENS_DS, "response_format": {"type": "json_object"},
              "messages": [{"role": "user", "content": [
                  {"type": "text", "text": texto},
                  {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{datos_imagen}"}}]}]}
    pedido = urllib.request.Request(url or os.environ.get("PRECHECK_DEEPSEEK_URL") or URL_DEEPSEEK,
                                    data=json.dumps(cuerpo).encode("utf-8"), method="POST",
                                    headers={"content-type": "application/json", "authorization": f"Bearer {llave}"})
    try:
        with urllib.request.urlopen(pedido, timeout=limite_s) as r:
            respuesta = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        with e:
            detalle = e.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"DeepSeek respondió {e.code}: {detalle}") from None
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        raise RuntimeError(f"No se pudo llamar a DeepSeek: {e}") from None
    uso = respuesta.get("usage") or {}
    entrada, salida = uso.get("prompt_tokens"), uso.get("completion_tokens")
    if not isinstance(entrada, int) or not isinstance(salida, int):
        raise RuntimeError("DeepSeek respondió sin usage: no se puede anotar el gasto.")
    anotar_gasto_deepseek(carpeta_gasto, entrada, salida)
    try:
        return str(respuesta["choices"][0]["message"].get("content") or "")
    except (KeyError, IndexError, TypeError, AttributeError):
        raise RuntimeError("DeepSeek respondió sin choices.") from None


def ejecutor_vision(modelo: str, gasto: Optional[Path] = None) -> Callable[[str, Path], str]:
    """El `ejecutar` de `propuesta_vision` para un modelo: DeepSeek por su API; cualquier otro, con `claude -p` (alias
    como «sonnet» o ids completos como «claude-opus-5-5», los mismos de web/src/server/ia/config.ts)."""
    if modelo.startswith("deepseek"):
        return lambda prompt, carpeta: llamar_deepseek(prompt, carpeta, modelo, gasto=gasto)
    return lambda prompt, carpeta: llamar_claude(prompt, carpeta, modelo)


def json_de_texto(texto: str) -> Optional[dict]:
    """El primer objeto JSON del texto (admite un bloque ```json … ```)."""
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", texto, re.S)
    candidatos = [m.group(1)] if m else []
    if "{" in texto:
        candidatos.append(texto[texto.index("{"): texto.rindex("}") + 1])
    for c in candidatos:
        try:
            datos = json.loads(c)
        except ValueError:
            continue
        if isinstance(datos, dict):
            return datos
    return None


def limpiar_vision(datos: Optional[dict], pagina: int, candidatos: list[list[list[float]]],
                   tipos: Optional[Iterable[str]] = None) -> list[dict]:
    """Regiones válidas de la respuesta del modelo: tipos permitidos (`tipos`, por defecto todos), polígonos válidos,
    confianza ≤ 0.50."""
    salida: list[dict] = []
    if not isinstance(datos, dict):
        return salida
    permitidos = set(tipos) if tipos is not None else set(TIPOS)

    def conf(x) -> Optional[float]:
        c = x.get("confianza", 0.5)
        if not isinstance(c, (int, float)) or not math.isfinite(c):
            return None
        return None if c < MIN_CONFIANZA_VISION else min(float(c), 1.0)

    for x in datos.get("regiones") or []:
        if not isinstance(x, dict) or x.get("tipo") not in permitidos or (c := conf(x)) is None:
            continue
        pts = puntos_validos(x.get("puntos"))
        if pts is None:
            continue
        etiqueta = x.get("etiqueta") if isinstance(x.get("etiqueta"), str) else ""
        salida.append(region(pagina, x["tipo"], pts, "vision", c, etiqueta.strip()[:120]))
    vistos = set()
    for x in datos.get("candidatos") or []:
        if not isinstance(x, dict) or x.get("tipo") not in permitidos or x.get("tipo") == "otro" or (c := conf(x)) is None:
            continue
        n = x.get("n")
        if not isinstance(n, int) or isinstance(n, bool) or not 1 <= n <= len(candidatos) or n in vistos:
            continue
        vistos.add(n)
        pts = puntos_validos(candidatos[n - 1])
        if pts is not None:
            salida.append(region(pagina, x["tipo"], pts, "vision", c, "Polígono del dibujo etiquetado por visión"))
    return salida


def _prompt(ruta: Path, pagina: int, candidatos: list[list[list[float]]], tipos: Optional[list[str]] = None) -> str:
    tipos = list(tipos) if tipos is not None else list(TIPOS_VISION)
    bloque = ""
    if candidatos:
        lista = "\n".join(f"  {i}. {[round(c, 3) for c in _caja(v)]}" for i, v in enumerate(candidatos, start=1))
        bloque = BLOQUE_CANDIDATOS.format(lista=lista)
    vistas, definiciones = set(), []
    for t in tipos:
        d = DEFINICIONES.get("retiro_frontal" if t.startswith("retiro_") else t)
        if d and d not in vistas:
            vistas.add(d)
            definiciones.append(f"  {d}.")
    ya_marcado = "" if set(tipos) >= set(TIPOS_VISION) else " Lo demás ya está marcado: no lo repitas."
    return PROMPT_VISION.format(ruta=ruta, pagina=pagina, tipos=", ".join(tipos), definiciones="\n".join(definiciones),
                                bloque_candidatos=bloque, ya_marcado=ya_marcado)


#: Tipos que se piden a la visión. Acera y área verde no: en la medición sus propuestas cayeron siempre fuera (IoU 0).
TIPOS_VISION = ("lote", "huella", "retiro_frontal", "retiro_lateral", "retiro_posterior", "estacionamiento",
                "tinaquera", "acceso_vehicular", "escalera_rampa")
#: Mosaico para los puestos de estacionamiento (elementos repetidos): filas × columnas, con solape.
MOSAICO = (2, 2)
SOLAPE_MOSAICO = 0.08


def tipos_para_vision(hoja: Hoja, vectoriales: list[dict]) -> list[str]:
    """Qué pedir a la visión en una hoja: todo en una escaneada; en una vectorial, solo los tipos sin propuesta
    vectorial en esa hoja (lo vectorial es más preciso y la visión lo duplicaría desplazado)."""
    if hoja.escaneada:
        return list(TIPOS_VISION)
    hay = {r["tipo"] for r in vectoriales if r["pagina"] == hoja.numero}
    return [t for t in TIPOS_VISION if t not in hay]


def _mosaicos(filas: int, columnas: int, solape: float) -> list[tuple[float, float, float, float]]:
    cajas = []
    for i in range(filas):
        for j in range(columnas):
            x0, x1 = j / columnas - solape, (j + 1) / columnas + solape
            y0, y1 = i / filas - solape, (i + 1) / filas + solape
            cajas.append((max(0.0, x0), max(0.0, y0), min(1.0, x1), min(1.0, y1)))
    return cajas


def _plazas_por_mosaico(img, carpeta: Path, n: int, ejecutar, avisos: list[str]) -> list[dict]:
    """Puestos de estacionamiento pedidos trozo a trozo (más resolución por puesto), en fracciones de la hoja."""
    salida: list[dict] = []
    ancho, alto = img.size
    for k, (x0, y0, x1, y1) in enumerate(_mosaicos(*MOSAICO, SOLAPE_MOSAICO), start=1):
        trozo = img.crop((round(x0 * ancho), round(y0 * alto), round(x1 * ancho), round(y1 * alto)))
        ruta = carpeta / f"hoja{n}-trozo{k}.png"
        trozo.save(ruta)
        try:
            texto = ejecutar(PROMPT_MOSAICO.format(ruta=ruta, pagina=n), carpeta)
        except Exception as e:  # noqa: BLE001
            avisos.append(f"Visión, hoja {n}, trozo {k}: {e}")
            continue
        for r in limpiar_vision(json_de_texto(texto), n, [], ("estacionamiento",)):
            pts = puntos_validos([[x0 + x * (x1 - x0), y0 + y * (y1 - y0)] for x, y in r["puntos"]])
            if pts is None:
                continue
            # El mismo puesto visto en dos trozos (por el solape): se queda una vez.
            if any(_iou(pts, o["puntos"]) >= IOU_VISION_REPETIDA for o in salida):
                continue
            salida.append({**r, "puntos": pts})
    return salida


def propuesta_vision(hojas: dict[int, Hoja], paginas: list[int], candidatos: dict[int, list],
                     ejecutar: Optional[Callable[[str, Path], str]] = None, predictor_sam=None,
                     avisos: Optional[list[str]] = None, tipos: Optional[dict[int, list[str]]] = None) -> list[dict]:
    """Regiones propuestas por Claude en las hojas relevantes (y etiquetas para los candidatos vectoriales).
    `tipos`: qué pedir en cada hoja (`tipos_para_vision`); una hoja sin nada que pedir no se manda. Si hay puestos de
    estacionamiento que pedir y el modelo dice que se ven, se piden por mosaico (un trozo de la hoja por llamada)."""
    ejecutar = ejecutar or llamar_claude
    avisos = avisos if avisos is not None else []
    salida: list[dict] = []
    with tempfile.TemporaryDirectory(prefix="precheck-regiones-") as tmp:
        carpeta = Path(tmp)
        for n in paginas:
            hoja = hojas[n]
            pedir = list(tipos[n]) if tipos is not None and n in tipos else list(TIPOS_VISION)
            if not pedir:
                continue
            dpi = max(10, round(LADO_VISION_PX / (max(hoja.ancho_pt, hoja.alto_pt) / 72)))
            img = hoja.imagen(dpi)
            ruta = carpeta / f"hoja{n}.png"
            img.save(ruta)
            cand = [hoja.fraccion(v) for v in candidatos.get(n, [])]
            try:
                texto = ejecutar(_prompt(ruta, n, cand, pedir), carpeta)
            except Exception as e:  # noqa: BLE001 — la visión es opcional: se avisa y se sigue con lo vectorial
                avisos.append(f"Visión, hoja {n}: {e}")
                continue
            datos = json_de_texto(texto)
            if datos is None:
                avisos.append(f"Visión, hoja {n}: la respuesta no trae un JSON válido.")
                continue
            nuevas = limpiar_vision(datos, n, cand, pedir)
            if "estacionamiento" in pedir and datos.get("estacionamientos_visibles") is True:
                grande = hoja.imagen(dpi * max(MOSAICO))
                por_trozo = _plazas_por_mosaico(grande, carpeta, n, ejecutar, avisos)
                if por_trozo:
                    nuevas = [r for r in nuevas if r["tipo"] != "estacionamiento"] + por_trozo
            if predictor_sam and nuevas:  # False = sin SAM a propósito
                # SAM afina sobre una imagen de más resolución que la que vio Claude (las regiones van en fracciones).
                nuevas = refinar_con_sam(hoja.imagen(DPI_SAM), nuevas, predictor_sam, avisos)
            salida.extend(nuevas)
    return salida


def deduplicar_vision(vectoriales: list[dict], de_vision: list[dict]) -> list[dict]:
    """Lo que la visión agrega sin repetir lo vectorial: fuera las regiones del mismo tipo y hoja con IoU ≥ 0.5 (con
    una vectorial o con otra de visión), los puestos cuyo centro cae en un puesto vectorial y cualquier lote de
    visión en una hoja que ya tiene lote (un solo lote por hoja; entre varios de visión, el de más confianza)."""
    from shapely.geometry import Point  # noqa: PLC0415

    salida: list[dict] = []
    for r in sorted(de_vision, key=lambda r: -r["confianza"]):
        mismos = [v for v in vectoriales + salida if v["pagina"] == r["pagina"] and v["tipo"] == r["tipo"]]
        if r["tipo"] == "lote" and mismos:
            continue
        if any(_iou(v["puntos"], r["puntos"]) >= IOU_VISION_REPETIDA for v in mismos):
            continue
        if r["tipo"] == "estacionamiento":
            p = _poligono_shapely(r["puntos"])
            if p is not None and any((q := _poligono_shapely(v["puntos"])) is not None and q.contains(Point(p.centroid))
                                     for v in mismos):
                continue
        salida.append(r)
    return salida


MODELO_SAM = "facebook/sam2.1-hiera-small"
#: Resolución de la hoja que se le da a SAM (la de la prueba de docs/regiones-medicion/prueba-sam.md).
DPI_SAM = 100


def predictor_sam(avisos: Optional[list[str]] = None):
    """Predictor de SAM 2.1: el de ONNX si `PRECHECK_SAM_ONNX` apunta al modelo (sin torch; ver `sam_onnx.py`), o el de
    `sam2` si está instalado y el modelo carga; si no, None (se omite sin error)."""
    if os.environ.get("PRECHECK_SAM_ONNX"):
        from precheck.planos.sam_onnx import predictor_onnx  # noqa: PLC0415

        return predictor_onnx(avisos)
    try:
        from sam2.sam2_image_predictor import SAM2ImagePredictor  # noqa: PLC0415
    except Exception:  # noqa: BLE001 — opcional
        return None
    try:
        return SAM2ImagePredictor.from_pretrained(os.environ.get("PRECHECK_SAM2_MODELO", MODELO_SAM))
    except Exception as e:  # noqa: BLE001 — sin modelo descargado o sin red: se omite
        if avisos is not None:
            avisos.append(f"SAM 2.1 instalado pero no se pudo cargar el modelo: {e}")
        return None


def mascara_a_puntos(mascara, ancho: int, alto: int, epsilon: float = 0.01) -> Optional[list[list[float]]]:
    """Contorno exterior más grande de una máscara binaria → polígono simplificado en fracciones (OpenCV)."""
    import cv2  # noqa: PLC0415
    import numpy as np  # noqa: PLC0415

    m = (np.asarray(mascara) > 0.5).astype("uint8")
    contornos, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contornos:
        return None
    c = max(contornos, key=cv2.contourArea)
    aprox = cv2.approxPolyDP(c, epsilon * cv2.arcLength(c, True), True).reshape(-1, 2)
    return puntos_validos([[float(x) / ancho, float(y) / alto] for x, y in aprox])


def refinar_con_sam(img, regiones: list[dict], predictor, avisos: Optional[list[str]] = None) -> list[dict]:
    """Ajusta cada región de visión a la máscara que SAM 2.1 da para su caja. Si la máscara no se parece a la caja
    (menos del 20 % o más del 150 % de su área), se deja la región como estaba."""
    import numpy as np  # noqa: PLC0415

    try:
        predictor.set_image(np.asarray(img.convert("RGB")))
    except Exception as e:  # noqa: BLE001
        if avisos is not None:
            avisos.append(f"SAM 2.1 no pudo procesar la imagen: {e}")
        return regiones
    ancho, alto = img.size
    salida = []
    for r in regiones:
        x0, y0, x1, y1 = _caja(r["puntos"])
        try:
            masks, _, _ = predictor.predict(box=np.array([x0 * ancho, y0 * alto, x1 * ancho, y1 * alto]), multimask_output=False)
            pts = mascara_a_puntos(masks[0], ancho, alto)
        except Exception:  # noqa: BLE001
            pts = None
        if pts is not None and 0.2 <= _area(pts) / max(_area(r["puntos"]), 1e-9) <= 1.5:
            r = {**r, "puntos": pts}
        salida.append(r)
    return salida


# ---------------------------------------------------------------------------------------------------------------
# Proponer: junta todo y escribe regiones.json y las imágenes.

def _paginas_relevantes(hojas: dict[int, Hoja], titulos: dict[int, str], regiones: list[dict]) -> list[int]:
    """Hojas de conjunto, localización o planta baja (y las que tienen el lote), las preferentes primero."""
    con_lote = {r["pagina"] for r in regiones if r["tipo"] == "lote"}

    def puntaje(n: int) -> tuple:
        t = titulos.get(n, "")
        return (not _PREFERENTE.search(t), n not in con_lote, not _RELEVANTE.search(t), n)

    relevantes = [n for n in hojas if n in con_lote or _RELEVANTE.search(titulos.get(n, ""))]
    return sorted(relevantes, key=puntaje) or ([min(hojas)] if hojas else [])


def _sin_tildes(s: str) -> str:
    from precheck.planos.extractores import _sin_tildes as st  # noqa: PLC0415

    return st(s)


def _valor_lote_json(lote: dict, ruta: str):
    nodo = lote
    for p in ruta.split("."):
        if not isinstance(nodo, dict) or p not in nodo:
            return None
        nodo = nodo[p]
    return nodo.get("valor") if isinstance(nodo, dict) and "valor" in nodo else nodo


def proponer(pdf: str | Path, salida: str | Path, vision: bool = False, extraccion: Optional[str | Path] = None,
             lote: Optional[str | Path] = None, ejecutar: Optional[Callable[[str, Path], str]] = None,
             sam=None, avisos: Optional[list[str]] = None) -> dict:
    """Propone las regiones del plano y escribe `regiones.json` y `r<N>.png` en `salida`. Devuelve el documento."""
    import pymupdf  # noqa: PLC0415

    salida = Path(salida)
    salida.mkdir(parents=True, exist_ok=True)
    avisos = avisos if avisos is not None else []
    ext = json.loads(Path(extraccion).read_text(encoding="utf-8")) if extraccion else None
    del_lote = json.loads(Path(lote).read_text(encoding="utf-8")) if lote else {}
    doc = pymupdf.open(pdf)
    try:
        return _proponer(doc, salida, vision, ext, Path(extraccion).parent if extraccion else None, del_lote,
                         ejecutar, sam, avisos)
    finally:
        doc.close()


def _proponer(doc, salida: Path, vision: bool, ext: Optional[dict], carpeta_ext: Optional[Path], del_lote: dict,
              ejecutar, sam, avisos: list[str]) -> dict:
    from precheck.planos import extractores as ex  # noqa: PLC0415
    from precheck.planos.lineas import es_escaneada, lineas_vectoriales  # noqa: PLC0415

    paginas_ext = {int(p["numero"]): p for p in (ext or {}).get("paginas", [])}
    hojas: dict[int, Hoja] = {}
    lineas, titulos = [], {}
    for n, pag in enumerate(doc, start=1):
        if es_escaneada(pag):
            pe = paginas_ext.get(n) or {}
            mini = carpeta_ext / pe["miniatura"] if carpeta_ext and pe.get("miniatura") else None
            hojas[n] = Hoja(pag, n, True, _giro_escaneada(pag, mini))
        else:
            hojas[n] = Hoja(pag, n, False)
            del_pagina = lineas_vectoriales(pag, n)
            lineas.extend(del_pagina)
            if n not in paginas_ext:
                paginas_ext[n] = {"numero": n, "lamina": ex.lamina(del_pagina, pag.rect.width, pag.rect.height)}
        titulos[n] = _sin_tildes((paginas_ext.get(n, {}).get("lamina") or {}).get("titulo") or "")
    # Área del lote: la declarada en lote.json prevalece; si no, la de la extracción (o la leída del texto vectorial).
    area = _valor_lote_json(del_lote, "lote.area_m2")
    if not isinstance(area, (int, float)) or area <= 0:
        if ext is not None:
            h = next((h for h in ext.get("hechos", []) if h.get("hecho") == "lote.area_m2"), {})
            area = h.get("valor") if h.get("estado") == "ok" else None
        else:
            h = ex.area_lote(lineas)
            area = h["valor"] if h["estado"] == "ok" else None
    if not isinstance(area, (int, float)) or area <= 0:
        area = area_escrita(lineas)   # «SUPERFICIE 31450.00 M2»
    nuevas, escalas, candidatos = propuesta_vectorial(doc, hojas, lineas, area, _escalas_lamina({"paginas": list(paginas_ext.values())}),
                                                      titulos, avisos)
    relevantes = _paginas_relevantes(hojas, titulos, nuevas)
    if vision:
        # Visión solo donde hace falta: hojas escaneadas o tipos sin propuesta vectorial en la hoja.
        paginas_v = relevantes[:MAX_PAGINAS_VISION]
        pedir = {n: tipos_para_vision(hojas[n], nuevas) for n in paginas_v}
        for n in paginas_v:
            if not pedir[n]:
                avisos.append(f"Visión, hoja {n}: no hace falta (todo lo que se pide ya tiene propuesta vectorial).")
        de_vision = propuesta_vision(hojas, paginas_v, candidatos, ejecutar,
                                     sam if sam is not None else predictor_sam(avisos), avisos, pedir)
        # Lo que la visión repite de lo vectorial sobra: el trazo del PDF es más preciso.
        nuevas += deduplicar_vision(nuevas, de_vision)
    # Conserva lo que la persona revisó, editó o dibujó; reemplaza lo automático.
    ruta = salida / "regiones.json"
    previas = json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else {}
    conservadas = [r for r in previas.get("regiones", []) if isinstance(r, dict) and es_conservada(r)]
    usados = {r["id"] for r in conservadas if r.get("id")}
    finales = list(conservadas)
    for r in nuevas:
        if any(c.get("pagina") == r["pagina"] and c.get("tipo") == r["tipo"] and isinstance(c.get("puntos"), list)
               and _iou(c["puntos"], r["puntos"]) > IOU_DUPLICADA for c in conservadas):
            continue
        r["id"] = _id(r["pagina"], r["tipo"], r["puntos"], usados)
        finales.append(r)
    con_imagen = sorted({r["pagina"] for r in finales if r.get("pagina") in hojas} | set(relevantes[:MAX_PAGINAS_VISION]))
    paginas = {}
    for n in con_imagen:
        hoja = hojas[n]
        img = hoja.imagen(DPI_REGIONES)
        img.save(salida / f"r{n}.png")
        escala = escalas.get(n) or _escalas_lamina({"paginas": [paginas_ext.get(n, {"numero": n})]}).get(n)
        if escala is None:
            escala = (previas.get("paginas") or {}).get(str(n), {}).get("escala")  # la que fijó la persona
        paginas[str(n)] = {"imagen": f"r{n}.png", "ancho_px": img.width, "alto_px": img.height,
                           "ancho_mm": round(hoja.ancho_pt / PT_POR_MM, 1), "alto_mm": round(hoja.alto_pt / PT_POR_MM, 1),
                           "escala": escala}
    resultado = {"version": VERSION, "generado": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "paginas": paginas, "regiones": finales}
    ruta.write_text(json.dumps(resultado, ensure_ascii=False, indent=1), encoding="utf-8")
    return resultado


# ---------------------------------------------------------------------------------------------------------------
# Contraste con lo declarado (lo usa la revisión).

#: (hecho declarado, clave en el resumen, tipo de comparación)
COMPARACIONES = (
    ("proyecto.estacionamientos", "estacionamiento", "conteo"),
    ("proyecto.retiro_posterior_m", "retiro_posterior_m", "medida"),
    ("proyecto.retiro_frontal_m", "retiro_frontal_m", "medida"),
    ("proyecto.ocupacion_pct", "ocupacion_pct", "medida"),
    ("lote.area_m2", "area_lote_m2", "medida"),
)
_FRENTE = ("acera", "retiro_frontal", "acceso_vehicular")


def _nodo(hechos: dict, ruta: str) -> dict:
    nodo = hechos
    for p in ruta.split("."):
        if not isinstance(nodo, dict) or p not in nodo:
            return {}
        nodo = nodo[p]
    return nodo if isinstance(nodo, dict) and "valor" in nodo else {"valor": nodo}


def _en_puntos(r: dict, pag: dict) -> list[tuple[float, float]]:
    """Fracciones → puntos de la hoja (las fracciones no son isótropas: x y y tienen escalas distintas)."""
    ancho, alto = pag["ancho_mm"] * PT_POR_MM, pag["alto_mm"] * PT_POR_MM
    return [(x * ancho, y * alto) for x, y in r["puntos"]]


def _medidas_pagina(n: str, pag: dict, regs: list[dict]) -> Optional[dict]:
    """Medidas de una hoja con lote y huella: ocupación, áreas y retiros frontal y posterior (estos solo si se sabe
    cuál es el frente o el fondo del lote)."""
    from shapely.geometry import LineString  # noqa: PLC0415
    from shapely.ops import unary_union  # noqa: PLC0415

    lotes = sorted((r for r in regs if r["tipo"] == "lote"), key=lambda r: -confianza_region(r))
    huellas = [r for r in regs if r["tipo"] == "huella"]
    if not lotes or not huellas:
        return None
    lote_r = lotes[0]
    lote_v = _en_puntos(lote_r, pag)
    lote_p = _poligono_shapely(lote_v)
    huella_p = unary_union([p for r in huellas if (p := _poligono_shapely(_en_puntos(r, pag))) is not None])
    if lote_p is None or huella_p.is_empty or lote_p.area <= 0:
        return None
    usadas = [lote_r, *huellas]
    escala = pag.get("escala")
    k = escala * me._PT_M if isinstance(escala, (int, float)) and escala > 0 else None
    lados = [LineString([lote_v[i], lote_v[(i + 1) % len(lote_v)]]) for i in range(len(lote_v))]
    notas = []

    def mas_cercano(tipos: tuple[str, ...]):
        indicadores = [(r, p) for r in regs if r["tipo"] in tipos and (p := _poligono_shapely(_en_puntos(r, pag))) is not None]
        if not indicadores:
            return None, None
        r, p = min(indicadores, key=lambda x: -confianza_region(x[0]))
        c = p.centroid
        return min(range(len(lados)), key=lambda i: lados[i].distance(c)), r

    frente, r_frente = mas_cercano(_FRENTE)
    fondo, r_fondo = mas_cercano(("retiro_posterior",))
    if fondo is None and frente is not None:
        f = lados[frente]
        dx, dy = f.coords[1][0] - f.coords[0][0], f.coords[1][1] - f.coords[0][1]

        def paralelo(i: int) -> bool:
            c = lados[i].coords
            ex_, ey = c[1][0] - c[0][0], c[1][1] - c[0][1]
            nf, ne = math.hypot(dx, dy), math.hypot(ex_, ey)
            return nf > 0 and ne > 0 and abs(dx * ex_ + dy * ey) / (nf * ne) > 0.7

        opuestos = [i for i in range(len(lados)) if i != frente and paralelo(i)] or [i for i in range(len(lados)) if i != frente]
        fondo = max(opuestos, key=lambda i: lados[i].centroid.distance(f.centroid)) if opuestos else None
        if fondo is not None:
            notas.append("Lado posterior: el opuesto al frente (" + r_frente["tipo"] + ").")
    elif fondo is not None:
        usadas.append(r_fondo)
        notas.append("Lado posterior: el lindero junto a la región de retiro posterior.")
    else:
        notas.append("Sin acera, acceso o retiros marcados no se sabe cuál es el frente: los retiros no se miden.")
    if r_frente is not None:
        usadas.append(r_frente)
    area_lote = lote_p.area
    medidas = {"ocupacion_pct": round(huella_p.area / area_lote * 100, 2),
               "area_lote_m2": round(area_lote * k * k, 2) if k else None,
               "area_huella_m2": round(huella_p.area * k * k, 2) if k else None,
               "retiro_frontal_m": round(huella_p.distance(lados[frente]) * k, 2) if k and frente is not None else None,
               "retiro_posterior_m": round(huella_p.distance(lados[fondo]) * k, 2) if k and fondo is not None else None}
    if not k:
        notas.append("Sin escala conocida en la hoja: solo la ocupación (proporción), sin medidas en metros.")
    confianza = min(confianza_region(r) for r in usadas)
    # La huella automática (por ambientes rotulados) puede dejar fuera área techada sin rótulo (estacionamiento bajo
    # la torre, circulaciones): lo que se deriva de ella (ocupación, área de huella, retiros) es evidencia débil.
    automatica = any(not es_conservada(r) for r in huellas)
    conf_huella = min(confianza, CONFIANZA_HUELLA_AUTOMATICA) if automatica else confianza
    detalles = {}
    if automatica:
        notas.append(DETALLE_HUELLA_AUTOMATICA)
        detalles = {c: DETALLE_HUELLA_AUTOMATICA for c in DERIVADAS_DE_HUELLA if medidas.get(c) is not None}
    return {"pagina": int(n), "medidas": medidas, "confianza": confianza, "notas": notas,
            "confianza_medidas": {c: (conf_huella if c in DERIVADAS_DE_HUELLA else confianza)
                                  for c, v in medidas.items() if v is not None},
            "detalles": detalles}


#: Medidas que salen de la huella y su confianza si la huella es automática y nadie la confirmó ni editó.
DERIVADAS_DE_HUELLA = ("ocupacion_pct", "area_huella_m2", "retiro_frontal_m", "retiro_posterior_m")
CONFIANZA_HUELLA_AUTOMATICA = 0.5
DETALLE_HUELLA_AUTOMATICA = ("Huella automática por ambientes rotulados, sin confirmar: puede faltar área techada sin "
                             "rótulo (la ocupación sale menor y los retiros mayores).")


_PLAZA_NUMERADA = re.compile(r"^Plaza (\d{1,4})$")


def nota_numeracion(regs: list[dict]) -> Optional[str]:
    """Si las plazas propuestas llevan el número del plano («Plaza N») y el número más alto no es el conteo, lo dice y
    nombra los números que no tienen plaza: el último número rotulado no es la cantidad de plazas."""
    por_pagina: dict[str, list[int]] = {}
    for r in regs:
        m = _PLAZA_NUMERADA.match(str(r.get("etiqueta") or "").strip()) if r.get("tipo") == "estacionamiento" else None
        if m:
            por_pagina.setdefault(str(r.get("pagina")), []).append(int(m.group(1)))
    if not por_pagina:
        return None
    pag, nums = max(por_pagina.items(), key=lambda kv: len(kv[1]))
    unicos = set(nums)
    faltan = [n for n in range(1, max(unicos) + 1) if n not in unicos]
    if not faltan:
        return None
    lista = ", ".join(map(str, faltan[:20])) + (f" y {len(faltan) - 20} más" if len(faltan) > 20 else "")
    return (f"Página {pag}: las plazas propuestas van numeradas hasta el {max(unicos)}, pero son {len(unicos)}; "
            f"no hay plaza con los números {lista}. El último número rotulado no es la cantidad de plazas: busque esos "
            f"números en la lámina. Si no están rotulados, la numeración tiene huecos; si están, falta dibujar esa plaza.")


def contrastar(regiones: dict, hechos: dict) -> dict:
    """Conteos, tipos presentes y medidas derivados de las regiones, y discrepancias contra lo declarado o confirmado
    (conteos: distintos; medidas: más del 10 %). Las medidas en metros solo con la escala de la hoja."""
    paginas = regiones.get("paginas") or {}
    regs = [r for r in regiones.get("regiones") or []
            if isinstance(r, dict) and r.get("tipo") in TIPOS and puntos_validos(r.get("puntos")) is not None]
    por_pagina: dict[str, dict[str, int]] = {}
    conf_tipo: dict[str, float] = {}
    for r in regs:
        por_pagina.setdefault(r["tipo"], {})
        p = str(r.get("pagina"))
        por_pagina[r["tipo"]][p] = por_pagina[r["tipo"]].get(p, 0) + 1
        conf_tipo[r["tipo"]] = min(conf_tipo.get(r["tipo"], 1.0), confianza_region(r))
    # Un mismo conjunto suele dibujarse en varias láminas: el conteo es el de la lámina con más regiones de ese tipo.
    conteos = {t: max(v.values()) for t, v in sorted(por_pagina.items())}
    medidas: dict = {"retiro_posterior_m": None, "retiro_frontal_m": None, "ocupacion_pct": None,
                     "area_lote_m2": None, "area_huella_m2": None}
    origen_medidas = None
    try:
        hojas = []
        for n, pag in paginas.items():
            if not isinstance(pag, dict) or not pag.get("ancho_mm") or not pag.get("alto_mm"):
                continue
            m = _medidas_pagina(n, pag, [r for r in regs if str(r.get("pagina")) == str(n)])
            if m:
                hojas.append(m)
        if hojas:
            # La hoja con más medidas en metros y, a igualdad, con más confianza.
            origen_medidas = max(hojas, key=lambda h: (sum(v is not None for v in h["medidas"].values()), h["confianza"]))
            medidas = origen_medidas["medidas"]
    except ImportError:  # pragma: no cover — sin shapely no hay medidas
        pass
    conf = {f"conteo.{t}": c for t, c in conf_tipo.items()}
    if origen_medidas:
        conf.update(origen_medidas["confianza_medidas"])
    discrepancias = []
    for dato, clave, forma in COMPARACIONES:
        nodo = _nodo(hechos, dato)
        declarado = nodo.get("valor")
        if not isinstance(declarado, (int, float)) or isinstance(declarado, bool):
            continue
        dibujado = conteos.get(clave) if forma == "conteo" else medidas.get(clave)
        if dibujado is None:
            continue
        metodo = (nodo.get("fuente") or {}).get("metodo") if isinstance(nodo.get("fuente"), dict) else None
        if forma == "conteo":
            if int(round(declarado)) == dibujado:
                continue
            pag = max(por_pagina[clave], key=lambda p: por_pagina[clave][p])
            mensaje = (f"Se declararon {declarado:g} estacionamientos y en las regiones de la lámina {pag} se dibujan "
                       f"{dibujado} (máximo por lámina; si hay estacionamientos en varios niveles, súmelos). Verifíquelo.")
        else:
            if abs(dibujado - declarado) <= TOL_MEDIDA * max(abs(declarado), 1e-9):
                continue
            mensaje = (f"{dato} declarado {declarado:g} y medido en las regiones {dibujado:g} "
                       f"(diferencia mayor que el {TOL_MEDIDA:.0%}; página {origen_medidas['pagina']}). Verifíquelo.")
            if clave in origen_medidas["detalles"]:
                mensaje += " " + origen_medidas["detalles"][clave]
        discrepancias.append({"dato": dato, "declarado": declarado, "dibujado": dibujado,
                              "confianza": conf.get(f"conteo.{clave}" if forma == "conteo" else clave),
                              **({"metodo_declarado": metodo} if metodo else {}), "mensaje": mensaje})
    notas = list(origen_medidas["notas"]) if origen_medidas else []
    numeracion = nota_numeracion(regs)
    if numeracion:
        notas.append(numeracion)
    return {"conteos": conteos, "presentes": sorted(conteos), "medidas": medidas, "discrepancias": discrepancias,
            "conteos_por_pagina": por_pagina, "confianza": conf,
            "pagina_medidas": origen_medidas["pagina"] if origen_medidas else None,
            "notas": notas,
            "detalles": origen_medidas["detalles"] if origen_medidas else {}}


# ---------------------------------------------------------------------------------------------------------------
# CLI.

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m precheck.planos.regiones", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="orden", required=True)
    p = sub.add_parser("proponer", help="propone regiones y escribe regiones.json y r<N>.png")
    p.add_argument("--pdf", required=True)
    p.add_argument("--salida", required=True)
    p.add_argument("--vision", action="store_true", help="usa el modelo de visión (--modelo) y SAM 2.1 si está instalado")
    p.add_argument("--extraccion", help="extraccion.json del plano (área del lote, escalas y títulos)")
    p.add_argument("--lote", help="lote.json con datos declarados (lote.area_m2 prevalece sobre el plano)")
    p.add_argument("--modelo", default="sonnet",
                   help="modelo para --vision: alias o id de Claude (claude -p; por defecto sonnet) o deepseek-flash (API)")
    p.add_argument("--gasto", help="carpeta de deepseek_gasto.json (por defecto web/.data)")
    r = sub.add_parser("resumen", help="contrasta las regiones con lo declarado e imprime JSON")
    r.add_argument("--regiones", required=True)
    r.add_argument("--lote", help="lote.json (hechos declarados o confirmados)")
    a = ap.parse_args(argv)
    try:
        if a.orden == "resumen":
            regiones = json.loads(Path(a.regiones).read_text(encoding="utf-8"))
            hechos = json.loads(Path(a.lote).read_text(encoding="utf-8")) if a.lote else {}
            print(json.dumps(contrastar(regiones, hechos), ensure_ascii=False, indent=1))
            return 0
        avisos: list[str] = []
        ejecutar = ejecutor_vision(a.modelo, Path(a.gasto) if a.gasto else None) if a.vision else None
        doc = proponer(a.pdf, a.salida, a.vision, a.extraccion, a.lote, ejecutar=ejecutar, avisos=avisos)
    except Exception as e:  # noqa: BLE001 — la CLI informa y sale con código distinto de 0
        print(f"No se pudieron proponer las regiones: {e}", file=sys.stderr)
        return 1
    for aviso in avisos:
        print(f"Aviso: {aviso}", file=sys.stderr)
    cuenta: dict[str, int] = {}
    for reg in doc["regiones"]:
        cuenta[reg["tipo"]] = cuenta.get(reg["tipo"], 0) + 1
    print(f"{len(doc['regiones'])} regiones ({', '.join(f'{t} {c}' for t, c in sorted(cuenta.items())) or 'ninguna'}) "
          f"-> {Path(a.salida) / 'regiones.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
