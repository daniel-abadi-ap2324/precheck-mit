#!/usr/bin/env python3
"""¿Las citas de la IA existen en la normativa? Revisa la `cita` de cada hallazgo propio (fuera del catálogo) de los dictámenes.

La IA escribe la cita como referencia más texto entre «…» (p. ej. «Acuerdo 110, Anexo III, num. 5: «Línea de construcción con sus
dimensiones.»»). Se toma el texto entre «…», se parte en fragmentos por «…» o «...» y cada fragmento (de 15 caracteres o más) debe
aparecer literal en algún texto de `normativa/` (sin tener en cuenta mayúsculas, tildes, espacios ni asteriscos).

Estados por hallazgo: VERIFICADA (todos los fragmentos aparecen), NO_ENCONTRADA (alguno no aparece: cita mal transcrita o inventada),
SIN_TEXTO_LITERAL (la cita solo trae una referencia, sin texto entre «…»: no se puede comprobar) y SIN_CITA.
Es una comprobación de coincidencia literal: no dice que la norma citada obligue a lo que el hallazgo afirma.

Uso: python scripts/verificar_citas_ia.py [--datos web/.data] [--salida docs/demo/citas-ia.md]
"""
import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MIN_FRAGMENTO = 15


def normalizar(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"[\s*_`­\-\[\]]+", "", s).lower()


def cargar_normativa(carpeta: Path) -> str:
    return "".join(normalizar(f.read_text(encoding="utf-8", errors="ignore")) for f in sorted(carpeta.rglob("*")) if f.suffix in (".md", ".txt"))


def fragmentos(cita: str) -> list[str]:
    """Textos literales de la cita: lo que va entre «…», partido por puntos suspensivos."""
    salida = []
    for m in re.finditer(r"«([^»]+)»", cita or ""):
        for parte in re.split(r"\[?\s*(?:…|\.{3})\s*\]?", m.group(1)):
            if len(normalizar(parte)) >= MIN_FRAGMENTO:
                salida.append(parte.strip())
    return salida


def estado_de(cita: str, normativa: str) -> tuple[str, list[str]]:
    if not (cita or "").strip():
        return "SIN_CITA", []
    frs = fragmentos(cita)
    if not frs:
        return "SIN_TEXTO_LITERAL", []
    faltan = [f for f in frs if normalizar(f) not in normativa]
    return ("NO_ENCONTRADA", faltan) if faltan else ("VERIFICADA", [])


def revisar(datos: Path, normativa: str) -> list[dict]:
    filas = []
    for f in sorted((datos / "proyectos").glob("prj-web-*.json")):
        p = json.loads(f.read_text(encoding="utf-8"))["project"]
        if not p.get("precheckId"):
            continue
        try:
            decisiones = json.loads((datos / "prechecks" / p["precheckId"] / "dictamen.json").read_text(encoding="utf-8"))["decisiones"]
        except (OSError, ValueError, KeyError):
            continue
        for d in decisiones:
            rid = str(d.get("regla_id", ""))
            if rid.startswith("HALLAZGO"):
                estado, faltan = estado_de(d.get("cita") or "", normativa)
                filas.append(dict(corrida=p["name"], regla_id=rid, estado=estado, faltan=faltan))
    return filas


def informe(filas: list[dict]) -> str:
    total = Counter(f["estado"] for f in filas)
    n = len(filas) or 1
    md = ["# ¿Las citas de la IA existen en la normativa?", "",
          "Generado por `scripts/verificar_citas_ia.py`. Comprobación de coincidencia **literal** del texto entre «…» de cada hallazgo propio de la IA con los textos de `normativa/`. No dice que la norma citada obligue a lo que el hallazgo afirma. Preliminar y no oficial.", "",
          f"**{len(filas)} hallazgos propios** en los dictámenes: " + ", ".join(f"{k} {v} ({100 * v // n} %)" for k, v in total.most_common()) + ".", ""]
    por = {}
    for f in filas:
        por.setdefault(f["regla_id"] if not re.fullmatch(r"HALLAZGO-\d+", f["regla_id"]) else "HALLAZGO-<n> (sin id fijo)", Counter())[f["estado"]] += 1
    md += ["| Hallazgo | Verificada | No encontrada | Sin texto literal | Sin cita |", "|---|---|---|---|---|"]
    for k, c in sorted(por.items(), key=lambda x: -sum(x[1].values())):
        md.append(f"| `{k}` | {c['VERIFICADA']} | {c['NO_ENCONTRADA']} | {c['SIN_TEXTO_LITERAL']} | {c['SIN_CITA']} |")
    malas = [f for f in filas if f["estado"] == "NO_ENCONTRADA"]
    if malas:
        md += ["", "## Citas que no aparecen en la normativa (primeras 15)", ""]
        for f in malas[:15]:
            md.append(f"- {f['corrida']} · `{f['regla_id']}`: «{f['faltan'][0][:140]}»")
    return "\n".join(md) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--datos", default=str(RAIZ / "web" / ".data"))
    ap.add_argument("--normativa", default=str(RAIZ / "normativa"))
    ap.add_argument("--salida", default=None)
    a = ap.parse_args(argv)
    filas = revisar(Path(a.datos), cargar_normativa(Path(a.normativa)))
    texto = informe(filas)
    if a.salida:
        Path(a.salida).write_text(texto, encoding="utf-8")
        print("Escrito", a.salida)
    else:
        print(texto)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
