#!/usr/bin/env python3
"""Cuántos resultados del motor caen en cada etiqueta de la web según la severidad y la subsanación del catálogo.

Replica segunRegla de web/src/server/expedientes/traductor.ts con ADR-0017: un NO_CUMPLE de severidad «observacion»
es «Observación»; uno bloqueante se etiqueta por su subsanación («falta en el plano», «requiere documento», «decide la
DOYC» o «No cumple» a secas). Sin subsanación (catálogo anterior) vale lo de antes: documental = falta en el plano.

La severidad y la subsanación se toman del catálogo indicado (--reglas), no de resultado.json: así se comparan dos
catálogos sobre las mismas corridas sin volver a evaluar, porque el resultado del motor (CUMPLE, NO_CUMPLE…) no
depende de la severidad. No cambia nada.

Uso: python scripts/analisis/contar_por_subsanacion.py --datos DIR [--reglas reglas] [--reglas-antes DIR]
"""
from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
ETIQUETAS = ("No cumple", "No cumple · falta en el plano", "No cumple · requiere documento",
             "No cumple · decide la DOYC", "Observación", "Requiere revisión", "Cumple", "No aplica")
POR_SUBSANACION = {"plano": "No cumple · falta en el plano", "documento": "No cumple · requiere documento",
                   "autoridad": "No cumple · decide la DOYC"}


def leer(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None


def catalogo(d: Path) -> dict:
    return {r["id"]: r for p in sorted(d.glob("*.json")) for r in (leer(p) or [])}


def etiqueta(resultado: str, regla: dict | None) -> str:
    if resultado == "CUMPLE":
        return "Cumple"
    if resultado == "NO_APLICA":
        return "No aplica"
    if resultado != "NO_CUMPLE":
        return "Requiere revisión"
    regla = regla or {}
    if regla.get("severidad") == "observacion":
        return "Observación"
    sub = regla.get("subsanacion")
    if sub is None:
        return "No cumple · falta en el plano" if regla.get("tipo") == "documental" else "No cumple"
    return POR_SUBSANACION.get(sub, "No cumple")


def contar(datos: Path, reglas: dict) -> tuple[collections.Counter, int]:
    c, n = collections.Counter(), 0
    for res_path in sorted(datos.rglob("resultado.json")):
        res = leer(res_path)
        if not res:
            continue
        n += 1
        for r in res.get("resultados", []):
            c[etiqueta(r.get("resultado"), reglas.get(r.get("regla_id")))] += 1
    return c, n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", required=True, help="carpeta con resultado.json (se busca en subcarpetas)")
    ap.add_argument("--reglas", default=str(RAIZ / "reglas"))
    ap.add_argument("--reglas-antes", help="otro catálogo para poner una columna «antes»")
    a = ap.parse_args()
    despues, n = contar(Path(a.datos), catalogo(Path(a.reglas)))
    antes = contar(Path(a.datos), catalogo(Path(a.reglas_antes)))[0] if a.reglas_antes else None
    print(f"Corridas leídas: {n}\n")
    if antes is None:
        print("| Etiqueta | Resultados |\n|---|---|")
        for e in ETIQUETAS:
            print(f"| {e} | {despues[e]} |")
    else:
        print("| Etiqueta | Antes | Después | Cambio |\n|---|---|---|---|")
        for e in ETIQUETAS:
            print(f"| {e} | {antes[e]} | {despues[e]} | {despues[e] - antes[e]:+d} |")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
