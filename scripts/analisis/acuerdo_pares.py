#!/usr/bin/env python3
"""Acuerdo entre pares de corridas del mismo plano: para cada par de corridas y cada regla que ambas resolvieron,
¿dieron el mismo resultado final? Sirve para comparar dos grupos de rondas aunque tengan distinto número de corridas.

- «acuerdo»: % de pares (regla, corrida A, corrida B) con el mismo resultado final.
- «contradicción»: % de pares en que una dice CUMPLE y la otra NO_CUMPLE.
Se ignoran las reglas que una de las dos dejó en REQUIERE_REVISION (no decidió) y los hallazgos propios.

Uso: python scripts/analisis/acuerdo_pares.py --grupo antes=13,14,15,16,17,18,19 --grupo despues=20,21 [--modelos Sonnet,Opus,Haiku]
"""
from __future__ import annotations

import argparse
import importlib.util
from itertools import combinations
from pathlib import Path

_spec = importlib.util.spec_from_file_location("desacuerdos", Path(__file__).with_name("desacuerdos.py"))
de = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(de)

DECIDIDO = {"CUMPLE", "NO_CUMPLE", "OBSERVACION", "NO_APLICA", "INFORMACION_REQUERIDA"}


def medir(cs: list[dict]) -> dict:
    pares = iguales = contra = 0
    for a, b in combinations(cs, 2):
        for rid in set(a["motor"]) | set(a["ia"]):
            if rid.startswith("HALLAZGO"):
                continue
            x, y = de.final(a, rid), de.final(b, rid)
            if x not in DECIDIDO or y not in DECIDIDO:
                continue
            pares += 1
            iguales += x == y
            contra += {x, y} == {"CUMPLE", "NO_CUMPLE"}
    return dict(corridas=len(cs), pares=pares, acuerdo=round(100 * iguales / pares, 1) if pares else None,
                contradiccion=round(100 * contra / pares, 1) if pares else None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--grupo", action="append", required=True, help="nombre=r1,r2,…")
    ap.add_argument("--modelos", default="", help="solo estos modelos (prefijos separados por coma)")
    ap.add_argument("--datos", default=r"~\servidor_app_util\precheck-mupa-informe\web\.data")
    a = ap.parse_args()
    modelos = [m.strip() for m in a.modelos.split(",") if m.strip()]
    print("| Plano | Grupo | Corridas | Pares regla-corrida | Acuerdo | Contradicción CUMPLE/NO_CUMPLE |")
    print("|---|---|---|---|---|---|")
    for g in a.grupo:
        nombre, rondas = g.split("=")
        cs = de.corridas(Path(a.datos), "2026-10-01", None, 10, {int(r) for r in rondas.split(",")}, alias=False)
        if modelos:
            cs = [c for c in cs if any(c["modelo"].startswith(m) for m in modelos)]
        for plano in sorted({c["plano"] for c in cs}):
            m = medir([c for c in cs if c["plano"] == plano])
            print(f"| {plano} | {nombre} | {m['corridas']} | {m['pares']} | {m['acuerdo']} % | {m['contradiccion']} % |")


if __name__ == "__main__":
    main()
