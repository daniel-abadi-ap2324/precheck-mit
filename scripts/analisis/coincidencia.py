#!/usr/bin/env python3
"""Coincidencia de un modelo con Opus y Fable en el mismo plano: datos leídos y decisiones por regla.

La referencia son las corridas de Opus y Fable de las rondas de --ref. En cada plano:
- «consenso» de un dato: todas las corridas de referencia (Opus y Fable) escribieron el mismo valor (los números, con
  tolerancia). Un dato sin consenso no cuenta para la coincidencia con el consenso.
- coincidencia con Opus / con Fable: el valor de la corrida es igual al valor más repetido de ese modelo.
- decisiones: misma decisión final por regla que el consenso (reglas en que todas las corridas de referencia decidieron
  lo mismo, con los estados de acuerdo_pares.DECIDIDO; sin hallazgos propios).
- exactitud contra la verdad (docs/demo/verdad-datos-disputados.json), sin contar como fallo los «posibles errores de la
  verdad»: datos en que el consenso de Opus y Fable (con al menos 2 corridas de referencia) contradice la verdad.

Solo lee web/.data y la verdad. Uso:
  python scripts/analisis/coincidencia.py --ref 59,60 --grupo r61=61 --grupo r62=62 [--modelos DeepSeek] [--json salida.json]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DATOS = Path(r"~\servidor_app_util\precheck-mupa-informe\web\.data")
REFERENCIAS = ("Opus", "Fable")
# Datos que no se leen del plano (los fija el trámite, el usuario o el expediente): DeepSeek no puede escribirlos por
# diseño y Claude a veces sí. No cuentan para la coincidencia. Igual que DATOS_AJENOS_AL_PLANO de web/src/server/ia/pendientes.ts.
AJENOS = re.compile(r"^(lote\.norma_aplicable|lote\.codigo_zona|tramite|expediente\.|registro_publico\.|solicita_uso_acera$)")


def _modulo(nombre: str):
    spec = importlib.util.spec_from_file_location(f"coin_{nombre}", Path(__file__).with_name(f"{nombre}.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


de = _modulo("desacuerdos")
ap_ = _modulo("acuerdo_pares")
DECIDIDO = ap_.DECIDIDO


def aplanar(d, prefijo="") -> dict:
    """{ruta: valor} de cada nodo con «valor» del lote (lo que escribió la IA), sin los datos ajenos al plano."""
    out = {}
    if isinstance(d, dict):
        if "valor" in d and prefijo:
            if not AJENOS.match(prefijo):
                out[prefijo] = d["valor"]
        else:
            for k, v in d.items():
                out.update(aplanar(v, f"{prefijo}.{k}" if prefijo else k))
    return out


def _lista(x):
    """Lista de textos normalizada: ["a", "b"] y «a, b y c» (lote.fincas lo escriben de las dos formas)."""
    if isinstance(x, list) and all(isinstance(e, (str, int)) for e in x):
        return sorted(str(e).strip().casefold() for e in x)
    if isinstance(x, str) and ("," in x or " y " in x):
        return sorted(e.strip().casefold() for e in re.split(r",|\by\b", x) if e.strip())
    return None


def iguales(a, b, tol=None) -> bool:
    num = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool)
    if isinstance(a, list) or isinstance(b, list):
        la, lb = _lista(a), _lista(b)
        if la is not None and lb is not None:
            return la == lb
    if num(a) and num(b):
        t = tol if tol is not None else max(0.05, 0.02 * max(abs(a), abs(b)))
        return abs(a - b) <= t
    if isinstance(a, str) and isinstance(b, str):
        return a.strip().casefold() == b.strip().casefold()
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def moda(valores: list):
    """Valor más repetido (agrupando los iguales con tolerancia)."""
    grupos: list[list] = []
    for v in valores:
        for g in grupos:
            if iguales(g[0], v):
                g.append(v)
                break
        else:
            grupos.append([v])
    return max(grupos, key=len)[0] if grupos else None


def consenso(valores: list):
    """El valor si todos coinciden; si no, None. `valores` vacío: None."""
    if not valores or any(not iguales(valores[0], v) for v in valores[1:]):
        return None
    return valores[0]


def familia(modelo: str) -> str | None:
    return next((r for r in REFERENCIAS if modelo.startswith(r)), None)


def referencia_por_plano(refs: list[dict]) -> dict:
    """{plano: {"datos": {ruta: {"Opus": [...], "Fable": [...]}}, "decisiones": {rid: [...]}, "n": int}}."""
    out: dict = {}
    for c in refs:
        f = familia(c["modelo"])
        if not f:
            continue
        p = out.setdefault(c["plano"], {"datos": {}, "decisiones": {}, "n": 0, "por_familia": Counter()})
        p["n"] += 1
        p["por_familia"][f] += 1
        for ruta, v in aplanar(c["lote"]).items():
            p["datos"].setdefault(ruta, {}).setdefault(f, []).append(v)
        for rid in set(c["motor"]) | set(c["ia"]):
            if rid.startswith("HALLAZGO"):
                continue
            x = de.final(c, rid)
            if x in DECIDIDO:
                p["decisiones"].setdefault(rid, []).append(x)
    return out


def errores_de_verdad(ref: dict, verdad: dict, minimo: int = 2) -> list[dict]:
    """Datos en que Opus y Fable coinciden entre sí (todas sus corridas), contradicen la verdad y hay >= `minimo` corridas."""
    out = []
    for plano, claves in verdad.items():
        r = ref.get(plano)
        if not r:
            continue
        for clave, esperado in claves.items():
            por = r["datos"].get(clave, {})
            todos = [v for f in REFERENCIAS for v in por.get(f, [])]
            if len(todos) < minimo or not all(por.get(f) for f in REFERENCIAS):
                continue
            c = consenso(todos)
            esp = esperado["valor"] if isinstance(esperado, dict) else esperado
            tol = esperado.get("tol") if isinstance(esperado, dict) else None
            if c is not None and not iguales(c, esp, tol):
                out.append(dict(plano=plano, dato=clave, verdad=esp, opus_fable=c, corridas=len(todos)))
    return out


def medir(c: dict, r: dict, verdad_plano: dict, excluidos: set[str]) -> dict:
    datos = aplanar(c["lote"])
    cuenta = Counter()
    for ruta, v in datos.items():
        por = r["datos"].get(ruta, {})
        for f in REFERENCIAS:
            if por.get(f):
                cuenta[f"{f}_n"] += 1
                cuenta[f] += iguales(v, moda(por[f]))
        cons = consenso([x for f in REFERENCIAS for x in por.get(f, [])]) if all(por.get(f) for f in REFERENCIAS) else None
        if cons is not None:
            cuenta["cons_n"] += 1
            cuenta["cons"] += iguales(v, cons)
    dec_n = dec_ok = 0
    for rid, xs in r["decisiones"].items():
        if len(xs) < r["n"] or len(set(xs)) != 1:
            continue
        mia = de.final(c, rid)
        if mia not in DECIDIDO:
            continue
        dec_n += 1
        dec_ok += mia == xs[0]
    ver_n = ver_ok = 0
    for clave, esperado in verdad_plano.items():
        if clave in excluidos:
            continue
        nd = (c["hechos"] or {})
        for k in clave.split("."):
            nd = nd.get(k) if isinstance(nd, dict) else None
        esp = esperado["valor"] if isinstance(esperado, dict) else esperado
        tol = esperado.get("tol") if isinstance(esperado, dict) else None
        ver_n += 1
        ok = isinstance(nd, dict) and iguales(nd.get("valor"), esp, tol) and (nd.get("confianza") or 0) >= 0.85
        ver_ok += bool(ok)
    pct = lambda a, b: round(100 * a / b, 1) if b else None
    return dict(opus=pct(cuenta["Opus"], cuenta["Opus_n"]), fable=pct(cuenta["Fable"], cuenta["Fable_n"]),
                consenso=pct(cuenta["cons"], cuenta["cons_n"]), datos_consenso=cuenta["cons_n"],
                decisiones=pct(dec_ok, dec_n), reglas_consenso=dec_n, exactitud=pct(ver_ok, ver_n), escritos=len(datos))


def cargar_verdad(ruta: Path) -> dict:
    doc = json.loads(ruta.read_text(encoding="utf-8"))
    verdad = {p: dict(v) for p, v in doc.get("planos", {}).items()}
    for clave in sorted(k for k in doc if k.startswith("planos_v")):
        for plano, extra in doc[clave].items():
            verdad.setdefault(plano, {}).update(extra)
    for plano, ret in (doc.get("retirados") or {}).items():
        for k in (ret if isinstance(ret, (dict, list)) else []):
            verdad.get(plano, {}).pop(k, None)
    return {p: {k: (e["valor_esperado"] if isinstance(e, dict) and "valor_esperado" in e else e) for k, e in v.items()} for p, v in verdad.items()}


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--ref", required=True, help="rondas de referencia (Opus y Fable), separadas por coma")
    a.add_argument("--grupo", action="append", required=True, help="nombre=r1,r2")
    a.add_argument("--modelos", default="", help="solo estos modelos (prefijos separados por coma)")
    a.add_argument("--verdad", default=str(RAIZ / "docs" / "demo" / "verdad-datos-disputados.json"))
    a.add_argument("--datos", default=str(DATOS))
    a.add_argument("--json", help="además, escribe el resultado en este archivo")
    x = a.parse_args()
    datos = Path(x.datos)
    verdad = cargar_verdad(Path(x.verdad))
    refs = de.corridas(datos, "2026-10-01", None, 10, {int(r) for r in x.ref.split(",")}, alias=False)
    ref = referencia_por_plano(refs)
    dudosos = errores_de_verdad(ref, verdad)
    excl = {(d["plano"], d["dato"]) for d in dudosos}
    modelos = [m.strip() for m in x.modelos.split(",") if m.strip()]
    filas = []
    for g in x.grupo:
        nombre, rondas = g.split("=")
        for c in de.corridas(datos, "2026-10-01", None, 10, {int(r) for r in rondas.split(",")}, alias=False):
            if modelos and not any(c["modelo"].startswith(m) for m in modelos):
                continue
            r = ref.get(c["plano"])
            if not r:
                continue
            m = medir(c, r, verdad.get(c["plano"], {}), {k for p, k in excl if p == c["plano"]})
            filas.append(dict(grupo=nombre, plano=c["plano"], modelo=c["modelo"], fecha=c["fecha"], **m))
    print(f"Referencia: rondas {x.ref} ({len(refs)} corridas de Opus y Fable).\n")
    print("| Grupo | Plano | Modelo | Corridas | Datos escritos | Con Opus | Con Fable | Con consenso (datos) | Decisiones = consenso | Exactitud |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    clave = lambda f: (f["grupo"], f["plano"], f["modelo"])
    for k in sorted({clave(f) for f in filas}):
        fs = [f for f in filas if clave(f) == k]
        med = lambda campo: (lambda v: f"{sum(v) / len(v):.0f} %" if v else "—")([f[campo] for f in fs if f[campo] is not None])
        print(f"| {k[0]} | {k[1]} | {k[2]} | {len(fs)} | {sum(f['escritos'] for f in fs) / len(fs):.0f} | {med('opus')} | {med('fable')} | {med('consenso')} | {med('decisiones')} | {med('exactitud')} |")
    print("\nPosibles errores de la verdad (Opus y Fable coinciden entre sí y la contradicen):")
    for d in dudosos or [{"plano": "—", "dato": "ninguno", "verdad": "", "opus_fable": "", "corridas": 0}]:
        print(f"- {d['plano']} · {d['dato']}: verdad {d['verdad']!r}, Opus y Fable {d['opus_fable']!r} ({d['corridas']} corridas)")
    if x.json:
        Path(x.json).write_text(json.dumps(dict(filas=filas, posibles_errores_verdad=dudosos), ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
