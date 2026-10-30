#!/usr/bin/env python3
"""Prueba controlada de los polígonos: en cada ronda, la revisión de Sonnet de Tocumen con polígonos frente a la de la
copia del mismo plano sin polígonos («Tocumen sin polígonos»). Mismo modelo, mismos datos confirmados, mismas
instrucciones; la única diferencia es regiones.json.

Por corrida: plazas escritas (verdad 369), exactitud en los datos disputados (verdad de docs/demo/verdad-datos-disputados.json),
NO_CUMPLE, hallazgos propios, costo y minutos.

Uso: python scripts/analisis/poligonos_pares.py --rondas 18,19,23,24,25
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import statistics
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
_cargar = lambda n: (lambda s: (s.loader.exec_module(m := importlib.util.module_from_spec(s)), m)[1])(  # noqa: E731
    importlib.util.spec_from_file_location(n, Path(__file__).with_name(f"{n}.py")))
de, ex = _cargar("desacuerdos"), _cargar("exactitud")
DATOS = Path(r"~\servidor_app_util\precheck-mupa-informe\web\.data")


def costo_y_minutos(precheck: str) -> tuple[float | None, float | None]:
    ult = None
    f = DATOS / "prechecks" / precheck / "ia.log.jsonl"
    if f.exists():
        for linea in f.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                x = json.loads(linea)
            except Exception:  # noqa: BLE001
                continue
            if isinstance(x, dict) and x.get("total_cost_usd") is not None:
                ult = x
    if not ult:
        return None, None
    return ult["total_cost_usd"], (ult.get("duration_ms") or 0) / 60000


def fila(c: dict, verdad: dict) -> dict:
    calif = [ex.calificar(ex.nodo(c["hechos"], k), v["valor_esperado"]) for k, v in verdad.items()]
    dec = list(c["ia"].values())
    usd, _ = costo_y_minutos(c["precheck"])
    return dict(plazas=(ex.nodo(c["hechos"], "proyecto.estacionamientos") or {}).get("valor"),
                exactitud=round(100 * calif.count("acierto") / len(calif)),
                no_cumple=sum(d["decision"] == "NO_CUMPLE" for d in dec),
                hallazgos=sum(d["regla_id"].startswith("HALLAZGO") for d in dec), usd=usd)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rondas", default="18,19,23,24,25")
    a = ap.parse_args()
    rondas = {int(r) for r in a.rondas.split(",")}
    verdad = json.loads((RAIZ / "docs" / "demo" / "verdad-datos-disputados.json").read_text(encoding="utf-8"))["planos"]["Tocumen (comercial)"]
    cs = [c for c in de.corridas(DATOS, "2026-10-01", None, 0, rondas, alias=False) if c["modelo"].startswith("Sonnet")]
    lados = {"con": [c for c in cs if c["plano"] == "Tocumen (comercial)"], "sin": [c for c in cs if c["plano"] == "Tocumen sin polígonos"]}
    print("| Lado | Corridas | Plazas = 369 | Exactitud (media) | NO_CUMPLE (media) | Hallazgos (media) | USD (media) |")
    print("|---|---|---|---|---|---|---|")
    for lado, sub in lados.items():
        fs = [fila(c, verdad) for c in sub]
        if not fs:
            continue
        media = lambda k: round(statistics.mean(x[k] for x in fs if x[k] is not None), 2)  # noqa: E731
        print(f"| {lado} polígonos | {len(fs)} | {sum(x['plazas'] == 369 for x in fs)} de {len(fs)} | {media('exactitud')} % | "
              f"{media('no_cumple')} | {media('hallazgos')} | {media('usd')} |")


if __name__ == "__main__":
    main()
