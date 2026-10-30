#!/usr/bin/env python3
"""Consolida la revisión por familias de ADR-0017 en una clasificación por regla, la lista de disputas y los errores.

Lee docs/revision-catalogo/adr0017/:
  preclasificacion.json      grupos de reglas con la misma cita (scripts/preclasificar_severidad.py)
  revision/F*.json           el veredicto de cada subagente por grupo (INSTRUCCIONES-REVISION.md)
  decisiones-daniel.json     opcional: lo que Daniel decidió en las disputas, por grupo
                             {"F1-0004": {"severidad": …, "subsanacion": …, "criterio": …, "fundamento": {…}, "nota": …,
                                          "tipos": {"<id>": "criterio"}}}   (todo opcional: pisa solo lo que trae)
  decisiones-aclaraciones.json  opcional, mismo formato: disputas que resuelve una aclaración ya tomada
                             (INSTRUCCIONES-REVISION.md, «Aclaraciones»); Daniel manda sobre ellas

Un error de contenido {"tipo": "tipo", "tipo_correcto": …} corrige el tipo de esa regla: se valida con el tipo nuevo y
la fila de clasificacion-firme.json lleva "tipo" para que el script de aplicación lo cambie.

Para cada grupo toma el veredicto de la revisión (o la decisión de Daniel, que manda) y lo valida con
precheck/reglas/firmeza.py: valores, invariantes y fundamento literal. Un grupo queda en disputa si el subagente lo
marcó, si no pasa la validación o si falta su veredicto; en ese caso sus reglas no entran a la clasificación.

Escribe clasificacion-firme.json (una fila por regla firme), DISPUTAS.md y errores-contenido.json.
Uso: python scripts/consolidar_severidad.py
Sale con 1 si queda alguna disputa sin resolver (el script de aplicación no escribe nada en ese caso).
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
from precheck.reglas.firmeza import TIPOS, cargar_textos, errores_de_firmeza  # noqa: E402

DIR = RAIZ / "docs" / "revision-catalogo" / "adr0017"
CAMPOS = ("severidad", "subsanacion", "fundamento")
MARCA_ADR0017 = "(2026-10-20, ADR-0017)"   # va en la nota de la versión que aplica la clasificación


def version_previa(regla):
    """La versión que revisó la clasificación: si la regla ya lleva la nota de ADR-0017, es la anterior (idempotencia)."""
    v = int(regla.get("version") or 1)
    return v - 1 if MARCA_ADR0017 in (regla.get("nota") or "") else v


def leer(ruta, defecto):
    return json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else defecto


def reglas_por_id(raiz=RAIZ):
    return {r["id"]: r for p in sorted((raiz / "reglas").glob("*.json")) for r in json.loads(p.read_text(encoding="utf-8"))}


def veredictos(dir_=DIR):
    v = {}
    for p in sorted((dir_ / "revision").glob("F*.json")):
        for x in leer(p, []):
            v[x["grupo"]] = x
    return v


def tipos_corregidos(veredicto, decision):
    """{id: tipo} de los errores de contenido «tipo» con tipo_correcto válido; la decisión manda."""
    tipos = {e["id"]: e["tipo_correcto"] for e in (veredicto or {}).get("errores_contenido") or []
             if e.get("tipo") == "tipo" and e.get("tipo_correcto") in TIPOS}
    tipos.update((decision or {}).get("tipos") or {})
    return tipos


def consolidar(raiz=RAIZ, dir_=DIR):
    grupos = leer(dir_ / "preclasificacion.json", [])
    revision = veredictos(dir_)
    daniel = leer(dir_ / "decisiones-daniel.json", {})
    aclaraciones = leer(dir_ / "decisiones-aclaraciones.json", {})
    reglas = reglas_por_id(raiz)
    textos = cargar_textos(raiz)
    firmes, disputas, errores = [], [], []
    for g in grupos:
        v = revision.get(g["grupo"])
        for e in (v or {}).get("errores_contenido") or []:
            errores.append({"grupo": g["grupo"], **e})
        origen, decision = next(((o, d[g["grupo"]]) for o, d in (("daniel", daniel), ("aclaracion", aclaraciones))
                                 if g["grupo"] in d), ("revision", None))
        tipos = tipos_corregidos(v, decision)
        fuente = {**(v or {}), **decision} if decision else v
        if fuente is None:
            disputas.append({"grupo": g, "motivo": "sin veredicto de la revisión", "veredicto": None})
            continue
        if not decision and fuente.get("disputa"):
            disputas.append({"grupo": g, "motivo": f"disputa ({fuente['disputa'].get('tipo')}): {fuente['disputa'].get('explicacion')}",
                             "veredicto": fuente})
            continue
        fundamento = dict(fuente.get("fundamento") or {})
        if decision and decision.get("criterio") and "fundamento" not in decision:
            fundamento["criterio"] = decision["criterio"]   # la decisión cambia el criterio y conserva la cita
        fundamento.setdefault("criterio", fuente.get("criterio"))
        propuesta = {"severidad": fuente.get("severidad"), "subsanacion": fuente.get("subsanacion"), "fundamento": fundamento}
        fallos = {}
        for rid in g["ids"]:
            r = reglas.get(rid)
            if r is None:
                fallos[rid] = ["la regla ya no está en el catálogo"]
                continue
            err = errores_de_firmeza({**r, **({"tipo": tipos[rid]} if rid in tipos else {}), **propuesta}, textos)
            if err:
                fallos[rid] = err
        if fallos:
            motivo = "; ".join(sorted({e for es in fallos.values() for e in es}))
            disputas.append({"grupo": g, "motivo": f"no pasa la validación: {motivo}", "veredicto": fuente})
            continue
        for rid in g["ids"]:
            firmes.append({"id": rid, "version": version_previa(reglas[rid]), "grupo": g["grupo"], "origen": origen,
                           **propuesta, **({"tipo": tipos[rid]} if rid in tipos else {}),
                           "nota_revision": fuente.get("nota")})
    return firmes, disputas, errores


def escribir_disputas(disputas, ruta):
    por_familia = defaultdict(list)
    for d in disputas:
        por_familia[d["grupo"]["familia_nombre"]].append(d)
    lineas = ["# Disputas de la revisión de severidad (ADR-0017)", "",
              f"{len(disputas)} grupos ({sum(len(d['grupo']['ids']) for d in disputas)} reglas) sin resolver. "
              "Cada uno se resuelve en `decisiones-daniel.json` por su código de grupo.", ""]
    for fam, ds in sorted(por_familia.items()):
        lineas += [f"## {fam}", ""]
        for d in ds:
            g, v = d["grupo"], d["veredicto"] or {}
            lineas += [f"### {g['grupo']} · {g['titulo']}",
                       f"- Reglas ({len(g['ids'])}): {', '.join(g['ids'][:6])}{' …' if len(g['ids']) > 6 else ''}",
                       f"- Cita: «{g['cita'][:300]}»",
                       f"- Hoy: {g['severidad_actual']}. Script: {g['propuesta']['severidad']} / {g['propuesta']['subsanacion']} ({g['propuesta']['criterio']}).",
                       f"- Revisión: {v.get('severidad')} / {v.get('subsanacion')} ({v.get('criterio')}).",
                       f"- Motivo: {d['motivo']}", ""]
    ruta.write_text("\n".join(lineas), encoding="utf-8")


def main():
    firmes, disputas, errores = consolidar()
    (DIR / "clasificacion-firme.json").write_text(json.dumps(firmes, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (DIR / "errores-contenido.json").write_text(json.dumps(errores, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    escribir_disputas(disputas, DIR / "DISPUTAS.md")
    print(f"firmes: {len(firmes)} reglas; disputas: {len(disputas)} grupos ({sum(len(d['grupo']['ids']) for d in disputas)} reglas); "
          f"errores de contenido: {len(errores)}")
    print("severidad:", dict(Counter(f["severidad"] for f in firmes)))
    print("subsanación:", dict(Counter(f["subsanacion"] for f in firmes)))
    print("motivos de disputa:", dict(Counter(d["motivo"].split(":")[0] for d in disputas)))
    return 1 if disputas else 0


if __name__ == "__main__":
    sys.exit(main())
