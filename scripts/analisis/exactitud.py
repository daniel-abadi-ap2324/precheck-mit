#!/usr/bin/env python3
"""Exactitud de los datos disputados: compara los datos con que decidió el motor en cada corrida (hechos.json: lo que leyó
el extractor más lo que escribió la IA en lote.json) con la verdad comprobada a mano
en el plano (docs/demo/verdad-datos-disputados.json, con recortes de evidencia), aplicando los criterios de
scripts/hechos_documentales.json.

Un dato cuenta como «acierto» si el valor coincide (los números, con tolerancia `tol`) y la confianza es >= 0.85;
«duda» si coincide pero con confianza baja (el motor no decide); «error» si no coincide; «falta» si no lo escribió.

Uso: python scripts/analisis/exactitud.py --grupo antes=9,…,19 --grupo despues=20,21 [--detalle]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("desacuerdos", Path(__file__).with_name("desacuerdos.py"))
de = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(de)


def nodo(lote: dict, ruta: str):
    d = lote
    for k in ruta.split("."):
        if not isinstance(d, dict) or k not in d:
            return None
        d = d[k]
    return d if isinstance(d, dict) and "valor" in d else None


def calificar(n, esperado) -> str:
    if n is None:
        return "falta"
    v, conf = n.get("valor"), n.get("confianza") or 0
    if isinstance(esperado, dict):  # {"valor": x, "tol": t}
        ok = isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v - esperado["valor"]) <= esperado.get("tol", 0)
    else:
        ok = v == esperado
    if not ok:
        return "error"
    return "acierto" if conf >= 0.85 else "duda"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--grupo", action="append", required=True)
    ap.add_argument("--verdad", default=str(RAIZ / "docs" / "demo" / "verdad-datos-disputados.json"))
    ap.add_argument("--datos", default=r"~\servidor_app_util\precheck-mupa-informe\web\.data")
    ap.add_argument("--detalle", action="store_true")
    ap.add_argument("--con-v3", action="store_true", help="suma los datos que solo resuelven los criterios v3 (planos_v3)")
    a = ap.parse_args()
    doc = json.loads(Path(a.verdad).read_text(encoding="utf-8"))
    verdad = {k: dict(v) for k, v in doc["planos"].items()}
    if a.con_v3:
        # planos_v3, planos_v4…: datos que entraron a la verdad después (criterios v3, los 7 sí/no del 13-oct).
        for clave in sorted(k for k in doc if k.startswith("planos_v")):
            for plano, extra in doc[clave].items():
                verdad.setdefault(plano, {}).update(extra)
    print("| Plano | Grupo | Modelo | Corridas | Aciertos | Dudas | Errores | Faltan |")
    print("|---|---|---|---|---|---|---|---|")
    for g in a.grupo:
        nombre, rondas = g.split("=")
        cs = de.corridas(Path(a.datos), "2026-10-01", None, 10, {int(r) for r in rondas.split(",")}, alias=False)
        for plano, esperado in verdad.items():
            sub = [c for c in cs if c["plano"] == plano]
            for modelo in sorted({c["modelo"] for c in sub}):
                cuenta, n = Counter(), 0
                for c in (x for x in sub if x["modelo"] == modelo):
                    n += 1
                    for clave, val in esperado.items():
                        r = calificar(nodo(c["hechos"], clave), val["valor_esperado"])
                        cuenta[r] += 1
                        if a.detalle and r != "acierto":
                            nd = nodo(c["hechos"], clave) or {}
                            print(f"    {plano} {nombre} {modelo} {c['fecha']} {clave}: {r} (escribió {nd.get('valor')} conf {nd.get('confianza')})")
                tot = sum(cuenta.values()) or 1
                print(f"| {plano} | {nombre} | {modelo} | {n} | {100 * cuenta['acierto'] / tot:.0f} % | {100 * cuenta['duda'] / tot:.0f} % | {100 * cuenta['error'] / tot:.0f} % | {100 * cuenta['falta'] / tot:.0f} % |")


if __name__ == "__main__":
    main()
