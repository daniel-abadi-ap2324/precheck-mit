#!/usr/bin/env python3
"""Reglas del catálogo que son la misma regla repetida por unidad territorial (UT).

En San Francisco (Acuerdo 270) cada sector y cada unidad territorial tiene sus propias reglas aunque muchas sean idénticas
(p. ej. «ZM7: altura máxima en pisos» está 12 veces, una por UT con ZM7). Al comparar corridas que asumieron UT distintas,
la misma regla salía como filas separadas («no aplica» en una corrida y decidida en otra). Este script agrupa las reglas
cuyo id es «<prefijo>-<sector>-UT<n>-<resto>» y cuyo contenido es idéntico (condición, tipo, severidad, entradas, unidad,
tolerancia; y la cita de la norma si la regla no tiene condición) y escribe `web/src/features/compare/lib/equivalencias-reglas.json`: {id de la regla: id del grupo}.
Los grupos con una sola regla, o con contenido distinto entre UT (p. ej. los usos prohibidos), no se agrupan.

Uso: python scripts/equivalencias_reglas.py [--reglas reglas] [--salida <json>]   (--comprobar: no escribe, falla si el JSON no está al día)
"""
import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "web" / "src" / "features" / "compare" / "lib" / "equivalencias-reglas.json"
PATRON = re.compile(r"^([A-Z0-9]+)-(.+?)-UT(\d+)-(.+)$")
CAMPOS = ("condicion", "tipo", "severidad", "entradas", "unidad", "tolerancia")


def firma(regla: dict) -> str:
    # La cita de la norma cuenta: dos reglas con la misma condición pero distinta cita (p. ej. los usos prohibidos de cada UT)
    # no son la misma regla.
    # En una regla computable la obligación es su condición: la cita puede llevar el rótulo de la UT y no la distingue.
    base = {k: regla.get(k) for k in CAMPOS}
    if not regla.get("condicion"):
        base["cita"] = re.sub(r"\s+", " ", str((regla.get("fuente") or {}).get("cita_textual") or "")).strip()
    return json.dumps(base, ensure_ascii=False, sort_keys=True)


def equivalencias(carpeta: Path) -> dict:
    grupos = defaultdict(list)  # (prefijo, resto, firma) -> [ids]
    for f in sorted(carpeta.glob("*.json")):
        catalogo = json.loads(f.read_text(encoding="utf8"))
        if not isinstance(catalogo, list):
            continue
        for r in catalogo:
            m = PATRON.match(str(r.get("id", "")))
            if m:
                grupos[(m.group(1), m.group(4), firma(r))].append(r["id"])
    # Si un mismo «resto» tiene varias firmas, cada una es un grupo aparte (se numera).
    por_resto = defaultdict(list)
    for (pre, resto, fir), ids in grupos.items():
        por_resto[(pre, resto)].append((fir, ids))
    salida = {}
    for (pre, resto), lista in sorted(por_resto.items()):
        lista.sort(key=lambda x: -len(x[1]))
        for n, (_fir, ids) in enumerate(lista):
            if len(ids) < 2:
                continue
            gid = f"{pre}-UT*-{resto}" + ("" if n == 0 else f"~{n + 1}")
            for i in ids:
                salida[i] = gid
    return dict(sorted(salida.items()))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--reglas", default=str(RAIZ / "reglas"))
    ap.add_argument("--salida", default=str(SALIDA))
    ap.add_argument("--comprobar", action="store_true")
    a = ap.parse_args(argv)
    eq = equivalencias(Path(a.reglas))
    texto = json.dumps(eq, ensure_ascii=False, indent=1) + "\n"
    ruta = Path(a.salida)
    if a.comprobar:
        ok = ruta.exists() and ruta.read_text(encoding="utf8").replace("\r\n", "\n") == texto
        print("al día" if ok else "DESACTUALIZADO: ejecute scripts/equivalencias_reglas.py")
        return 0 if ok else 1
    ruta.write_text(texto, encoding="utf8", newline="\n")
    grupos = len(set(eq.values()))
    print(f"{len(eq)} reglas en {grupos} grupos -> {ruta}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
