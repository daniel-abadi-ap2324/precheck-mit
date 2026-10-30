#!/usr/bin/env python3
"""Métricas de TODAS las rondas de corridas con IA, para la página de rondas de la web (web/.data/rondas-metricas.json).

Una corrida es un proyecto «<Plano> - prueba N con <Modelo>» (desacuerdos.NOMBRE; los nombres sin número, «prueba con …» e
«IA …», son la ronda 1). Por corrida: costo (USD a precio de lista, última línea con total_cost_usd de ia.log.jsonl, como
costos.py) y minutos (costos.minutos), lectura contra la verdad comprobada a mano (exactitud.nodo/calificar; la verdad son
`planos` + `planos_v3`/`planos_v4`… como `exactitud.py --con-v3`; los `retirados` no cuentan y la lista `ambiguos` no es
verdad: sus claves solo cuentan si un `planos*` las resolvió con criterio), dictamen (jerarquia.medir: contradicciones con el
motor, información requerida, documentos externos sin ese estado) y, en DeepSeek, llamadas y tokens por llamada
(deepseek_diagnostico.registro). Las corridas sin dictamen salen con terminada=false y métricas null.

Solo lee web/.data; escribe un único archivo (--salida).

Uso: python scripts/analisis/rondas.py [--datos web/.data] [--salida web/.data/rondas-metricas.json]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DATOS_PRINCIPAL = Path(r"~\servidor_app_util\precheck-mupa-informe\web\.data")
VERDAD = "docs/demo/verdad-datos-disputados.json"
#: Nombre corto de cada modelo (ids de web/src/server/ia/config.ts), como NOMBRE_MODELO de web/src/lib/corridas-prueba.ts.
NOMBRE_MODELO = {"claude-haiku-5-5": "Haiku 5.5", "claude-sonnet-5-5": "Sonnet 5.5", "claude-opus-5-5": "Opus 5.5",
                 "claude-fable-5-1": "Fable 5.1", "deepseek-flash": "DeepSeek Flash"}


def _modulo(nombre: str):
    spec = importlib.util.spec_from_file_location(f"rondas_{nombre}", Path(__file__).with_name(f"{nombre}.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


de = _modulo("desacuerdos")
ex = _modulo("exactitud")
co = _modulo("costos")
je = _modulo("jerarquia")
ds = _modulo("deepseek_diagnostico")


def aviso(msg: str) -> None:
    print(f"aviso: {msg}", file=sys.stderr)


def cargar_verdad(ruta: Path) -> dict[str, dict]:
    """{plano: {clave: valor_esperado}} con `planos` + `planos_v*`, sin los `retirados`."""
    doc = json.loads(ruta.read_text(encoding="utf-8"))
    verdad = {p: dict(v) for p, v in doc.get("planos", {}).items()}
    for clave in sorted(k for k in doc if k.startswith("planos_v")):
        for plano, extra in doc[clave].items():
            verdad.setdefault(plano, {}).update(extra)
    for plano, ret in (doc.get("retirados") or {}).items():
        for k in (ret if isinstance(ret, (dict, list)) else []):
            verdad.get(plano, {}).pop(k, None)
    return {p: {k: (e["valor_esperado"] if isinstance(e, dict) and "valor_esperado" in e else e) for k, e in v.items()}
            for p, v in verdad.items()}


def usd(car: Path) -> float | None:
    """Como costos.py: el total_cost_usd de la última línea que lo trae en ia.log.jsonl (sirve también para DeepSeek)."""
    ult = None
    f = car / "ia.log.jsonl"
    if f.exists():
        for linea in f.read_text(encoding="utf-8", errors="replace").splitlines():
            if "total_cost_usd" not in linea:
                continue
            try:
                x = json.loads(linea)
            except Exception:  # noqa: BLE001
                continue
            if isinstance(x, dict) and x.get("total_cost_usd") is not None:
                ult = x["total_cost_usd"]
    return ult


def _corridas_tolerantes(datos: Path) -> tuple[dict[str, dict], set[str]]:
    """Las corridas con dictamen de desacuerdos.corridas, indexadas por precheck. Si una carpeta rota la hace fallar, se
    rehace proyecto a proyecto con la misma lógica (_una_corrida); devuelve también los precheck de las carpetas rotas."""
    try:
        return {c["precheck"]: c for c in de.corridas(datos, "", None, 1, None, alias=False)}, set()
    except Exception as e:  # noqa: BLE001
        aviso(f"desacuerdos.corridas falló ({e!r}); se lee proyecto a proyecto")
    out, rotas = {}, set()
    for f in sorted((datos / "proyectos").glob("*.json")):
        pr = (de.leer(f) or {}).get("project") or {}
        try:
            c = _una_corrida(datos, pr)
        except Exception as e:  # noqa: BLE001
            aviso(f"{pr.get('name') or f.name}: carpeta rota, se salta ({e!r})")
            rotas.add(pr.get("precheckId"))
            continue
        if c:
            out[c["precheck"]] = c
    return out, rotas


def _una_corrida(datos: Path, pr: dict) -> dict | None:
    """Lo mismo que desacuerdos.corridas para un solo proyecto (desde="", min_decisiones=1, alias=False)."""
    m = de.NOMBRE.match(pr.get("name", ""))
    if not m or not pr.get("precheckId"):
        return None
    car = datos / "prechecks" / pr["precheckId"]
    dic, res = de.leer(car / "dictamen.json"), de.leer(car / "resultado.json")
    if not dic or not res or len(dic.get("decisiones", [])) < 1:
        return None
    return dict(plano=m["plano"], nombre=pr["name"], modelo=m["modelo"], fecha=dic.get("fecha", "")[:16],
                precheck=pr["precheckId"], motor={x["regla_id"]: x["resultado"] for x in res.get("resultados", [])},
                ia={x["regla_id"]: x for x in dic.get("decisiones", [])}, lote=de.leer(car / "lote.json") or {},
                hechos=de.leer(car / "hechos.json") or de.leer(car / "lote.json") or {})


def lectura(c: dict, verdad: dict[str, dict]) -> dict | None:
    esperado = verdad.get(c["plano"]) or verdad.get(de.ALIAS.get(c["plano"], c["plano"]))
    if not esperado:
        return None
    detalle = {k: ex.calificar(ex.nodo(c["hechos"], k), v) for k, v in esperado.items()}
    cuenta = {r: sum(1 for x in detalle.values() if x == r) for r in ("acierto", "duda", "error", "falta")}
    total = len(detalle)
    return {"total": total, "aciertos": cuenta["acierto"], "dudas": cuenta["duda"], "errores": cuenta["error"],
            "faltan": cuenta["falta"], "exactitud": round(cuenta["acierto"] / total, 2) if total else None, "detalle": detalle}


def corrida(pr: dict, ronda: int, plano: str, modelo: str, car: Path, c: dict | None, verdad: dict, externas: set) -> dict:
    if not car.exists():  # proyecto creado en la cola que nunca llegó a ejecutarse (o cuya carpeta se borró)
        estado = {"ia": {"error": "sin carpeta del precheck: la corrida no llegó a ejecutarse"}}
    else:
        estado = de.leer(car / "estado.json")
        if not isinstance(estado, dict):
            raise ValueError("estado.json ausente o ilegible")
    ia = estado.get("ia") or {}
    proveedor = ia.get("proveedor")
    # Enrutamiento (19-oct PRECHECK_DEEPSEEK_ENRUTAR; desde el 26-oct, modeloEscaneados de ia.json): se muestra el modelo
    # que corrió (`ia.modelo`), no el pedido. Las corridas del 19-oct guardaban Sonnet en `ia.modelo`.
    if ia.get("enrutado"):
        modelo = f"{NOMBRE_MODELO.get(ia.get('modelo'), ia.get('modelo') or 'Sonnet 5.5')} (enrutado)"
    out = {"plano": plano, "modelo": modelo, "proveedor": proveedor, "enrutado": ia.get("enrutado"), "precheckId": pr["precheckId"], "projectId": pr.get("id"),
           "fecha": estado.get("updatedAt") or pr.get("updatedAt"), "terminada": c is not None,
           "error": None, "usd": None, "minutos": None, "decisiones": None, "lectura": None, "dictamen": None, "deepseek": None}
    if c is None:
        out["error"] = ia.get("error") or (f"estado de la IA: {ia['status']}" if ia.get("status") else "sin dictamen")
        return out
    if ia.get("status") not in (None, "done"):
        out["error"] = ia.get("error") or f"estado de la IA: {ia['status']}"
    u, mins = usd(car), co.minutos(car / "ia.log.txt")
    j = je.medir(c, externas)
    out.update(usd=round(u, 2) if u is not None else None, minutos=round(mins) if mins is not None else None,
               decisiones=len(c["ia"]), lectura=lectura(c, verdad),
               dictamen={"contradiceMotor": len(j["contradicciones"]), "informacionRequerida": j["informacion_requerida"],
                         "externasSinEstado": len(j["externas_sin_ir"])})
    if proveedor == "deepseek-api":
        r = ds.registro(car)
        out["deepseek"] = {"llamadas": r["llamadas"], "tokensEntradaMedia": r["tokens_entrada_media"]}
    return out


def generar(datos: Path, verdad_ruta: Path, reglas: dict | None = None) -> dict:
    verdad = cargar_verdad(verdad_ruta)
    externas = je.reglas_externas(de.reglas_por_id() if reglas is None else reglas)
    con_dictamen, rotas = _corridas_tolerantes(datos)
    rondas: dict[int, list] = {}
    vistos = set()
    for f in sorted((datos / "proyectos").glob("*.json")):
        try:
            pr = (json.loads(f.read_text(encoding="utf-8")) or {}).get("project") or {}
        except Exception as e:  # noqa: BLE001
            aviso(f"{f.name}: proyecto ilegible, se salta ({e!r})")
            continue
        m = de.NOMBRE.match(pr.get("name", ""))
        if not m:
            continue
        if not pr.get("precheckId"):
            aviso(f"{pr.get('name')}: sin precheckId, se salta")
            continue
        if pr["precheckId"] in vistos or pr["precheckId"] in rotas:
            continue
        vistos.add(pr["precheckId"])
        ronda = int(m["ronda"]) if m["ronda"] else 1
        car = datos / "prechecks" / pr["precheckId"]
        try:
            rondas.setdefault(ronda, []).append(
                corrida(pr, ronda, m["plano"], m["modelo"], car, con_dictamen.get(pr["precheckId"]), verdad, externas)
                | {"repeticion": int(m["repeticion"] or 1)})
        except Exception as e:  # noqa: BLE001
            aviso(f"{pr.get('name')} ({pr['precheckId']}): carpeta rota, se salta ({e!r})")
    salida_rondas = []
    for n in sorted(rondas):
        cs = sorted(rondas[n], key=lambda x: (x["plano"], x["modelo"], x["repeticion"], x["fecha"] or ""))
        fechas = [x["fecha"][:10] for x in cs if x["fecha"]]
        salida_rondas.append({"ronda": n, "fecha": min(fechas) if fechas else None, "corridas": cs})
    todas = [x for r in salida_rondas for x in r["corridas"]]
    return {"version": 1, "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "verdad": {"datos": sum(len(v) for v in verdad.values()), "archivo": VERDAD},
            "rondas": salida_rondas,
            "planos": sorted({x["plano"] for x in todas}), "modelos": sorted({x["modelo"] for x in todas})}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", default=str(RAIZ / "web" / ".data"))
    ap.add_argument("--salida", help="por defecto <datos>/rondas-metricas.json")
    ap.add_argument("--verdad", default=str(RAIZ / VERDAD))
    a = ap.parse_args()
    datos = Path(a.datos)
    if not (datos / "proyectos").exists():  # los worktrees no tienen datos: se lee la copia principal
        datos = DATOS_PRINCIPAL
    t0 = time.time()
    res = generar(datos, Path(a.verdad))
    salida = Path(a.salida) if a.salida else datos / "rondas-metricas.json"
    salida.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    n = sum(len(r["corridas"]) for r in res["rondas"])
    print(f"{len(res['rondas'])} rondas, {n} corridas, {res['verdad']['datos']} datos de verdad; "
          f"{time.time() - t0:.1f} s → {salida}", file=sys.stderr)


if __name__ == "__main__":
    main()
