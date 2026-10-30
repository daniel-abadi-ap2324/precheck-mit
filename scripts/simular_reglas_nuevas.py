#!/usr/bin/env python3
"""Qué pasaría si unas reglas propuestas entraran al catálogo: evalúa con el motor (sin IA) los datos reales de corridas ya hechas.

Para cada PreCheck dado (carpeta en web/.data/prechecks) toma extraccion.json + lote.json (lo que la IA escribió), evalúa con el
catálogo actual y con el catálogo más las propuestas, y cuenta cuántas reglas nuevas aplican y en qué estado quedan. Solo lectura.

Uso: python scripts/simular_reglas_nuevas.py --propuestas "docs/propuestas/catalogo/reglas-nuevas-*.borrador.json" pck-... pck-...
"""
import argparse
import collections
import glob
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
from precheck.planos.revisar import a_hechos, cargar_reglas, combinar, evaluar  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("prechecks", nargs="+", help="ids de web/.data/prechecks")
    ap.add_argument("--propuestas", required=True, help="patrón glob de archivos de reglas propuestas")
    ap.add_argument("--datos", default=str(RAIZ / "web" / ".data"))
    ap.add_argument("--fecha", default="2026-10-07")
    a = ap.parse_args(argv)
    base = cargar_reglas()
    ids = {r["id"] for r in base}
    nuevas = []
    for f in sorted(glob.glob(a.propuestas)):
        d = json.loads(Path(f).read_text(encoding="utf-8"))
        nuevas += d.get("reglas", d) if isinstance(d, dict) else d
    nuevas = [r for r in nuevas if r["id"] not in ids]
    sev = {r["id"]: r.get("severidad") for r in nuevas}
    print(f"catálogo {len(base)} reglas; propuestas únicas {len(nuevas)}")
    for pid in a.prechecks:
        c = Path(a.datos) / "prechecks" / pid
        ext = json.loads((c / "extraccion.json").read_text(encoding="utf-8"))
        lote = json.loads((c / "lote.json").read_text(encoding="utf-8"))
        h = combinar(a_hechos(ext), lote)
        r0, r1 = evaluar(h, base, a.fecha), evaluar(h, base + nuevas, a.fecha)
        ids0 = {x["regla_id"] for x in r0["resultados"]}
        nu = [x for x in r1["resultados"] if x["regla_id"] not in ids0]
        print(f"\n== {pid}")
        print(f"   solo catálogo: {len(r0['resultados'])} aplicables {r0['resumen']}")
        print(f"   con propuestas: {len(r1['resultados'])} aplicables {r1['resumen']}")
        print(f"   nuevas que aplican: {len(nu)} {dict(collections.Counter(x['resultado'] for x in nu))} | bloqueantes: {sum(1 for x in nu if sev.get(x['regla_id']) == 'bloqueante')}")
        for x in nu:
            if x["resultado"] in ("CUMPLE", "NO_CUMPLE"):
                print(f"   - {x['resultado']}: {x['regla_id']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
