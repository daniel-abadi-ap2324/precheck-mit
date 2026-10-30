#!/usr/bin/env python3
"""Compara dos catálogos de reglas sobre corridas ya hechas, sin IA: evalúa el motor con los datos de cada corrida
(extraccion.json + lote.json) con el catálogo de antes y el de después, y cuenta qué resultados cambian.

Uso: python scripts/comparar_catalogos.py --antes DIR_REGLAS --despues reglas --prechecks web/.data/prechecks [--json salida.json]
Solo lectura. Los ids de corrida no salen en el resumen por plano (se agrupan por documento).
"""
import argparse
import collections
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
from precheck.planos.revisar import a_hechos, cargar_reglas, combinar, evaluar  # noqa: E402


def comparar(antes, despues, prechecks, fecha):
    r_antes, r_despues = cargar_reglas(Path(antes)), cargar_reglas(Path(despues))
    por_plano = collections.defaultdict(lambda: {"corridas": 0, "antes": collections.Counter(), "despues": collections.Counter()})
    cambios = collections.Counter()
    nuevos_no_cumple = collections.defaultdict(list)
    for c in sorted(Path(prechecks).iterdir()):
        try:
            ext = json.loads((c / "extraccion.json").read_text(encoding="utf-8"))
            lote = json.loads((c / "lote.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        h = combinar(a_hechos(ext), lote)
        a, d = evaluar(h, r_antes, fecha), evaluar(h, r_despues, fecha)
        plano = ext.get("documento") or "?"
        p = por_plano[plano]
        p["corridas"] += 1
        ra = {x["regla_id"]: x["resultado"] for x in a["resultados"]}
        rd = {x["regla_id"]: x["resultado"] for x in d["resultados"]}
        p["antes"].update(ra.values())
        p["despues"].update(rd.values())
        for rid in set(ra) | set(rd):
            x, y = ra.get(rid, "—"), rd.get(rid, "—")
            if x != y:
                cambios[(x, y)] += 1
                if y == "NO_CUMPLE":
                    nuevos_no_cumple[rid].append(plano)
    return por_plano, cambios, nuevos_no_cumple


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--antes", required=True)
    ap.add_argument("--despues", default=str(RAIZ / "reglas"))
    ap.add_argument("--prechecks", required=True)
    ap.add_argument("--fecha", default="2026-10-09")
    ap.add_argument("--json")
    a = ap.parse_args(argv)
    por_plano, cambios, nuevos = comparar(a.antes, a.despues, a.prechecks, a.fecha)
    salida = {
        "por_plano": {k: {"corridas": v["corridas"], "antes": dict(v["antes"]), "despues": dict(v["despues"])} for k, v in sorted(por_plano.items())},
        "cambios": {f"{x} -> {y}": n for (x, y), n in cambios.most_common()},
        "nuevos_no_cumple": {k: {"veces": len(v), "planos": sorted(set(v))} for k, v in sorted(nuevos.items())},
    }
    print(json.dumps(salida, ensure_ascii=False, indent=1))
    if a.json:
        Path(a.json).write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
