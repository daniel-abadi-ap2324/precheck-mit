#!/usr/bin/env python3
"""Costo (USD a precios de la API) y minutos por plano y modelo de las rondas dadas, y cuántas revisiones terminaron.

Uso: python scripts/analisis/costos.py --rondas 23,24,25
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
from collections import defaultdict
from pathlib import Path

DATOS = Path(r"~\servidor_app_util\precheck-mupa-informe\web\.data")
NOMBRE = re.compile(r"^(?P<plano>.+?) - prueba (?P<ronda>\d+) con (?P<modelo>.+?)(?: \((?P<repeticion>\d+)\))?$")


def minutos(log: Path) -> float | None:
    """Duración de la revisión: de la primera a la última marca [HH:MM:SS] de ia.log.txt (sin la espera en la cola)."""
    if not log.exists():
        return None
    marcas = re.findall(r"^\[(\d\d):(\d\d):(\d\d)\]", log.read_text(encoding="utf-8", errors="replace"), re.M)
    if len(marcas) < 2:
        return None
    seg = [int(h) * 3600 + int(m) * 60 + int(s) for h, m, s in (marcas[0], marcas[-1])]
    return ((seg[1] - seg[0]) % 86400) / 60


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rondas", required=True)
    a = ap.parse_args()
    rondas = {int(r) for r in a.rondas.split(",")}
    grupos = defaultdict(list)
    for f in (DATOS / "proyectos").glob("*.json"):
        try:
            pr = json.loads(f.read_text(encoding="utf-8")).get("project") or {}
        except (ValueError, KeyError, TypeError, AttributeError):  # proyecto vacío o a medio escribir
            continue
        m = NOMBRE.match(pr.get("name", ""))
        if not m or int(m["ronda"]) not in rondas or not pr.get("precheckId"):
            continue
        car = DATOS / "prechecks" / pr["precheckId"]
        ia = (json.loads((car / "estado.json").read_text(encoding="utf-8")).get("ia") or {}) if (car / "estado.json").exists() else {}
        ult = None
        if (car / "ia.log.jsonl").exists():
            for linea in (car / "ia.log.jsonl").read_text(encoding="utf-8", errors="replace").splitlines():
                try:
                    x = json.loads(linea)
                except Exception:  # noqa: BLE001
                    continue
                if isinstance(x, dict) and x.get("total_cost_usd") is not None:
                    ult = x
        grupos[(m["plano"], m["modelo"])].append(dict(estado=ia.get("status"), error=(ia.get("error") or "")[:80],
                                                      usd=(ult or {}).get("total_cost_usd"), minutos=minutos(car / "ia.log.txt")))
    total = 0.0
    print("| Plano | Modelo | Terminadas | USD por revisión | Minutos por revisión | Fallas |")
    print("|---|---|---|---|---|---|")
    for (plano, modelo), fs in sorted(grupos.items()):
        ok = [x for x in fs if x["estado"] == "done"]
        usd = [x["usd"] for x in fs if x["usd"]]
        mins = [x["minutos"] for x in ok if x["minutos"]]
        total += sum(usd)
        fallas = "; ".join(sorted({x["error"] or x["estado"] or "?" for x in fs if x["estado"] != "done"}))
        print(f"| {plano} | {modelo} | {len(ok)} de {len(fs)} | {statistics.mean(usd):.2f} | "
              f"{statistics.mean(mins):.0f} | {fallas} |" if usd and mins else f"| {plano} | {modelo} | {len(ok)} de {len(fs)} | — | — | {fallas} |")
    print(f"\nTotal: {total:.2f} USD")


if __name__ == "__main__":
    main()
