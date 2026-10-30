#!/usr/bin/env python3
"""Datos que piden las reglas que el motor evaluó AHORA para un plano (no una lista fija).

Cada regla declara sus `entradas` en reglas/*.json. Este script toma las reglas de `resultado.json` de la carpeta del caso
(las que el motor evaluó con los datos de ese momento), junta sus entradas y dice cuáles ya están escritas en `lote.json` y
cuáles faltan. Úsese después de cada reevaluación del motor: al escribir datos pueden volverse aplicables reglas nuevas que
piden datos nuevos; se repite hasta que no falte ninguno.

Se omiten los datos que no salen del plano (norma, zona, trámite, expediente, registro público).

Uso: python scripts/datos_pedidos.py <carpeta del caso> [--reglas reglas] [--json]
Sale con código 1 si falta algún dato.
"""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

AJENO = re.compile(r"^(lote\.norma_aplicable|lote\.codigo_zona|tramite|expediente\.|registro_publico\.|solicita_uso_acera$)")


def claves_escritas(lote: dict) -> set:
    """Claves con punto de los hechos escritos en lote.json (hechos con forma {valor, confianza})."""
    salida = set()

    def recorrer(x, pre=""):
        if isinstance(x, dict):
            if "valor" in x and "confianza" in x:
                salida.add(pre)
                return
            for k, v in x.items():
                recorrer(v, f"{pre}.{k}" if pre else k)

    recorrer(lote)
    return salida


def reglas_que_piden(resultado: dict) -> tuple[set, list]:
    """(reglas cuyas entradas se piden, datos que deciden si aplican las demás).

    Una regla NO_APLICA no pide sus entradas, ni una que quedó en revisión porque no se sabe si aplica (`causa.en` =
    «aplica_si»): de esa se pide el dato que lo decide (si falta). Así un dato sí/no de un requisito que no existe (la
    rampa de un proyecto sin rampas) deja de pedirse y la IA no tiene que elegir entre «sí» y «no» para decir «no
    aplica» (ADR-0018)."""
    aplican, de_alcance = set(), []
    for r in resultado.get("resultados", []):
        if not r.get("regla_id") or r.get("resultado") == "NO_APLICA":
            continue
        causa = r.get("causa") or {}
        if causa.get("en") == "aplica_si":
            if causa.get("tipo") == "faltante" and causa.get("campo"):
                de_alcance.append(causa["campo"])
            continue
        aplican.add(r["regla_id"])
    return aplican, de_alcance


def datos_pedidos(carpeta: Path, reglas: Path, universales: bool = True):
    """[(clave, cuántas reglas la usan, escrita)] ordenado por uso."""
    resultado = json.loads((carpeta / "resultado.json").read_text(encoding="utf8"))
    aplican, de_alcance = reglas_que_piden(resultado)
    entradas = {}
    for f in sorted(reglas.glob("*.json")):
        catalogo = json.loads(f.read_text(encoding="utf8"))
        if isinstance(catalogo, list):
            for r in catalogo:
                if r.get("id") in aplican and isinstance(r.get("entradas"), list):
                    # entradas_opcionales: datos que la condición lee solo en una rama de un «or»; también se piden.
                    entradas[r["id"]] = r["entradas"] + list(r.get("entradas_opcionales") or [])
    cuenta = Counter()
    for lista in entradas.values():
        for e in set(lista):
            if not AJENO.match(e):
                cuenta[e] += 1
    for campo in de_alcance:
        if not AJENO.match(campo):
            cuenta[campo] += 1
    # Datos universales de todo anteproyecto (Acuerdo 110, Anexos III y IV): se piden aunque ninguna regla aplicable los use.
    if universales:
        try:
            for d in json.loads((Path(__file__).parent / "datos_universales.json").read_text(encoding="utf8"))["datos"]:
                cuenta.setdefault(d["clave"], 0)
        except (OSError, ValueError, KeyError):
            pass
    lote = {}
    if (carpeta / "lote.json").exists():
        lote = json.loads((carpeta / "lote.json").read_text(encoding="utf8"))
    escritas = claves_escritas(lote)
    # Finca única o varias fincas son alternativas: según `lote.cantidad_fincas` solo se pide una de las dos.
    cantidad = ((lote.get("lote") or {}).get("cantidad_fincas") or {}).get("valor")
    if isinstance(cantidad, (int, float)) and not isinstance(cantidad, bool):
        cuenta.pop("lote.finca" if cantidad > 1 else "lote.fincas", None)
    return [(k, n, k in escritas) for k, n in sorted(cuenta.items(), key=lambda x: (-x[1], x[0]))]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("carpeta")
    ap.add_argument("--reglas", default=str(Path(__file__).resolve().parent.parent / "reglas"))
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--sin-universales", action="store_true", help="solo los datos que piden las reglas que aplican (sin la lista universal de scripts/datos_universales.json)")
    a = ap.parse_args(argv)
    filas = datos_pedidos(Path(a.carpeta), Path(a.reglas), not a.sin_universales)
    faltan = [k for k, _, ok in filas if not ok]
    if a.json:
        print(json.dumps({"pedidos": [{"clave": k, "reglas": n, "escrita": ok} for k, n, ok in filas], "faltan": faltan}, ensure_ascii=False))
    else:
        for k, n, ok in filas:
            print(f"{'OK    ' if ok else 'FALTA '}{k}  ({n} reglas)")
        print(f"{len(filas) - len(faltan)}/{len(filas)} datos escritos en lote.json" + ("" if not faltan else f"; faltan {len(faltan)}"))
    return 1 if faltan else 0


if __name__ == "__main__":
    sys.exit(main())
