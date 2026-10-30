#!/usr/bin/env python3
"""Diagnóstico de DeepSeek frente al modelo de referencia (Opus) en una ronda, plano por plano, para decidir qué cambiar:

- presupuesto: llamadas, USD (a precio de lista), tokens por llamada, herramientas usadas, si cerró por tope;
- cobertura: datos pedidos vs escritos (faltan según datos_pedidos.py), y cuáles;
- lectura: errores y dudas contra la verdad comprobada (exactitud.py con --con-v3);
- dictamen: decisiones de DeepSeek que difieren de las de Opus en la misma ronda (CUMPLE/NO_CUMPLE/OBSERVACION/NO_APLICA),
  contradicciones con el motor e «información requerida» en reglas del plano.

Uso: python scripts/analisis/deepseek_diagnostico.py --ronda 39 [--referencia Opus] [--detalle]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
PY = sys.executable


def modulo(nombre: str):
    spec = importlib.util.spec_from_file_location(nombre, Path(__file__).with_name(f"{nombre}.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


de = modulo("desacuerdos")
ex = modulo("exactitud")
je = modulo("jerarquia")

TERMINO = re.compile(r"DeepSeek terminó: (?P<llamadas>\d+) llamadas, (?P<usd>[0-9.]+) USD, herramientas (?P<herr>\{.*?\})")
LLAMADA = re.compile(r"DeepSeek llamada \d+: (?P<ent>\d+)\+(?P<sal>\d+) tokens")


def registro(car: Path) -> dict:
    t = (car / "ia.log.txt").read_text(encoding="utf-8", errors="replace") if (car / "ia.log.txt").exists() else ""
    m = TERMINO.search(t)
    ents = [int(x["ent"]) for x in LLAMADA.finditer(t)]
    return {
        "llamadas": int(m["llamadas"]) if m else None,
        "usd": float(m["usd"]) if m else None,
        "herramientas": json.loads(m["herr"]) if m else {},
        "tokens_entrada_media": round(sum(ents) / len(ents)) if ents else None,
        "tokens_entrada_max": max(ents) if ents else None,
        "cerro_por_tope": "Límite de la revisión alcanzado" in t,
        "sin_reevaluar": "cerró sin reevaluar" in t,
        "aviso_escritura": "no has escrito ningún dato" in t,
    }


def faltantes(car: Path) -> list[str]:
    r = subprocess.run([PY, str(RAIZ / "scripts" / "datos_pedidos.py"), str(car), "--json"], capture_output=True, text=True, encoding="utf-8")
    try:
        return [x for x in json.loads(r.stdout).get("faltan", []) if isinstance(x, str)]
    except Exception:
        return []


def lectura(c: dict, verdad: dict) -> dict:
    out = {"acierto": [], "duda": [], "error": [], "falta": []}
    for clave, esperado in verdad.get(c["plano"], {}).items():
        n = ex.nodo(c["hechos"], clave)
        cal = ex.calificar(n, esperado["valor_esperado"] if isinstance(esperado, dict) and "valor_esperado" in esperado else esperado)
        out[cal].append(f"{clave}={n.get('valor') if n else None}" + (f" ({n.get('confianza')})" if n and cal != "acierto" else ""))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ronda", type=int, required=True)
    ap.add_argument("--referencia", default="Opus")
    ap.add_argument("--datos", default=r"~\servidor_app_util\precheck-mupa-informe\web\.data")
    ap.add_argument("--detalle", action="store_true")
    a = ap.parse_args()
    doc = json.loads((RAIZ / "docs" / "demo" / "verdad-datos-disputados.json").read_text(encoding="utf-8"))
    verdad = {k: dict(v) for k, v in doc["planos"].items()}
    for clave in sorted(k for k in doc if k.startswith("planos_v")):
        for plano, extra in doc[clave].items():
            verdad.setdefault(plano, {}).update(extra)
    reglas = de.reglas_por_id()
    externas = je.reglas_externas(reglas)
    cs = de.corridas(Path(a.datos), "2026-10-01", None, min_decisiones=1, rondas={a.ronda}, alias=False)
    ds = [c for c in cs if c["modelo"].startswith("DeepSeek")]
    ref = {c["plano"]: c for c in cs if c["modelo"].startswith(a.referencia)}
    print(f"# DeepSeek frente a {a.referencia}, ronda {a.ronda}\n")
    for c in sorted(ds, key=lambda x: x["plano"]):
        car = Path(a.datos) / "prechecks" / c["precheck"]
        reg = registro(car)
        falt = faltantes(car)
        lec = lectura(c, verdad)
        j = je.medir(c, externas)
        r = ref.get(c["plano"])
        dif = []
        if r:
            for rid, d in c["ia"].items():
                dr = r["ia"].get(rid)
                fin_ref = dr.get("decision") if dr else r["motor"].get(rid)
                if fin_ref and fin_ref != "REQUIERE_REVISION" and fin_ref != d.get("decision"):
                    dif.append(f"{rid}: DeepSeek {d.get('decision')} / {a.referencia} {fin_ref}")
        print(f"## {c['plano']} ({c['precheck']})")
        print(f"- Presupuesto: {reg['llamadas']} llamadas, {reg['usd']} USD, {reg['tokens_entrada_media']} tokens de entrada por llamada (máx. {reg['tokens_entrada_max']}), herramientas {reg['herramientas']}"
              f"{'; CERRÓ POR TOPE' if reg['cerro_por_tope'] else ''}{'; cerró sin reevaluar' if reg['sin_reevaluar'] else ''}{'; aviso de escritura' if reg['aviso_escritura'] else ''}.")
        print(f"- Cobertura: faltan {len(falt)} datos pedidos" + (f": {', '.join(falt[:25])}{'…' if len(falt) > 25 else ''}" if falt else "."))
        n = sum(len(v) for v in lec.values()) or 1
        print(f"- Lectura (verdad ampliada, {n} datos): {len(lec['acierto'])} aciertos, {len(lec['duda'])} dudas, {len(lec['error'])} errores, {len(lec['falta'])} faltan.")
        if lec["error"]:
            print(f"  - errores: {'; '.join(lec['error'])}")
        if lec["duda"]:
            print(f"  - dudas: {'; '.join(lec['duda'])}")
        if a.detalle and lec["falta"]:
            print(f"  - faltan: {'; '.join(x.split('=')[0] for x in lec['falta'])}")
        print(f"- Dictamen: {len(c['ia'])} decisiones; contradice al motor {len(j['contradicciones'])}; información requerida {j['informacion_requerida']} (en reglas del plano: {len(j['externas_sin_ir'])} externas sin estado); "
              f"difiere de {a.referencia} en {len(dif)} reglas" + ("" if r else f" (sin corrida de {a.referencia})") + ".")
        if dif:
            cont = Counter(x.split(': ')[1] for x in dif)
            print(f"  - patrones: {dict(cont.most_common(6))}")
            if a.detalle:
                for x in dif[:30]:
                    print(f"  - {x}")
        print()


if __name__ == "__main__":
    main()
