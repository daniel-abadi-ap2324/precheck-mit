#!/usr/bin/env python3
"""Costo y consumo de las corridas con IA, leído del registro de cada una (web/.data/prechecks/<id>/ia.log.jsonl). Solo lectura.

El registro de Claude Code trae al final el costo estimado en dólares (a precios de la API; **no** es el porcentaje de la cuota de la
suscripción), los minutos de API, los turnos y los tokens de salida. Una corrida que se cortó (límite de uso, tiempo) no trae ese cierre.

Uso: python scripts/costos_corridas.py [--salida docs/demo/costos-corridas.md]
"""
import argparse
import collections
import glob
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RONDA = re.compile(r"^(?P<plano>.+?) - prueba (?P<n>\d+) con (?P<modelo>.+?)(?: \((?P<repeticion>\d+)\))?$")


def cierre(registro: Path):
    res = None
    for linea in registro.read_text(encoding="utf-8").splitlines():
        try:
            o = json.loads(linea)
        except ValueError:
            continue
        if isinstance(o, dict) and "total_cost_usd" in o:
            res = o
    return res


def cargar(datos: Path) -> list[dict]:
    filas = []
    for f in sorted((datos / "proyectos").glob("prj-web-*.json")):
        try:
            p = json.loads(f.read_text(encoding="utf-8"))["project"]
        except (ValueError, KeyError, TypeError, AttributeError):  # proyecto vacío o a medio escribir
            continue
        m = RONDA.match(p["name"])
        if not m or not p.get("precheckId"):
            continue
        carpeta = datos / "prechecks" / p["precheckId"]
        try:
            estado = json.loads((carpeta / "estado.json").read_text(encoding="utf-8"))
            registro = carpeta / "ia.log.jsonl"
            fin = cierre(registro) if registro.exists() else None
        except (OSError, ValueError):
            continue
        if (estado.get("ia") or {}).get("status") != "done" or not fin:
            continue
        u = fin.get("usage") or {}
        filas.append(dict(plano=m["plano"], ronda=int(m["n"]), modelo=m["modelo"].split()[0], usd=fin["total_cost_usd"],
                          minutos=fin.get("duration_api_ms", 0) / 60000, turnos=fin.get("num_turns"),
                          salida_k=u.get("output_tokens", 0) / 1000, pensando_k=(u.get("output_tokens_details") or {}).get("thinking_tokens", 0) / 1000))
    return filas


#: Columnas de la tabla por ronda (primera palabra del modelo en el nombre del proyecto de prueba).
COLUMNAS = ("Haiku", "Sonnet", "Opus", "Fable", "DeepSeek")


def informe(filas: list[dict]) -> str:
    md = ["# Costo y consumo de las corridas con IA", "",
          "Generado por `scripts/costos_corridas.py` (solo lectura de `web/.data`). El costo es la **estimación en dólares que registra Claude Code a precios de la API**; no es el porcentaje de la cuota de la suscripción de Daniel. DeepSeek va a precio de lista (el contador de la web), no a lo que cobró de verdad. Solo cuentan las corridas terminadas con cierre en el registro; las cortadas por límite de uso o tiempo no aparecen. No incluye lo que se gasta en conversar con Claude para programar, analizar o documentar.", "",
          f"**{len(filas)} corridas** con registro completo: **{sum(f['usd'] for f in filas):.0f} USD** en total.", "",
          "## Por ronda y plano", "", "Costo por modelo: la suma de sus corridas en esa ronda.", "",
          "| Plano | Ronda | Corridas | Costo total (USD) | Minutos de API | " + " | ".join(COLUMNAS) + " |",
          "|---|---|---|---|---|" + "---|" * len(COLUMNAS)]
    por = collections.defaultdict(list)
    for f in filas:
        por[(f["plano"], f["ronda"])].append(f)
    for (plano, ronda), v in sorted(por.items()):
        mod = collections.defaultdict(float)
        for x in v:
            mod[x["modelo"]] += x["usd"]
        md.append(f"| {plano} | {ronda} | {len(v)} | {sum(x['usd'] for x in v):.1f} | {sum(x['minutos'] for x in v):.0f} | "
                  + " | ".join(f"{mod[m]:.1f}" if m in mod else "—" for m in COLUMNAS) + " |")
    md += ["", "## Por modelo (promedio por corrida)", "", "| Modelo | Corridas | USD por corrida | Minutos de API | Turnos | Tokens de salida (miles) |", "|---|---|---|---|---|---|"]
    pm = collections.defaultdict(list)
    for f in filas:
        pm[f["modelo"]].append(f)
    for m, v in sorted(pm.items()):
        n = len(v)
        md.append(f"| {m} | {n} | {sum(x['usd'] for x in v) / n:.1f} | {sum(x['minutos'] for x in v) / n:.0f} | {sum((x['turnos'] or 0) for x in v) / n:.0f} | {sum(x['salida_k'] for x in v) / n:.0f} |")
    total = sum(f["usd"] for f in filas) or 1
    md += ["", "Parte del costo que se lleva cada modelo: " + ", ".join(f"{m} {100 * sum(x['usd'] for x in v) / total:.0f} %" for m, v in sorted(pm.items())) + "."]
    return "\n".join(md) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--datos", default=str(RAIZ / "web" / ".data"))
    ap.add_argument("--salida", default=None)
    a = ap.parse_args(argv)
    texto = informe(cargar(Path(a.datos)))
    if a.salida:
        Path(a.salida).write_text(texto, encoding="utf-8")
        print("Escrito", a.salida)
    else:
        print(texto)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
