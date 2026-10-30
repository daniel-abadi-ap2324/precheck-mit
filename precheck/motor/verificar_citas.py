#!/usr/bin/env python3
"""Comprueba que la cita_textual de cada regla aparezca literalmente en el texto de la norma.

Uso: verificar_citas.py reglas.json texto_norma.md
Ignora espacios, saltos de línea y asteriscos de markdown. Sale con código 1 si alguna cita no aparece:
una cita que no está en la norma indica una regla inventada o mal transcrita.
"""
import json
import re
import sys


def norm(s):
    return re.sub(r"[\s*]+", "", s)


def cita_en_normativa(cita, texto_normalizado):
    """True si la cita aparece literal (ignorando espacios y asteriscos) en el texto ya normalizado."""
    return bool(cita) and norm(cita) in texto_normalizado


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    reglas = json.load(open(sys.argv[1], encoding="utf-8"))
    texto = norm(open(sys.argv[2], encoding="utf-8").read())
    fallos = 0
    for r in reglas:
        cita = (r.get("fuente") or {}).get("cita_textual") or ""
        ok = cita_en_normativa(cita, texto)
        fallos += not ok
        print(("OK    " if ok else "FALTA ") + r["id"] + ("" if ok else f"  cita: {cita[:80]!r}"))
    print(f"{len(reglas) - fallos}/{len(reglas)} citas verificadas")
    sys.exit(1 if fallos else 0)


if __name__ == "__main__":
    main()
