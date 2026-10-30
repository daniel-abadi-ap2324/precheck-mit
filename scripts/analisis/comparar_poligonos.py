"""Compara las revisiones de Tocumen con y sin polígonos (rondas 18 y 19, Sonnet)."""
import json
import sys
from pathlib import Path

DATOS = Path(r"~\servidor_app_util\precheck-mupa-informe\web\.data\prechecks")
AQUI = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")  # carpeta con ronda18.json y ronda19.json (resúmenes de lote_ia.py)


def L(p):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def get(d, path):
    for k in path.split("."):
        if not isinstance(d, dict) or k not in d:
            return None
        d = d[k]
    return d.get("valor") if isinstance(d, dict) and "valor" in d else d


def costo(carpeta):
    ult = None
    f = carpeta / "ia.log.jsonl"
    if f.exists():
        for linea in f.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                x = json.loads(linea)
            except Exception:
                continue
            if isinstance(x, dict) and x.get("total_cost_usd") is not None:
                ult = x
    return (ult or {}).get("total_cost_usd"), ((ult or {}).get("duration_ms") or 0) / 60000


filas = []
for r in (18, 19):
    res = L(AQUI / f"ronda{r}.json") or {}
    for c in res.get("resumen", []):
        car = DATOS / c["precheck"]
        d = L(car / "dictamen.json") or {}
        lote = L(car / "lote.json") or {}
        dec = d.get("decisiones", [])
        por = {x["regla_id"]: x for x in dec}
        cnt = {}
        for x in dec:
            cnt[x["decision"]] = cnt.get(x["decision"], 0) + 1
        est = {k: v["decision"] for k, v in por.items() if "ESTACION" in k}
        texto = json.dumps(d, ensure_ascii=False)
        usd, mins = costo(car)
        filas.append(dict(
            ronda=r, plano=c["nombre"].split(" - ")[0], estado=c.get("estado"), usd=usd, min=round(mins, 1),
            decisiones=len(dec), cuenta=cnt, estacionamientos_regla=est,
            estacionamientos_dato=get(lote, "proyecto.estacionamientos"),
            ocupacion=get(lote, "proyecto.ocupacion_pct"),
            menciona_regiones=texto.count("regi"), discrepantes=len(d.get("regiones_discrepantes") or []),
            hallazgos=[(x["regla_id"], x["decision"]) for x in dec if x["regla_id"].startswith("HALLAZGO")],
            no_cumple=[(x["regla_id"], (x.get("justificacion") or "")[:160]) for x in dec if x["decision"] == "NO_CUMPLE"],
            est_just={k: (v.get("justificacion") or "")[:400] for k, v in por.items() if "ESTACION" in k},
        ))
json.dump(filas, sys.stdout, ensure_ascii=False, indent=1)
