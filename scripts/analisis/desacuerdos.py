#!/usr/bin/env python3
"""Reglas en las que las corridas de la IA no coinciden, por plano, con la causa probable de cada desacuerdo.

Solo lee web/.data: proyectos «<Plano> - prueba N con <Modelo>», su dictamen.json, resultado.json y lote.json.
El resultado final de una regla en una corrida es la decisión de la IA si la hay y, si no, el resultado del motor.

Se excluyen las corridas superficiales (menos de --min-decisiones decisiones de la IA). Para cada regla con desacuerdo:
  - fuerza: «fuerte» si unas corridas dicen CUMPLE y otras NO_CUMPLE; «leve» en otro caso (p. ej. OBSERVACION frente a
    CUMPLE, o una corrida que no decidió);
  - causa: «dato» si los datos de entrada de la regla que escribió cada corrida difieren (se listan los valores);
    «criterio IA» si los datos son iguales (o no hay) y la diferencia está en cómo decide la IA.

Uso: python scripts/analisis/desacuerdos.py [--datos web/.data] [--desde 2026-10-09] [--planos "Casco Antiguo,Tocumen"]
         [--json salida.json] > informe.md
"""
from __future__ import annotations

import argparse
import glob
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
NOMBRE = re.compile(r"^(?P<plano>.+?) - (?:IA|prueba(?: (?P<ronda>\d+))? con) (?P<modelo>.+?)(?: \((?P<repeticion>\d+)\))?$")
# El mismo plano con otro nombre de proyecto (copia sin polígonos de la prueba controlada).
ALIAS = {"Tocumen sin polígonos": "Tocumen (comercial)"}


