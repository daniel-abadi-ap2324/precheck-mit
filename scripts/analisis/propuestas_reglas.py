#!/usr/bin/env python3
"""Propuestas de reglas nuevas que dejaron las revisiones con IA, juntas para el equipo de reglas.

En el paso 1 de la revisión la IA puede aplicar un permiso especial (nota de la DPU, resolución, excepción) que el
catálogo no recoge; el motor lo aplica con su cita comprobada y guarda la regla que lo recogería en
`propuestas_reglas.json` de la carpeta del PreCheck. Este script las junta de todas las carpetas, agrupa las que
proponen lo mismo (mismo título o misma condición, sin tildes ni mayúsculas) y dice en cuántas corridas y con qué
modelos apareció cada una, con su fuente. No cambia nada: reglas/ solo se modifica con el gobierno de reglas.

Uso:
  python scripts/analisis/propuestas_reglas.py [--datos web/.data] [--json salida.json]
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def _clave(p: dict) -> str:
    texto = str(p.get("condicion") or p.get("titulo") or "")
    sin_tildes = "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", sin_tildes).strip()


def _leer(ruta: Path):
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def juntar(datos: Path) -> list[dict]:
    grupos: dict[str, dict] = {}
    for archivo in sorted((datos / "prechecks").glob("*/propuestas_reglas.json")):
        carpeta = archivo.parent
        propuestas = _leer(archivo)
        if not isinstance(propuestas, list):
            continue
        ia = (_leer(carpeta / "estado.json") or {}).get("ia") or {}
        for p in propuestas:
            if not isinstance(p, dict) or not _clave(p):
                continue
            g = grupos.setdefault(_clave(p), {"titulo": p.get("titulo"), "aplica_si": p.get("aplica_si"), "condicion": p.get("condicion"), "corridas": []})
            fuente = p.get("fuente") or {}
            g["corridas"].append({"precheck": carpeta.name, "modelo": ia.get("modelo"), "permiso": p.get("permiso"),
                                  "documento": fuente.get("documento"), "pagina": fuente.get("pagina"), "cita": fuente.get("cita")})
    return sorted(grupos.values(), key=lambda g: (-len(g["corridas"]), str(g["titulo"])))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--datos", type=Path, default=RAIZ / "web" / ".data")
    ap.add_argument("--json", type=Path)
    a = ap.parse_args(argv)
    grupos = juntar(a.datos)
    if a.json:
        a.json.write_text(json.dumps(grupos, ensure_ascii=False, indent=1), encoding="utf-8")
    if not grupos:
        print("Sin propuestas de reglas en", a.datos / "prechecks")
        return 0
    for g in grupos:
        modelos = sorted({c["modelo"] or "?" for c in g["corridas"]})
        print(f"- {g['titulo'] or '(sin título)'} — {len(g['corridas'])} corrida(s): {', '.join(modelos)}")
        if g["aplica_si"]:
            print(f"    aplica_si: {g['aplica_si']}")
        if g["condicion"]:
            print(f"    condición: {g['condicion']}")
        c = g["corridas"][0]
        print(f"    fuente: {c['documento']}, p. {c['pagina']}: «{c['cita']}»")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
