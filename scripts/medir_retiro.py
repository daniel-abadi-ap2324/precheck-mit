#!/usr/bin/env python3
"""Retiro posterior medido sobre las regiones del plano, para el dato `proyecto.retiro_posterior_m`.

Es el dato en que más fallan todos los modelos: copian la cota del retiro mínimo o de la línea de construcción
dibujada junto al lindero en vez de medir la pared. Esta medida es determinista: toma el lote y la huella de
`regiones.json` (polígonos en fracciones 0–1 de la hoja), los pasa a puntos con el tamaño de la hoja y mide, a la
escala de la lámina, la distancia mínima de la huella a cada lado del lote. El frente es el lado que da a la calle:
una región de acera, acceso vehicular o retiro frontal, o un rótulo de calle o acera del texto del PDF junto al lado
(«CALLE …», «AVENIDA …», «ACERA …», sin los internos) y paralelo a él. El posterior es el opuesto al frente (paralelo y
más lejano), o el lindero junto a una región de retiro posterior si la hay.

`retiro_posterior_m` solo sale cuando el frente es inequívoco: un solo frente, o un lote de esquina en que los dos
candidatos a posterior dan lo mismo (±0.10 m). Si no, es null y van las distancias por lado para que quien revisa (o
la IA, con el criterio de scripts/datos_universales.json) decida. Si hay varias láminas con lote y huella, el valor es
el mínimo entre las que dan uno (el retiro se mide en cualquier nivel); pero basta una lámina con frente ambiguo
(esquina con candidatos distintos) para que el valor sea null, aunque otra lámina dé uno. Sin regiones de lote y
huella, lo dice y no inventa nada.

Escala, por orden: la de la hoja en `regiones.json` (`paginas[n].escala`), la de la lámina en `extraccion.json`
(`paginas[].lamina.escala`) o la implícita en el área del lote escrita (`lote.area_m2`) frente al área del polígono;
esta última es aproximada y se marca.

Límites: la huella automática («Ambientes rotulados») sigue la cara interior de los muros y puede dejar fuera área
techada sin rótulo (un podio de estacionamientos), así que sus distancias son cotas superiores: la pared real queda
0.1–0.3 m más cerca del lindero, y un cuerpo sin rótulo no se ve. Sin el PDF no hay rótulos de calle: solo las regiones
dicen cuál es el frente.

Uso:
  python scripts/medir_retiro.py <carpeta del caso> [--pdf original.pdf] [--regiones regiones.json]
La carpeta puede ser la del plano (`original.pdf`, `extraccion.json`, `regiones.json`) o la de un precheck: si allí
faltan, se buscan en `../../planos/<planId>/` según `estado.json`. Imprime un JSON (ver `medir`).
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Optional

RAIZ = Path(__file__).resolve().parent.parent
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

from precheck.planos import detectores as de  # noqa: E402
from precheck.planos import medicion as me  # noqa: E402
from precheck.planos import regiones as rg  # noqa: E402

DATO = "proyecto.retiro_posterior_m"
PT_POR_MM = 72 / 25.4
#: Regiones que marcan el frente (las mismas que usa regiones.contrastar) y el fondo.
TIPOS_FRENTE = ("acera", "retiro_frontal", "acceso_vehicular")
TIPOS_POSTERIOR = ("retiro_posterior",)
#: Un rótulo de calle o acera marca un lado si está a menos de DIST_ROTULO_PT (pt) de la recta del lado, con su pie
#: dentro del lado, fuera del lote y escrito paralelo al lado. La regla vive en `detectores` (la usa también la huella
#: de un podio sin rótulos, que no debe acercarse al frente).
DIST_ROTULO_PT, MARGEN_PIE, PARALELO_ROTULO = de.DIST_ROTULO_PT, de.MARGEN_PIE, de.PARALELO_ROTULO
#: Dos lados son opuestos si son paralelos así (|cos|); el posterior es el paralelo más lejano al frente.
PARALELO_OPUESTO = 0.70
#: En un lote de esquina, los candidatos a posterior coinciden si difieren menos de esto (m).
TOL_ESQUINA_M = 0.10
#: Por debajo de esto (m) la huella toca el lindero: adosado, 0.
ADOSADO_M = 0.05


class Rotulo:
    """Fragmento de texto de la hoja en puntos como se lee: centro y dirección de escritura (unitaria)."""

    def __init__(self, texto: str, x: float, y: float, dx: float = 1.0, dy: float = 0.0):
        self.texto, self.x, self.y, self.dx, self.dy = texto, x, y, dx, dy

    def __repr__(self) -> str:
        return f"Rotulo({self.texto!r}, {self.x:.1f}, {self.y:.1f}, {self.dx:.2f}, {self.dy:.2f})"


# ---------------------------------------------------------------------------------------------------------------
# Geometría (puntos de la hoja como se lee; x a la derecha, y hacia abajo).

def en_puntos(puntos: list, ancho_mm: float, alto_mm: float) -> list[tuple[float, float]]:
    """Fracciones 0–1 → puntos de la hoja (las fracciones no son isótropas: cada eje tiene su escala)."""
    return [(float(x) * ancho_mm * PT_POR_MM, float(y) * alto_mm * PT_POR_MM) for x, y in puntos]


def _poligono(puntos):
    from shapely.geometry import Polygon  # noqa: PLC0415

    try:
        p = Polygon(puntos)
    except Exception:  # noqa: BLE001
        return None
    if not p.is_valid:
        p = p.buffer(0)
    return None if p.is_empty or p.area <= 0 else p


def _lados(lote: list[tuple[float, float]]):
    from shapely.geometry import LineString  # noqa: PLC0415

    return [LineString([lote[i], lote[(i + 1) % len(lote)]]) for i in range(len(lote))]


_direccion = de.direccion_lado


def _paralelos(a, b) -> float:
    ua, ub = _direccion(a), _direccion(b)
    return abs(ua[0] * ub[0] + ua[1] * ub[1])


def opuesto(lados: list, frente: int) -> Optional[int]:
    """El lado opuesto al frente: entre los paralelos (|cos| > PARALELO_OPUESTO), el más lejano; si no hay paralelos,
    el más lejano de todos. Misma regla que regiones._medidas_pagina."""
    otros = [i for i in range(len(lados)) if i != frente]
    if not otros:
        return None
    paralelos = [i for i in otros if _paralelos(lados[i], lados[frente]) > PARALELO_OPUESTO]
    c = lados[frente].centroid
    return max(paralelos or otros, key=lambda i: lados[i].centroid.distance(c))


#: Rótulos de calle o acera (sin los internos) y los que marcan un lado como frente: ver `detectores`.
rotulos_de_calle = de.rotulos_de_calle
rotulos_junto_al_lado = de.rotulos_junto_al_lado


def _lado_mas_cercano(lados: list, geom) -> int:
    c = geom.centroid
    return min(range(len(lados)), key=lambda i: lados[i].distance(c))


def medir_pagina(lote: list[tuple[float, float]], huellas: list[list[tuple[float, float]]], escala: Optional[float],
                 rotulos: Optional[list[Rotulo]] = None, regiones_frente: Optional[list[list[tuple[float, float]]]] = None,
                 regiones_posterior: Optional[list[list[tuple[float, float]]]] = None) -> Optional[dict]:
    """Distancias de la huella a cada lado del lote, frente y candidato a posterior de una hoja (todo en puntos de la
    hoja; `escala` es el denominador, p. ej. 200, o None para dar solo puntos). None si no hay lote ni huella válidos."""
    from shapely.ops import unary_union  # noqa: PLC0415

    lote_p = _poligono(lote)
    hu = [p for h in huellas if (p := _poligono(h)) is not None and lote_p is not None and p.intersects(lote_p)]
    if lote_p is None or not hu:
        return None
    huella = unary_union(hu)
    lados = _lados(lote)
    k = escala * me._PT_M if escala else None
    calle = rotulos_de_calle(rotulos or [])
    frentes: dict[int, list[str]] = {}
    for v in regiones_frente or []:
        p = _poligono(v)
        if p is not None:
            frentes.setdefault(_lado_mas_cercano(lados, p), []).append("región de frente (acera, acceso o retiro frontal)")
    for i, lado in enumerate(lados):
        for t in rotulos_junto_al_lado(lado, lote_p, calle):
            frentes.setdefault(i, []).append(f"rótulo «{t}»")
    posteriores: dict[int, str] = {}
    for v in regiones_posterior or []:
        p = _poligono(v)
        if p is not None:
            posteriores[_lado_mas_cercano(lados, p)] = "región de retiro posterior junto al lindero"
    if not posteriores:
        for f in sorted(frentes):
            o = opuesto(lados, f)
            if o is not None and o not in posteriores:
                posteriores[o] = f"opuesto al frente (lado {f})"
    salida_lados = []
    for i, lado in enumerate(lados):
        d_pt = huella.distance(lado)
        d_m = round(d_pt * k, 2) if k else None
        salida_lados.append({"lado": i, "largo_m": round(lado.length * k, 2) if k else None,
                             "distancia_m": d_m, "distancia_pt": round(d_pt, 1),
                             "adosado": bool(d_m is not None and d_m <= ADOSADO_M),
                             "frente": i in frentes, "evidencia_frente": frentes.get(i, []),
                             "posterior": i in posteriores, "evidencia_posterior": posteriores.get(i)})
    candidatos = [{"lado": i, "distancia_m": salida_lados[i]["distancia_m"], "por": posteriores[i]} for i in sorted(posteriores)]
    valor, motivo = None, ""
    if not candidatos:
        motivo = ("frente no determinable: sin regiones de acera, acceso o retiro frontal ni rótulos de calle junto a "
                  "un lado" + ("" if rotulos else " (sin el texto del PDF)"))
    elif k is None:
        motivo = "sin escala conocida en la hoja: distancias solo en puntos"
    else:
        dists = [c["distancia_m"] for c in candidatos]
        if max(dists) - min(dists) <= TOL_ESQUINA_M:
            valor = min(dists)
            motivo = ("un solo candidato a posterior" if len(candidatos) == 1 else
                      f"lote de esquina: los {len(candidatos)} candidatos a posterior dan lo mismo (±{TOL_ESQUINA_M} m)")
        else:
            motivo = (f"lote de esquina o frente ambiguo: {len(candidatos)} candidatos a posterior con distancias "
                      f"distintas ({', '.join(f'lado {c['lado']}: {c['distancia_m']} m' for c in candidatos)})")
    return {"lados": salida_lados, "frente": sorted(frentes), "candidatos_posterior": candidatos,
            "retiro_posterior_m": valor, "motivo": motivo, "n_huellas": len(hu)}


# ---------------------------------------------------------------------------------------------------------------
# Lectura del caso.

def rotulos_pdf(pagina) -> list[Rotulo]:
    """Fragmentos de texto de la página con su centro y dirección de escritura, en puntos como se lee."""
    return [Rotulo(p.texto, p.x, p.y, p.dx, p.dy) for p in de.palabras(pagina)]


def _plan_hermano(carpeta: Path) -> Optional[Path]:
    """Carpeta del plano (`../../planos/<planId>/`) que referencia el estado.json de un precheck, si existe."""
    estado = carpeta / "estado.json"
    if not estado.exists():
        return None
    try:
        ids = json.loads(estado.read_text(encoding="utf-8")).get("planIds") or []
    except (OSError, ValueError):
        return None
    for pid in ids:
        if isinstance(pid, str):
            p = carpeta.parent.parent / "planos" / pid
            if p.is_dir():
                return p
    return None


def _buscar(carpeta: Path, nombre: str, explicito: Optional[str]) -> Optional[Path]:
    if explicito:
        return Path(explicito)
    if (carpeta / nombre).exists():
        return carpeta / nombre
    hermano = _plan_hermano(carpeta)
    return hermano / nombre if hermano and (hermano / nombre).exists() else None


def _area_lote(ext: Optional[dict]) -> Optional[float]:
    for h in (ext or {}).get("hechos", []) or []:
        if h.get("hecho") == "lote.area_m2" and h.get("estado") == "ok" and isinstance(h.get("valor"), (int, float)):
            return float(h["valor"])
    return None


def escala_de_hoja(n: str, pag: dict, ext: Optional[dict], lote_area_pt2: float) -> tuple[Optional[float], str]:
    """(denominador, origen): la de la hoja en regiones.json, la de la lámina en extraccion.json o la implícita en el
    área escrita del lote (aproximada)."""
    esc = pag.get("escala")
    if isinstance(esc, (int, float)) and esc > 0:
        return float(esc), "regiones.json (escala de la hoja)"
    esc = rg._escalas_lamina(ext).get(int(n))
    if esc:
        return float(esc), "extraccion.json (escala de la lámina)"
    area = _area_lote(ext)
    if area and lote_area_pt2 > 0:
        implicita = math.sqrt(area / lote_area_pt2) / me._PT_M
        estandar = any(abs(implicita - e) / e <= rg.TOL_ESCALA_POR_AREA for e in me.ESCALAS_ESTANDAR)
        return (round(implicita, 1),
                f"implícita en el área escrita del lote ({area:,.2f} m²): aproximada" + ("" if estandar else ", no estándar"))
    return None, "sin escala: ni en regiones.json, ni en la lámina, ni área del lote escrita"


def medir(carpeta: str | Path, pdf: Optional[str] = None, regiones: Optional[str] = None) -> dict:
    carpeta = Path(carpeta)
    ruta_reg = _buscar(carpeta, "regiones.json", regiones)
    ruta_pdf = _buscar(carpeta, "original.pdf", pdf)
    ruta_ext = _buscar(carpeta, "extraccion.json", None)
    fuentes = {"regiones": str(ruta_reg) if ruta_reg else None, "pdf": str(ruta_pdf) if ruta_pdf else None,
               "extraccion": str(ruta_ext) if ruta_ext else None}
    base = {"dato": DATO, "retiro_posterior_m": None, "fuentes": fuentes,
            "metodo": "distancia mínima de la huella a cada lado del lote en regiones.json, a la escala de la hoja; "
                      "frente por regiones de acera/acceso/retiro frontal o rótulos de calle del PDF; posterior = "
                      "opuesto al frente (scripts/medir_retiro.py)"}
    if ruta_reg is None:
        return {**base, "resultado": "sin regiones.json: no hay lote ni huella que medir (proponga las regiones primero)",
                "paginas": []}
    reg = json.loads(ruta_reg.read_text(encoding="utf-8"))
    ext = json.loads(ruta_ext.read_text(encoding="utf-8")) if ruta_ext else None
    regs = [r for r in reg.get("regiones") or []
            if isinstance(r, dict) and r.get("tipo") in rg.TIPOS and rg.puntos_validos(r.get("puntos")) is not None]
    doc = None
    if ruta_pdf:
        try:
            import pymupdf  # noqa: PLC0415

            doc = pymupdf.open(str(ruta_pdf))
        except Exception as e:  # noqa: BLE001
            fuentes["pdf"] = None
            base["aviso_pdf"] = f"no se pudo abrir el PDF: {e}"
    paginas = []
    try:
        for n, pag in sorted((reg.get("paginas") or {}).items(), key=lambda kv: int(kv[0])):
            if not isinstance(pag, dict) or not pag.get("ancho_mm") or not pag.get("alto_mm"):
                continue
            de_pagina = [r for r in regs if str(r.get("pagina")) == str(n)]
            lotes = sorted((r for r in de_pagina if r["tipo"] == "lote"), key=lambda r: -rg.confianza_region(r))
            huellas = [r for r in de_pagina if r["tipo"] == "huella"]
            if not lotes or not huellas:
                paginas.append({"pagina": int(n), "medida": None,
                                "motivo": f"sin {'lote' if not lotes else 'huella'} en la hoja ({len(lotes)} lote, {len(huellas)} huella)"})
                continue
            lote_r = lotes[0]
            pts = lambda r: en_puntos(r["puntos"], pag["ancho_mm"], pag["alto_mm"])  # noqa: E731
            lote_v = pts(lote_r)
            lote_p = _poligono(lote_v)
            escala, origen = escala_de_hoja(n, pag, ext, lote_p.area if lote_p else 0.0)
            rotulos = rotulos_pdf(doc[int(n) - 1]) if doc is not None and int(n) <= len(doc) else None
            m = medir_pagina(lote_v, [pts(r) for r in huellas], escala, rotulos,
                             [pts(r) for r in de_pagina if r["tipo"] in TIPOS_FRENTE],
                             [pts(r) for r in de_pagina if r["tipo"] in TIPOS_POSTERIOR])
            if m is None:
                paginas.append({"pagina": int(n), "medida": None, "motivo": "lote o huella sin área, o huella fuera del lote"})
                continue
            automatica = any(not rg.es_conservada(r) for r in huellas)
            notas = []
            if automatica:
                notas.append("Huella automática sin confirmar: sigue la cara interior de los muros y puede faltar área "
                             "techada sin rótulo; las distancias son cotas superiores (la pared real puede estar 0.1–0.3 m "
                             "más cerca).")
            if rotulos is None:
                notas.append("Sin el PDF: el frente solo por regiones (no se leyeron rótulos de calle).")
            if escala and "aproximada" in origen:
                notas.append("Escala aproximada: compruébela con una cota impresa antes de fiarse del valor.")
            paginas.append({"pagina": int(n), "escala": escala, "escala_origen": origen,
                            "lote": {"id": lote_r.get("id"), "etiqueta": lote_r.get("etiqueta", ""), "lados": len(lote_v),
                                     "confianza": rg.confianza_region(lote_r)},
                            "huella": {"regiones": m.pop("n_huellas"), "automatica": automatica},
                            "medida": m, "notas": notas})
    finally:
        if doc is not None:
            doc.close()
    con_valor = [p for p in paginas if p.get("medida") and p["medida"]["retiro_posterior_m"] is not None]
    ambiguas = [p for p in paginas if p.get("medida") and p["medida"]["retiro_posterior_m"] is None
                and p["medida"]["candidatos_posterior"] and p.get("escala")]
    sin_frente = [p for p in paginas if p.get("medida") and not p["medida"]["candidatos_posterior"]]
    valor, resultado = None, ""
    if not any(p.get("medida") for p in paginas):
        resultado = "ninguna hoja tiene lote y huella en regiones.json: no se mide (revise o dibuje las regiones)"
    elif ambiguas:
        resultado = ("frente ambiguo: " + "; ".join(f"hoja {p['pagina']}: {p['medida']['motivo']}" for p in ambiguas)
                     + ". Decida con las distancias por lado.")
    elif con_valor:
        mejor = min(con_valor, key=lambda p: p["medida"]["retiro_posterior_m"])
        valor = mejor["medida"]["retiro_posterior_m"]
        lado = next(c for c in mejor["medida"]["candidatos_posterior"] if c["distancia_m"] == valor)
        resultado = (f"{valor} m: lado {lado['lado']} del lote en la hoja {mejor['pagina']} ({lado['por']}), a 1:{mejor['escala']:g}"
                     + (f"; mínimo entre {len(con_valor)} hojas" if len(con_valor) > 1 else ""))
        if mejor["huella"]["automatica"]:
            resultado += "; huella automática (cota superior)"
    elif sin_frente:
        resultado = "frente no determinable en ninguna hoja: " + "; ".join(
            f"hoja {p['pagina']}: {p['medida']['motivo']}" for p in sin_frente) + ". Decida con las distancias por lado."
    else:
        resultado = "sin escala en las hojas con lote y huella: distancias solo en puntos"
    return {**base, "retiro_posterior_m": valor, "resultado": resultado, "paginas": paginas}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Retiro posterior medido sobre las regiones (lote y huella) del plano.")
    ap.add_argument("carpeta", help="carpeta del plano o del precheck (regiones.json, original.pdf, extraccion.json)")
    ap.add_argument("--pdf", help="PDF del plano, si no está en la carpeta (para leer los rótulos de calle)")
    ap.add_argument("--regiones", help="regiones.json, si no está en la carpeta (p. ej. una propuesta aparte)")
    a = ap.parse_args(argv)
    print(json.dumps(medir(a.carpeta, a.pdf, a.regiones), ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
