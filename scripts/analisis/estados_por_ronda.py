#!/usr/bin/env python3
"""Decisiones finales de cada corrida de prueba de un plano, por ronda, separando la severidad de los NO_CUMPLE.

La tarjeta de «Comparar modelos» cuenta el estado de la web, que depende de la severidad con que se evaluó cada
corrida: entre el 16 y el 19-oct, los requisitos de contenido del plano tenían severidad «observacion» y se veían como
observación (ADR-0014). Para comparar rondas de antes y después, este script cuenta las decisiones crudas como las
decide la web (prevalece el motor; un NO_CUMPLE de la IA con confianza < 0.85 es observación) y separa los NO_CUMPLE
bloqueantes, los de severidad observación y los de contenido del plano (tipo documental, desde el 19-oct).

Uso:
  python scripts/analisis/estados_por_ronda.py "Tocumen (comercial)" [--desde 40] [--datos web/.data]
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

from nombres import etiqueta_grupo, grupo_de, grupos_de_rondas

RAIZ = Path(__file__).resolve().parents[2]
RONDA = re.compile(r"^(?P<plano>.+?) - prueba (?P<n>\d+) con (?P<modelo>.+?)(?: \((?P<repeticion>\d+)\))?$")
MOTOR = {"CUMPLE", "NO_CUMPLE", "NO_APLICA"}
UMBRAL = 0.85


def _leer(ruta: Path):
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def conteo(carpeta: Path) -> tuple[Counter, str | None]:
    res = _leer(carpeta / "resultado.json") or {}
    dic = {x["regla_id"]: x for x in (_leer(carpeta / "dictamen.json") or {}).get("decisiones", []) if isinstance(x, dict) and x.get("regla_id")}
    c: Counter = Counter()
    for r in res.get("resultados", []):
        if not r.get("regla_id") or r.get("grupo") == "zona_por_confirmar":
            continue
        x = dic.get(r["regla_id"])
        if r.get("resultado") in MOTOR:
            dec, origen = r["resultado"], "motor"
        elif x:
            dec, origen = x.get("decision"), "IA"
            if (x.get("estado") or "") == "INFORMACION_REQUERIDA":
                dec = "INFO_REQ"
            elif dec == "NO_CUMPLE" and isinstance(x.get("confianza"), (int, float)) and x["confianza"] < UMBRAL:
                dec = "OBS_CONFIANZA"
        else:
            dec, origen = "REVISION", "-"
        if dec == "NO_CUMPLE":
            sev = "obs" if r.get("severidad") == "observacion" else "doc" if r.get("tipo") == "documental" else "bloq"
            c[f"NC_{sev}"] += 1
            c[f"NC_{origen}"] += 1
        else:
            c[dec] += 1
    return c, res.get("norma_aplicable")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("plano")
    ap.add_argument("--desde", type=int, default=0, help="primera ronda a mostrar")
    ap.add_argument("--datos", type=Path, default=RAIZ / "web" / ".data")
    a = ap.parse_args(argv)
    grupos = grupos_de_rondas()
    filas = []
    for f in (a.datos / "proyectos").glob("prj-web-*.json"):
        p = (_leer(f) or {}).get("project") or {}
        m = RONDA.match(p.get("name", ""))
        if not m or m["plano"] != a.plano or int(m["n"]) < a.desde or not p.get("precheckId"):
            continue
        carpeta = a.datos / "prechecks" / p["precheckId"]
        if (carpeta / "dictamen.json").exists():
            rep = int(m["repeticion"] or 1)
            filas.append((int(m["n"]), rep, m["modelo"] + (f" ({rep})" if rep > 1 else ""), *conteo(carpeta)))
    print("grupo  ronda modelo               norma           NO_CUMPLE (bloq/doc/obs; motor/IA)   OBS  OBSconf  INFO  CUMPLE  NA  REV")
    for n, _, modelo, c, norma in sorted(filas):
        nc = c["NC_bloq"] + c["NC_doc"] + c["NC_obs"]
        grupo = etiqueta_grupo(grupo_de(n, grupos))
        print(f"{grupo:<6} r{n:<4} {modelo[:20]:20} {str(norma)[:15]:15} {nc:>3} ({c['NC_bloq']:>2}/{c['NC_doc']:>2}/{c['NC_obs']:>2}; {c['NC_motor']:>2}/{c['NC_IA']:>2})"
              f"          {c['OBSERVACION']:>3}  {c['OBS_CONFIANZA']:>7}  {c['INFO_REQ']:>4}  {c['CUMPLE']:>6}  {c['NO_APLICA']:>2}  {c['REVISION']:>3}")
    if not filas:
        print("Sin corridas con dictamen para", a.plano)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
