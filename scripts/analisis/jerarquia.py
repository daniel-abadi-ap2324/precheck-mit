#!/usr/bin/env python3
"""Jerarquía motor → IA y documentos externos, por corrida: cuántas decisiones de la IA contradicen una regla que el motor ya
había decidido (la web no las aplica: prevalece el motor), cuántas quedaron en INFORMACION_REQUERIDA y cuántas OBSERVACION
sin ese estado caen sobre reglas cuyo único dato es un documento ajeno al plano (expediente.*, registro_publico.*).

Es la métrica de la tanda 7 (13-oct-2026): mide el dictamen como producto, no la lectura de datos.

Uso: python scripts/analisis/jerarquia.py --rondas 35,36 [--detalle]
"""
from __future__ import annotations

import argparse
import importlib.util
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("desacuerdos", Path(__file__).with_name("desacuerdos.py"))
de = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(de)

DECIDIDO = {"CUMPLE", "NO_CUMPLE", "NO_APLICA"}
EXTERNO = re.compile(r"^(expediente\.|registro_publico\.)")
CONTEXTO = re.compile(r"^(tramite|lote\.norma_aplicable|lote\.codigo_zona|lote\.sf_sector|lote\.sf_unidad_territorial|expediente\.fecha_presentacion)$")


def reglas_externas(reglas: dict) -> set[str]:
    """Reglas cuyos datos (sin el contexto) son todos de un documento ajeno al plano (misma regla que dictamen-normalizar.ts)."""
    out = set()
    for rid, r in reglas.items():
        datos = [e for e in (r.get("entradas") or []) + (r.get("entradas_opcionales") or []) if not CONTEXTO.match(e)]
        if datos and all(EXTERNO.match(e) for e in datos):
            out.add(rid)
    return out


def medir(c: dict, externas: set[str]) -> dict:
    contra, ir, ext_sin_ir = [], 0, []
    for rid, d in c["ia"].items():
        m = c["motor"].get(rid)
        if m in DECIDIDO and m != d.get("decision"):
            contra.append(f"{rid} (IA {d.get('decision')}, motor {m})")
        if d.get("estado") == "INFORMACION_REQUERIDA":
            ir += 1
        elif rid in externas and d.get("decision") in ("OBSERVACION", "NO_CUMPLE"):
            ext_sin_ir.append(rid)
    return dict(decisiones=len(c["ia"]), contradicciones=contra, informacion_requerida=ir, externas_sin_ir=ext_sin_ir)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rondas", required=True)
    ap.add_argument("--datos", default=r"~\servidor_app_util\precheck-mupa-informe\web\.data")
    ap.add_argument("--desde", default="2026-10-01")
    ap.add_argument("--detalle", action="store_true")
    a = ap.parse_args()
    rondas = {int(r) for r in a.rondas.split(",")}
    externas = reglas_externas(de.reglas_por_id())
    filas = []
    for c in de.corridas(Path(a.datos), a.desde, None, min_decisiones=1, rondas=rondas, alias=False):
        filas.append((c, medir(c, externas)))
    print("| Plano | Modelo | Decisiones | Contradicen al motor | Información requerida | Documento externo sin ese estado |")
    print("|---|---|---|---|---|---|")
    tot = dict(decisiones=0, contradicciones=0, informacion_requerida=0, externas_sin_ir=0)
    for c, m in sorted(filas, key=lambda x: (x[0]["plano"], x[0]["modelo"])):
        print(f"| {c['plano']} | {c['modelo']} | {m['decisiones']} | {len(m['contradicciones'])} | {m['informacion_requerida']} | {len(m['externas_sin_ir'])} |")
        tot["decisiones"] += m["decisiones"]
        tot["contradicciones"] += len(m["contradicciones"])
        tot["informacion_requerida"] += m["informacion_requerida"]
        tot["externas_sin_ir"] += len(m["externas_sin_ir"])
        if a.detalle:
            for x in m["contradicciones"]:
                print(f"|  | contradice | {x} | | | |")
            for x in m["externas_sin_ir"]:
                print(f"|  | externa sin IR | {x} | | | |")
    n = len(filas) or 1
    print(f"\nTotal en {len(filas)} corridas: {tot['contradicciones']} contradicciones ({tot['contradicciones'] / n:.1f} por corrida), "
          f"{tot['informacion_requerida']} en información requerida, {tot['externas_sin_ir']} documentos externos sin ese estado.")


if __name__ == "__main__":
    main()
