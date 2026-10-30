#!/usr/bin/env python3
"""¿Evaluaron todos los modelos las mismas reglas? Compara `reglas_a_evaluar.json` (paso 1, ADR-0013) entre corridas.

Por cada plano del grupo de la ronda (`grupos` de docs/demo/rondas.json; una ronda sin grupo va sola): norma, zona, total de reglas vigentes, las que no se pudo determinar si aplican, las
exceptuadas por un permiso, lo que el motor aceptó o rechazó del alcance de la IA y los permisos con su cita. Después,
para cada par de corridas (modelo y repetición), cuántas reglas comparten y cuáles tiene solo una.

Uso:
  python scripts/analisis/consistencia_alcance.py --ronda 77 [--datos web/.data]
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

from nombres import etiqueta_grupo, grupo_de, grupos_de_rondas

RAIZ = Path(__file__).resolve().parents[2]
RONDA = re.compile(r"^(?P<plano>.+?) - prueba (?P<n>\d+) con (?P<modelo>.+?)(?: \((?P<repeticion>\d+)\))?$")


def _leer(ruta: Path):
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--ronda", type=int, required=True)
    ap.add_argument("--datos", type=Path, default=RAIZ / "web" / ".data")
    a = ap.parse_args(argv)
    grupo = grupo_de(a.ronda, grupos_de_rondas())
    if len(grupo) > 1:
        print(f"Rondas {etiqueta_grupo(grupo)} (el grupo de la ronda {a.ronda})")
    por_plano: dict[str, list] = defaultdict(list)
    for f in (a.datos / "proyectos").glob("prj-web-*.json"):
        p = (_leer(f) or {}).get("project") or {}
        m = RONDA.match(p.get("name", ""))
        if m and int(m["n"]) in grupo and p.get("precheckId"):
            rep = int(m["repeticion"] or 1)
            etiqueta = m["modelo"] + (f" (r{m['n']})" if len(grupo) > 1 else "") + (f" ({rep})" if rep > 1 else "")
            por_plano[m["plano"]].append((etiqueta, a.datos / "prechecks" / p["precheckId"]))
    for plano, corridas in sorted(por_plano.items()):
        print(f"\n## {plano}")
        listas = {}
        for modelo, carpeta in sorted(corridas):
            lista = _leer(carpeta / "reglas_a_evaluar.json")
            if not lista:
                print(f"- {modelo}: sin reglas_a_evaluar.json")
                continue
            listas[modelo] = {r["regla_id"] for r in lista["reglas"]}
            ia = lista.get("alcance_ia") or {}
            print(f"- {modelo}: norma {lista.get('norma_aplicable')}, zona {lista.get('codigo_zona')}, {lista.get('total')} reglas, "
                  f"sin determinar {len(lista.get('sin_determinar', []))}, exceptuadas {len(lista.get('exceptuadas', []))}, "
                  f"alcance de la IA {'sí' if ia.get('presente') else 'no'} ({len(ia.get('aplicado', []))} aplicados, {len(ia.get('errores', []))} rechazados)")
            for e in ia.get("errores", [])[:5]:
                print(f"    rechazado: {e[:160]}")
            for perm in lista.get("permisos", []):
                fuente = perm.get("fuente") or {}
                efectos = ", ".join(f"{e.get('accion')} {e.get('regla_id')}" for e in perm.get("efecto", []))
                print(f"    permiso {perm.get('id')} ({perm.get('tipo')}): «{str(fuente.get('cita'))[:120]}» ({fuente.get('documento')}, p. {fuente.get('pagina')}) — {efectos}")
        modelos = list(listas)
        for i, x in enumerate(modelos):
            for y in modelos[i + 1:]:
                solo_x, solo_y = sorted(listas[x] - listas[y]), sorted(listas[y] - listas[x])
                print(f"  {x} vs {y}: comparten {len(listas[x] & listas[y])}; solo {x} {len(solo_x)}; solo {y} {len(solo_y)}")
                for nombre, solo in ((x, solo_x), (y, solo_y)):
                    if solo:
                        print(f"    solo {nombre}: {', '.join(solo[:12])}{'…' if len(solo) > 12 else ''}")
    if not por_plano:
        print("Sin corridas de las rondas", etiqueta_grupo(grupo))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
