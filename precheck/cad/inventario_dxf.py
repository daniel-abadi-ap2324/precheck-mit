#!/usr/bin/env python3
"""Inventario de un DXF: unidades, capas, tipos de entidad, bloques y textos.

Uso: inventario_dxf.py plano.dxf [--json]
Requiere: pip install ezdxf
"""
import collections
import hashlib
import json
import os
import sys

import ezdxf

UNIDADES = {0: "sin unidades", 1: "pulgadas", 2: "pies", 4: "mm", 5: "cm", 6: "m"}


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        sys.exit(__doc__)
    if not os.path.isfile(sys.argv[1]):
        sys.exit(f"No existe el archivo: {sys.argv[1]}")
    ruta = sys.argv[1]
    doc = ezdxf.readfile(ruta)
    msp = doc.modelspace()
    por_capa = collections.defaultdict(collections.Counter)
    bloques = collections.Counter()
    textos = []
    for e in msp:
        por_capa[e.dxf.layer][e.dxftype()] += 1
        if e.dxftype() == "INSERT":
            bloques[e.dxf.name] += 1
        elif e.dxftype() in ("TEXT", "MTEXT") and len(textos) < 200:
            t = e.plain_text() if e.dxftype() == "MTEXT" else e.dxf.text
            textos.append({"capa": e.dxf.layer, "texto": t.strip()[:120]})
    ins = doc.header.get("$INSUNITS", 0)
    inv = {
        "archivo": ruta,
        "sha256": hashlib.sha256(open(ruta, "rb").read()).hexdigest(),
        "version_dxf": doc.dxfversion,
        "unidades": {"codigo": ins, "nombre": UNIDADES.get(ins, f"otro ({ins})")},
        "capas": {c: dict(t) for c, t in sorted(por_capa.items())},
        "bloques_insertados": dict(bloques.most_common()),
        "xrefs": [b.name for b in doc.blocks if getattr(b.block, "is_xref", False)],
        "layouts": [lay.name for lay in doc.layouts],
        "muestra_textos": textos,
    }
    if "--json" in sys.argv:
        print(json.dumps(inv, indent=2, ensure_ascii=False))
        return
    print(f"{ruta}  DXF {inv['version_dxf']}  unidades: {inv['unidades']['nombre']}")
    print("\nCapas:")
    for c, t in inv["capas"].items():
        print(f"  {c:30s} " + ", ".join(f"{k}:{v}" for k, v in t.items()))
    print("\nBloques insertados:", inv["bloques_insertados"] or "ninguno")
    if inv["xrefs"]:
        print("XREF no procesadas:", inv["xrefs"])
    print("\nTextos (muestra):")
    for t in textos[:40]:
        print(f"  [{t['capa']}] {t['texto']}")


if __name__ == "__main__":
    main()
