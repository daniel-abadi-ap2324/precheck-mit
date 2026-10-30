#!/usr/bin/env python3
"""Qué reglas dan más «No cumple» en los PreCheck guardados de la web local.

Para cada regla cuenta en cuántas revisiones quedó NO_CUMPLE (resultado.json del motor) y en cuántos planos distintos, y
si la IA la contradijo en su dictamen (decisión distinta de NO_CUMPLE). Sirve para encontrar reglas que se aplican de
más o con severidad mal puesta. No cambia nada.

Uso: python scripts/analisis/no_cumple_por_regla.py [--datos web/.data/prechecks] [--top 30]
"""
from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def leer(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", default=str(RAIZ / "web" / ".data" / "prechecks"))
    ap.add_argument("--top", type=int, default=30)
    a = ap.parse_args()
    veces = collections.Counter()
    evaluada = collections.Counter()
    planos: dict[str, set] = collections.defaultdict(set)
    contradicha = collections.Counter()
    total = 0
    for d in sorted(Path(a.datos).iterdir()):
        if not d.is_dir() or d.name.endswith(".cancelado"):
            continue
        res = leer(d / "resultado.json")
        est = leer(d / "estado.json") or {}
        if not res:
            continue
        total += 1
        plano = (est.get("planIds") or ["?"])[0]
        dic = leer(d / "dictamen.json") or {}
        ia = {x.get("regla_id"): x.get("decision") or x.get("resultado") for x in dic.get("decisiones", []) if isinstance(x, dict)}
        for r in res.get("resultados", []):
            rid = r.get("regla_id")
            if r.get("resultado") in ("CUMPLE", "NO_CUMPLE", "REQUIERE_REVISION"):
                evaluada[rid] += 1
            if r.get("resultado") == "NO_CUMPLE":
                veces[rid] += 1
                planos[rid].add(plano)
                if rid in ia and ia[rid] != "NO_CUMPLE":
                    contradicha[rid] += 1
    print(f"Revisiones leídas: {total}\n")
    print("| Regla | NO_CUMPLE | de evaluadas | Planos | IA lo contradijo |")
    print("|---|---|---|---|---|")
    for rid, n in veces.most_common(a.top):
        print(f"| {rid} | {n} | {n * 100 // max(evaluada[rid], 1)} % | {len(planos[rid])} | {contradicha[rid]} |")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
