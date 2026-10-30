#!/usr/bin/env python3
"""Estabilidad de las revisiones con IA: cuánto coinciden entre sí las corridas de un mismo plano.

Lee (solo lectura) web/.data/proyectos y web/.data/prechecks/*/dictamen.json. Proyectos de prueba:
«<Plano> - prueba [N] con <Modelo> [(k)]». Cada plano se mide por grupo de rondas (`grupos` de docs/demo/rondas.json;
una ronda sin grupo va sola), con todas sus corridas y aparte solo entre repeticiones del mismo modelo:

  solapamiento de hallazgos = hallazgos que coinciden / hallazgos distintos de las dos corridas (promedio de los pares).
    Los tipificados (HALLAZGO-<MAYÚSCULAS>) coinciden por id; los numéricos (HALLAZGO-3), por similitud de palabras
    del título (umbral 0.6, igual que `parecido` en web/src/features/compare/lib/comparacion.ts).
  acuerdo en catálogo = de las reglas del catálogo que decidieron las dos corridas, en qué parte dicen lo mismo.

Uso: python scripts/reporte_estabilidad.py [--datos web/.data] [--catalogo docs/demo/rondas.json] [--salida docs/demo/estabilidad.md]
"""
import argparse
import itertools
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analisis.nombres import CATALOGO, etiqueta_grupo, grupo_de, grupos_de_rondas  # noqa: E402

UMBRAL = 0.6
SIN_VALOR = {"de", "del", "la", "las", "el", "los", "y", "o", "a", "al", "en", "por", "con", "sin", "no", "se", "su", "un", "una", "para", "que", "todos", "todas"}
RONDA = re.compile(r"^(?P<plano>.+?) - prueba(?: (?P<n>\d+))? con (?P<modelo>.+?)(?: \((?P<repeticion>\d+)\))?$")
TIPIFICADO = re.compile(r"^HALLAZGO-[A-Z]")


def normalizar(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def raices(titulo: str) -> set:
    return {w[:5] for w in normalizar(titulo).split() if len(w) > 2 and w not in SIN_VALOR}


def parecido(a: str, b: str) -> float:
    ra, rb = raices(a), raices(b)
    menor = min(len(ra), len(rb))
    return 0.0 if menor < 2 else len(ra & rb) / menor


def mismo_hallazgo(h1, h2) -> bool:
    t1, t2 = bool(TIPIFICADO.match(h1[0])), bool(TIPIFICADO.match(h2[0]))
    if t1 and t2:
        return h1[0] == h2[0]
    if t1 or t2:
        return False
    return parecido(h1[1], h2[1]) >= UMBRAL


def emparejar(a, b) -> int:
    usados, n = set(), 0
    for h in a:
        for j, g in enumerate(b):
            if j not in usados and mismo_hallazgo(h, g):
                usados.add(j)
                n += 1
                break
    return n


def cargar(datos: Path, grupos: dict | None = None):
    """{(plano, rondas del grupo): [corrida]} con las corridas que tienen dictamen y la IA terminada."""
    grupos = grupos or {}
    rondas = defaultdict(list)
    for f in sorted((datos / "proyectos").glob("prj-web-*.json")):
        try:
            p = json.loads(f.read_text(encoding="utf8"))["project"]
        except (ValueError, KeyError, TypeError, AttributeError):  # proyecto vacío o a medio escribir
            continue
        m = RONDA.match(p["name"])
        if not m or not p.get("precheckId"):
            continue
        carpeta = datos / "prechecks" / p["precheckId"]
        try:
            d = json.loads((carpeta / "dictamen.json").read_text(encoding="utf8"))["decisiones"]
            e = json.loads((carpeta / "estado.json").read_text(encoding="utf8"))
        except (OSError, ValueError, KeyError):
            continue
        if (e.get("ia") or {}).get("status") != "done":
            continue
        cat = {x["regla_id"]: x["decision"] for x in d if not str(x["regla_id"]).startswith("HALLAZGO")}
        hall = [(x["regla_id"], x.get("titulo") or "", x["decision"]) for x in d if str(x["regla_id"]).startswith("HALLAZGO")]
        marcas = sum(len(ev.get("marcas") or []) for x in d for ev in (x.get("evidencia") or []))
        n = int(m["n"] or 1)
        rondas[(m["plano"], grupo_de(n, grupos))].append(
            dict(modelo=m["modelo"], ronda=n, repeticion=int(m["repeticion"] or 1), decisiones=len(d), cat=cat, hall=hall, marcas=marcas, aviso=(e["ia"].get("aviso") or None))
        )
    return rondas


def medir(corridas, mismo_modelo=False):
    """(solapamiento de hallazgos, acuerdo en catálogo); con `mismo_modelo`, solo los pares de repeticiones del mismo modelo."""
    sol, acu = [], []
    for a, b in itertools.combinations(corridas, 2):
        if mismo_modelo and a["modelo"] != b["modelo"]:
            continue
        n = emparejar(a["hall"], b["hall"])
        union = len(a["hall"]) + len(b["hall"]) - n
        if union:
            sol.append(n / union)
        comunes = set(a["cat"]) & set(b["cat"])
        if comunes:
            acu.append(sum(a["cat"][k] == b["cat"][k] for k in comunes) / len(comunes))
    media = lambda v: sum(v) / len(v) if v else None
    return media(sol), media(acu)


def pct(v):
    return "—" if v is None else f"{round(v * 100)} %"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--datos", default=str(Path(__file__).resolve().parent.parent / "web" / ".data"))
    ap.add_argument("--catalogo", default=str(CATALOGO), help="docs/demo/rondas.json (grupos de rondas)")
    ap.add_argument("--salida", default=None, help="archivo .md donde escribir la tabla")
    args = ap.parse_args(argv)
    rondas = cargar(Path(args.datos), grupos_de_rondas(Path(args.catalogo)))
    if not rondas:
        print("No hay corridas terminadas con dictamen.", file=sys.stderr)
        return 1
    lineas = ["# Estabilidad de las revisiones con IA", "", "Generado por `scripts/reporte_estabilidad.py` (solo lectura de `web/.data`). Preliminar y no oficial.", "",
              "| Plano | Rondas | Corridas | Solapamiento de hallazgos | Acuerdo en catálogo | Acuerdo entre repeticiones | Hallazgos por corrida | Con aviso de superficial |",
              "|---|---|---|---|---|---|---|---|"]
    for (plano, grupo), corridas in sorted(rondas.items()):
        sol, acu = medir(corridas)
        _, rep = medir(corridas, mismo_modelo=True)
        por = " / ".join(str(len(c["hall"])) for c in corridas)
        avisos = sum(1 for c in corridas if c["aviso"])
        lineas.append(f"| {plano} | {etiqueta_grupo(grupo)} | {len(corridas)} | {pct(sol)} | {pct(acu)} | {pct(rep)} | {por} | {avisos} |")
    texto = "\n".join(lineas) + "\n"
    print(texto)
    if args.salida:
        Path(args.salida).write_text(texto, encoding="utf8")
        print(f"Escrito {args.salida}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
