#!/usr/bin/env python3
"""Candidatos a mejora de una tanda: los datos que las corridas escribieron mal (o en duda) en al menos `--min` corridas,
con lo que escribió cada una y por qué, la verdad comprobada a mano y el criterio vigente. Es la entrada del ciclo de
mejora automática (docs/demo/tanda*-12oct.md).

Causa probable de cada candidato:
  - «verdad dudosa»: casi todas las corridas (≥ 75 %, al menos 3) coinciden en el mismo valor y es distinto de la verdad;
  - «medible»: dato numérico con valores distintos entre corridas;
  - «lectura»: la corrida no lo escribió o lo dejó con confianza baja;
  - «criterio ambiguo»: el resto (sí/no que cambia entre corridas con el mismo criterio).

Uso: python scripts/analisis/hallazgos_tanda.py --rondas 26,27 [--min 2] [--json salida.json] > hallazgos.md
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter, defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
_cargar = lambda n: (lambda s: (s.loader.exec_module(m := importlib.util.module_from_spec(s)), m)[1])(  # noqa: E731
    importlib.util.spec_from_file_location(n, Path(__file__).with_name(f"{n}.py")))
de, ex = _cargar("desacuerdos"), _cargar("exactitud")
DATOS = Path(r"~\servidor_app_util\precheck-mupa-informe\web\.data")


def criterios() -> dict[str, str]:
    out = {}
    for f in ("hechos_documentales.json", "datos_universales.json"):
        for x in json.loads((RAIZ / "scripts" / f).read_text(encoding="utf-8")).get("datos", []):
            if x.get("criterio"):
                out[x["clave"]] = x["criterio"]
    return out


def causa(filas: list[dict], esperado) -> str:
    malas = [f for f in filas if f["calif"] != "acierto"]
    if any(f["calif"] in ("falta", "duda") for f in malas) and all(f["calif"] in ("falta", "duda") for f in malas):
        return "lectura"
    valores = Counter(json.dumps(f["valor"]) for f in filas)
    comun, n = valores.most_common(1)[0]
    if len(filas) >= 3 and n / len(filas) >= 0.75 and ex.calificar({"valor": json.loads(comun), "confianza": 1}, esperado) != "acierto":
        return "verdad dudosa"
    if isinstance(esperado, dict):
        return "medible"
    return "criterio ambiguo"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rondas", required=True)
    ap.add_argument("--min", type=int, default=2)
    ap.add_argument("--json")
    a = ap.parse_args()
    doc = json.loads((RAIZ / "docs" / "demo" / "verdad-datos-disputados.json").read_text(encoding="utf-8"))
    verdad = {k: dict(v) for k, v in doc["planos"].items()}
    for clave in sorted(k for k in doc if k.startswith("planos_v")):
        for plano, extra in doc[clave].items():
            verdad.setdefault(plano, {}).update(extra)
    crit = criterios()
    cs = de.corridas(DATOS, "2026-10-01", None, 10, {int(r) for r in a.rondas.split(",")}, alias=False)
    por_dato: dict[str, list[dict]] = defaultdict(list)
    for c in cs:
        for clave, v in verdad.get(c["plano"], {}).items():
            n = ex.nodo(c["hechos"], clave) or {}
            por_dato[clave].append(dict(plano=c["plano"], modelo=c["modelo"], precheck=c["precheck"], valor=n.get("valor"),
                                        confianza=n.get("confianza"), detalle=((n.get("fuente") or {}).get("detalle") or "")[:300],
                                        esperado=v["valor_esperado"], observacion=v.get("observacion", ""),
                                        calif=ex.calificar(n or None, v["valor_esperado"])))
    candidatos = []
    for clave, filas in por_dato.items():
        malas = [f for f in filas if f["calif"] != "acierto"]
        if len(malas) < a.min:
            continue
        por_plano = defaultdict(list)
        for f in filas:
            por_plano[f["plano"]].append(f)
        causas = {p: causa(fs, fs[0]["esperado"]) for p, fs in por_plano.items() if any(x["calif"] != "acierto" for x in fs)}
        candidatos.append(dict(dato=clave, errores=len(malas), corridas=len(filas), causas=causas, criterio=crit.get(clave, ""),
                               filas=malas))
    candidatos.sort(key=lambda c: -c["errores"])
    print(f"# Candidatos a mejora (rondas {a.rondas}; al menos {a.min} corridas con error o duda)\n")
    for c in candidatos:
        print(f"## `{c['dato']}`: {c['errores']} de {c['corridas']} corridas — " + ", ".join(f"{p}: {k}" for p, k in c["causas"].items()))
        print(f"\nCriterio vigente: {c['criterio'] or '(sin criterio)'}\n")
        for f in c["filas"]:
            print(f"- {f['plano']} · {f['modelo']}: escribió {json.dumps(f['valor'], ensure_ascii=False)} (conf {f['confianza']}), "
                  f"verdad {json.dumps(f['esperado'], ensure_ascii=False)} — «{f['detalle']}» | verdad: {f['observacion'][:200]}")
        print()
    if a.json:
        Path(a.json).write_text(json.dumps(candidatos, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
