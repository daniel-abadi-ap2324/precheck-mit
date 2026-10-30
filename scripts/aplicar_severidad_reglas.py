#!/usr/bin/env python3
"""Aplica al catálogo la clasificación firme de ADR-0017 (docs/revision-catalogo/adr0017/clasificacion-firme.json).

Por cada regla pone severidad, subsanacion y fundamento, y sube a version + 1 con la nota
«Versión N (FECHA, ADR-0017): severidad …; subsanación …; criterio … («cita»)». La cita_textual no cambia.

Idempotente, con el patrón de scripts/aplicar_correcciones_reglas.py:
  - si la regla está en la versión de la clasificación, se aplica;
  - si ya está en la versión siguiente con la nota de ADR-0017, se omite;
  - si está en otra versión, se rechaza.
Antes de escribir valida todo con precheck/reglas/firmeza.py y validar() de aplicar_correcciones_reglas. No escribe
nada si queda una disputa sin resolver, si falta alguna regla del catálogo en la clasificación o si algo falla.
Cada archivo conserva su sangría.

Uso: python scripts/aplicar_severidad_reglas.py [--simular]
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "scripts"))
from aplicar_catalogo_definitivo import escribir, leer, textos_normativa  # noqa: E402
from aplicar_correcciones_reglas import validar  # noqa: E402
from consolidar_severidad import MARCA_ADR0017 as MARCA, consolidar  # noqa: E402
from precheck.reglas.firmeza import cargar_textos, errores_de_firmeza  # noqa: E402


def nota_de(c):
    f = c["fundamento"]
    cita = f["cita"] if len(f["cita"]) <= 120 else f["cita"][:117] + "…"
    return (f"severidad «{c['severidad']}»; subsanación «{c['subsanacion']}»; criterio {f['criterio']} («{cita}», "
            f"{f['archivo']})")


def con_campos(regla, c):
    """La regla con los tres campos justo después de severidad, en el orden de siempre."""
    r = {}
    for k, v in regla.items():
        if k in ("subsanacion", "fundamento"):
            continue
        r[k] = v
        if k == "severidad":
            r["severidad"] = c["severidad"]
            r["subsanacion"] = c["subsanacion"]
            r["fundamento"] = c["fundamento"]
    return r


def aplicar_clasificacion(regla, c):
    """(regla nueva, estado) con estado 'aplicada', 'ya_aplicada' o un mensaje de rechazo."""
    actual = int(regla.get("version") or 1)
    if actual == c["version"] + 1 and MARCA in (regla.get("nota") or ""):
        return regla, "ya_aplicada"
    if actual != c["version"]:
        return regla, f"está en versión {actual} y la clasificación espera la {c['version']}: no se toca"
    r = con_campos(regla, c)
    r["version"] = actual + 1
    texto = f"Versión {actual + 1} {MARCA}: {nota_de(c)}"
    if c.get("tipo") and c["tipo"] != regla.get("tipo"):
        r["tipo"] = c["tipo"]
        texto += f"; tipo «{regla.get('tipo')}» corregido a «{c['tipo']}»"
    r["nota"] = (r["nota"] + " | " if r.get("nota") else "") + texto
    return r, "aplicada"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--simular", action="store_true")
    a = ap.parse_args(argv)
    firmes, disputas, _ = consolidar()
    if disputas:
        print(f"Quedan {len(disputas)} grupos en disputa (DISPUTAS.md): no se escribe nada.")
        return 1
    clasif = {c["id"]: c for c in firmes}
    textos_cita = textos_normativa(RAIZ)
    textos = cargar_textos(RAIZ)
    archivos, estados, errores = {}, Counter(), []
    vistos = set()
    for p in sorted((RAIZ / "reglas").glob("*.json")):
        datos, sangria = leer(p)
        nuevos = []
        for regla in datos:
            vistos.add(regla["id"])
            c = clasif.get(regla["id"])
            if c is None:
                errores.append(f"{regla['id']}: no está en la clasificación firme")
                nuevos.append(regla)
                continue
            r, estado = aplicar_clasificacion(regla, c)
            if estado not in ("aplicada", "ya_aplicada"):
                errores.append(f"{regla['id']}: {estado}")
            else:
                errores += [f"{r['id']}: {e}" for e in validar(r, textos_cita) + errores_de_firmeza(r, textos)]
            estados[estado if estado in ("aplicada", "ya_aplicada") else "rechazada"] += 1
            nuevos.append(r)
        archivos[p] = (nuevos, sangria)
    errores += [f"{rid}: en la clasificación pero no en el catálogo" for rid in clasif.keys() - vistos]
    print(dict(estados))
    if errores:
        print(f"{len(errores)} errores; no se escribe nada:")
        for e in errores[:40]:
            print("  ", e)
        return 1
    if a.simular:
        print("Simulación: no se escribió nada.")
        return 0
    for p, (datos, sangria) in archivos.items():
        escribir(p, datos, sangria)
    print("Catálogo actualizado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