def leer(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def valor(d, ruta: str):
    for k in ruta.split("."):
        if not isinstance(d, dict) or k not in d:
            return None
        d = d[k]
    return d.get("valor") if isinstance(d, dict) and "valor" in d else d


def reglas_por_id() -> dict:
    out = {}
    for f in glob.glob(str(RAIZ / "reglas" / "**" / "*.json"), recursive=True):
        d = leer(Path(f))
        for r in (d if isinstance(d, list) else (d or {}).get("reglas", [d])):
            if isinstance(r, dict) and r.get("id"):
                out[r["id"]] = r
    return out


def corridas(datos: Path, desde: str, planos: list[str] | None, min_decisiones: int = 10, rondas: set[int] | None = None,
             alias: bool = True) -> list[dict]:
    """`alias=False` deja la copia «Tocumen sin polígonos» como plano aparte (para no mezclarla en las cifras de Tocumen)."""
    out = []
    for f in sorted((datos / "proyectos").glob("*.json")):
        pr = (leer(f) or {}).get("project") or {}
        m = NOMBRE.match(pr.get("name", ""))
        if not m or not pr.get("precheckId"):
            continue
        if rondas and not (m["ronda"] and int(m["ronda"]) in rondas):
            continue
        plano = ALIAS.get(m["plano"], m["plano"]) if alias else m["plano"]
        if planos and not any(plano.startswith(p) for p in planos):
            continue
        car = datos / "prechecks" / pr["precheckId"]
        dic, res = leer(car / "dictamen.json"), leer(car / "resultado.json")
        if not dic or not res or (dic.get("fecha") or "")[:10] < desde or len(dic.get("decisiones", [])) < min_decisiones:
            continue
        motor = {x["regla_id"]: x["resultado"] for x in res.get("resultados", [])}
        ia = {x["regla_id"]: x for x in dic.get("decisiones", [])}
        out.append(dict(plano=plano, nombre=pr["name"], modelo=m["modelo"], fecha=dic.get("fecha", "")[:16],
                        precheck=pr["precheckId"], motor=motor, ia=ia, lote=leer(car / "lote.json") or {},
                        # hechos.json: los datos con que decidió el motor (extracción + lote.json de la IA).
                        hechos=leer(car / "hechos.json") or leer(car / "lote.json") or {}))
    return out


def final(c: dict, rid: str) -> str | None:
    if rid in c["ia"]:
        return c["ia"][rid]["decision"]
    return c["motor"].get(rid)


def analizar(cs: list[dict], reglas: dict) -> list[dict]:
    ids = sorted({r for c in cs for r in (*c["motor"], *c["ia"]) if not r.startswith("HALLAZGO")})
    filas = []
    for rid in ids:
        presentes = [c for c in cs if final(c, rid) is not None]
        if len(presentes) < 2:
            continue
        cuenta = Counter(final(c, rid) for c in presentes)
        if len(cuenta) < 2:
            continue
        entradas = (reglas.get(rid) or {}).get("entradas") or []
        datos = {e: [(c["modelo"], valor(c["lote"], e)) for c in presentes] for e in entradas}
        datos = {e: v for e, v in datos.items() if len({json.dumps(x[1]) for x in v}) > 1}
        causa = "dato" if datos else "criterio IA"
        fuerza = "fuerte" if {"CUMPLE", "NO_CUMPLE"} <= set(cuenta) else "leve"
        minoria = 1 - max(cuenta.values()) / len(presentes)
        filas.append(dict(regla=rid, titulo=(reglas.get(rid) or {}).get("titulo", ""), n=len(presentes),
                          resultados=dict(cuenta), minoria=round(minoria, 2), causa=causa, fuerza=fuerza,
                          por_corrida=[(c["modelo"], c["fecha"], final(c, rid)) for c in presentes],
                          datos_que_varian=datos,
                          justificaciones=[(c["modelo"], c["ia"][rid].get("justificacion", "")[:300]) for c in presentes if rid in c["ia"]]))
    filas.sort(key=lambda f: (f["fuerza"] != "fuerte", -f["minoria"], -f["n"]))
    return filas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", default=str(RAIZ / "web" / ".data"))
    ap.add_argument("--desde", default="2026-10-09")
    ap.add_argument("--planos", default="Casco Antiguo,Tocumen")
    ap.add_argument("--rondas", help="solo estas rondas, separadas por coma (p. ej. 20,21)")
    ap.add_argument("--min-decisiones", type=int, default=10, help="excluye corridas superficiales")
    ap.add_argument("--json")
    a = ap.parse_args()
    # La lectura de web/.data sigue a la copia principal (los worktrees no tienen datos).
    datos = Path(a.datos)
    if not (datos / "proyectos").exists():
        datos = Path(r"~\servidor_app_util\precheck-mupa-informe\web\.data")
    reglas = reglas_por_id()
    cs = corridas(datos, a.desde, [p.strip() for p in a.planos.split(",") if p.strip()], a.min_decisiones,
                 {int(x) for x in a.rondas.split(",")} if a.rondas else None)
    salida = {}
    for plano in sorted({c["plano"] for c in cs}):
        sub = [c for c in cs if c["plano"] == plano]
        filas = analizar(sub, reglas)
        salida[plano] = dict(corridas=[(c["modelo"], c["fecha"], c["precheck"]) for c in sub], desacuerdos=filas)
        print(f"\n## {plano}: {len(sub)} corridas ({', '.join(sorted(Counter(c['modelo'] for c in sub)))}), {len(filas)} reglas con desacuerdo\n")
        cuenta = Counter((f["fuerza"], f["causa"]) for f in filas)
        print("Resumen: " + ", ".join(f"{k[0]}/{k[1]}: {v}" for k, v in sorted(cuenta.items())) + "\n")
        print("| Regla | n | Resultados | Fuerza | Causa | Datos que varían |")
        print("|---|---|---|---|---|---|")
        for f in filas:
            res = ", ".join(f"{k} {v}" for k, v in sorted(f["resultados"].items(), key=lambda x: -x[1]))
            dv = "; ".join(f"`{e}`: " + ", ".join(f"{m[:4]} {v}" for m, v in vals) for e, vals in f["datos_que_varian"].items())
            print(f"| `{f['regla']}` | {f['n']} | {res} | {f['fuerza']} | {f['causa']} | {dv[:400]} |")
    if a.json:
        Path(a.json).write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
