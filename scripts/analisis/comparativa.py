"""Comparativa de modelos sobre las mismas rondas: tabla plano × modelo con la media y el rango de exactitud, las
contradicciones motor–IA, el costo y los minutos; la regla de decisión de DeepSeek frente al modelo de referencia; y el
efecto de las rondas de variantes (DeepSeek solo) frente a las rondas base.

Lee web/.data/rondas-metricas.json (lo genera scripts/analisis/rondas.py; con --regenerar se vuelve a generar antes).

  python scripts/analisis/comparativa.py --rondas 43,44,45 --variantes 46,47,48 --salida docs/demo/comparativa-14oct.md

Regla de decisión (fijada antes de lanzar, 13-oct): DeepSeek «se compara bien» en un plano si en todas sus corridas queda
a ≤ 5 puntos de la media de Sonnet y si entre sus corridas varía ≤ 3 puntos. El costo de DeepSeek se cuenta a precio de
lista en el registro; DeepSeek factura ≈ 4 veces menos (comprobado en el saldo), y aquí se muestran los dos.
"""
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
METRICAS_PRINCIPAL = Path(r"~\servidor_app_util\precheck-mupa-informe\web\.data\rondas-metricas.json")
ESCANEADOS = {"Casco Antiguo"}
FACTOR_REAL_DEEPSEEK = 4
MARGEN_PUNTOS = 5
VARIACION_PUNTOS = 3


def lista_rondas(texto: str) -> list[int]:
    return [int(x) for x in texto.split(",") if x.strip()]


def corridas_de(metricas: dict, rondas: list[int]) -> list[dict]:
    """Corridas terminadas con lectura medida, de esas rondas, con el número de ronda anotado."""
    out = []
    for r in metricas.get("rondas", []):
        if r.get("ronda") not in rondas:
            continue
        for c in r.get("corridas", []):
            if c.get("terminada") and (c.get("lectura") or {}).get("exactitud") is not None:
                out.append({**c, "ronda": r["ronda"]})
    return out


def media(xs: list[float]) -> float | None:
    xs = [x for x in xs if isinstance(x, (int, float))]
    return sum(xs) / len(xs) if xs else None


def pts(x: float | None) -> str:
    return "—" if x is None else f"{round(100 * x)}"


def pct(x: float | None) -> str:
    return "—" if x is None else f"{round(100 * x)} %"


def celda(cs: list[dict]) -> dict:
    """Resumen de una celda plano × modelo."""
    ex = [c["lectura"]["exactitud"] for c in cs]
    usd = media([c.get("usd") for c in cs])
    return {
        "n": len(cs),
        "media": media(ex),
        "min": min(ex) if ex else None,
        "max": max(ex) if ex else None,
        "variacion": round(100 * (max(ex) - min(ex))) if ex else None,
        "contradicciones": sum((c.get("dictamen") or {}).get("contradiceMotor", 0) for c in cs),
        "externas_sin_ir": sum((c.get("dictamen") or {}).get("externasSinEstado", 0) for c in cs),
        "usd": usd,
        "minutos": media([c.get("minutos") for c in cs]),
        "rondas": sorted(c["ronda"] for c in cs),
    }


def tabla(cs: list[dict]) -> dict[str, dict[str, dict]]:
    """plano → modelo → celda."""
    por = defaultdict(lambda: defaultdict(list))
    for c in cs:
        por[c["plano"]][c["modelo"]].append(c)
    return {p: {m: celda(l) for m, l in ms.items()} for p, ms in por.items()}


def global_por_modelo(t: dict[str, dict[str, dict]]) -> dict[str, dict]:
    """Media por modelo sobre los planos vectoriales (los escaneados aparte) y costo/minutos medios."""
    acc = defaultdict(lambda: {"vectoriales": [], "escaneados": [], "usd": [], "minutos": [], "contradicciones": 0, "n": 0})
    for plano, ms in t.items():
        for modelo, c in ms.items():
            a = acc[modelo]
            (a["escaneados"] if plano in ESCANEADOS else a["vectoriales"]).append(c["media"])
            a["usd"].append(c["usd"])
            a["minutos"].append(c["minutos"])
            a["contradicciones"] += c["contradicciones"]
            a["n"] += c["n"]
    return {m: {"vectoriales": media(a["vectoriales"]), "escaneados": media(a["escaneados"]), "usd": media(a["usd"]),
                "minutos": media(a["minutos"]), "contradicciones": a["contradicciones"], "n": a["n"]} for m, a in acc.items()}


def decision_deepseek(t: dict[str, dict[str, dict]], deepseek: str, referencia: str) -> dict[str, dict]:
    """Por plano: ¿DeepSeek queda a ≤ MARGEN_PUNTOS de la media de la referencia en todas sus corridas y varía ≤ VARIACION_PUNTOS?"""
    out = {}
    for plano, ms in t.items():
        d, r = ms.get(deepseek), ms.get(referencia)
        if not d or not r or d["media"] is None or r["media"] is None:
            out[plano] = {"veredicto": None, "motivo": "faltan corridas"}
            continue
        distancia = round(100 * (r["media"] - d["min"]))
        cerca = distancia <= MARGEN_PUNTOS
        estable = d["variacion"] is not None and d["variacion"] <= VARIACION_PUNTOS
        out[plano] = {"veredicto": cerca and estable, "distancia": distancia, "variacion": d["variacion"],
                      "motivo": ("se compara bien" if cerca and estable else
                                 f"queda a {distancia} puntos de {referencia} en su peor corrida" if not cerca else
                                 f"varía {d['variacion']} puntos entre corridas")}
    return out


def efecto_variantes(metricas: dict, base: list[int], variantes: list[int], modelo: str) -> dict[int, dict]:
    """Para cada ronda de variante: media por plano del modelo frente a su media en las rondas base (delta en puntos)."""
    tb = tabla(corridas_de(metricas, base))
    out = {}
    for v in variantes:
        tv = tabla(corridas_de(metricas, [v]))
        planos = {}
        for plano, ms in tv.items():
            c = ms.get(modelo)
            b = (tb.get(plano) or {}).get(modelo)
            if c:
                planos[plano] = {"media": c["media"], "n": c["n"], "usd": c["usd"],
                                 "delta": round(100 * (c["media"] - b["media"])) if b and b["media"] is not None else None}
        deltas = [p["delta"] for p in planos.values() if p["delta"] is not None]
        out[v] = {"planos": planos, "delta_medio": round(media(deltas), 1) if deltas else None}
    return out


def usd_txt(modelo: str, usd: float | None) -> str:
    if usd is None:
        return "—"
    if modelo.lower().startswith("deepseek"):
        return f"{usd:.2f} lista (≈ {usd / FACTOR_REAL_DEEPSEEK:.2f} real)"
    return f"{usd:.2f} cuota"


def markdown(metricas: dict, base: list[int], variantes: list[int], deepseek: str, referencia: str) -> str:
    cs = corridas_de(metricas, base)
    t = tabla(cs)
    modelos = sorted({c["modelo"] for c in cs}, key=lambda m: (m.lower().startswith("deepseek"), m))
    g = global_por_modelo(t)
    dec = decision_deepseek(t, deepseek, referencia)
    L = [f"# Comparativa de modelos · rondas {', '.join(map(str, base))}", "",
         f"Corridas terminadas con lectura medida: {len(cs)} (verdad: {metricas.get('verdad', {}).get('datos', '?')} datos; generado {metricas.get('generado', '?')}).",
         "", "## Resumen por modelo (media de las medias por plano)", "",
         "| Modelo | Corridas | Vectoriales | Escaneado | Contradicciones | USD por revisión | Minutos |", "|---|---|---|---|---|---|---|"]
    for m in sorted(g, key=lambda m: -(g[m]["vectoriales"] or 0)):
        a = g[m]
        L.append(f"| {m} | {a['n']} | {pct(a['vectoriales'])} | {pct(a['escaneados'])} | {a['contradicciones']} | {usd_txt(m, a['usd'])} | {round(a['minutos']) if a['minutos'] is not None else '—'} |")
    L += ["", "## Plano × modelo (media, rango entre corridas, contradicciones motor–IA)", ""]
    for plano in sorted(t):
        L += [f"### {plano}{' (escaneado)' if plano in ESCANEADOS else ''}", "",
              "| Modelo | n | Media | Mín–máx | Variación (pts) | Contradicciones | Externas sin IR | USD | Min |", "|---|---|---|---|---|---|---|---|---|"]
        for m in modelos:
            c = t[plano].get(m)
            if not c:
                continue
            L.append(f"| {m} | {c['n']} | {pct(c['media'])} | {pts(c['min'])}–{pts(c['max'])} | {c['variacion']} | {c['contradicciones']} | {c['externas_sin_ir']} | {usd_txt(m, c['usd'])} | {round(c['minutos']) if c['minutos'] is not None else '—'} |")
        L.append("")
    L += [f"## ¿{deepseek} se compara bien con {referencia}? (≤ {MARGEN_PUNTOS} puntos en todas las corridas y ≤ {VARIACION_PUNTOS} de variación)", "",
          "| Plano | Veredicto | Distancia en la peor corrida | Variación | Motivo |", "|---|---|---|---|---|"]
    for plano in sorted(dec):
        d = dec[plano]
        v = "—" if d["veredicto"] is None else ("sí" if d["veredicto"] else "no")
        L.append(f"| {plano} | {v} | {d.get('distancia', '—')} | {d.get('variacion', '—')} | {d['motivo']} |")
    if variantes:
        ev = efecto_variantes(metricas, base, variantes, deepseek)
        L += ["", f"## Variantes de {deepseek} (delta en puntos frente a las rondas base)", "",
              "| Ronda | " + " | ".join(sorted(t)) + " | Delta medio |", "|---|" + "---|" * (len(t) + 1)]
        for v in variantes:
            e = ev.get(v) or {"planos": {}, "delta_medio": None}
            celdas = []
            for plano in sorted(t):
                p = e["planos"].get(plano)
                celdas.append("—" if not p else f"{pts(p['media'])} % ({'+' if (p['delta'] or 0) > 0 else ''}{p['delta']})")
            L.append(f"| {v} | " + " | ".join(celdas) + f" | {e['delta_medio'] if e['delta_medio'] is not None else '—'} |")
    return "\n".join(L) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rondas", required=True, help="rondas base, p. ej. 43,44,45")
    ap.add_argument("--variantes", default="", help="rondas de variantes de DeepSeek, p. ej. 46,47,48")
    ap.add_argument("--metricas", default=str(RAIZ / "web" / ".data" / "rondas-metricas.json"))
    ap.add_argument("--regenerar", action="store_true", help="correr antes scripts/analisis/rondas.py")
    ap.add_argument("--deepseek", default="DeepSeek Flash")
    ap.add_argument("--referencia", default="Sonnet 5.5")
    ap.add_argument("--salida", help="archivo .md; sin él, imprime")
    a = ap.parse_args()
    metricas_ruta = Path(a.metricas)
    if not metricas_ruta.exists():
        metricas_ruta = METRICAS_PRINCIPAL
    if a.regenerar:
        import subprocess
        subprocess.run([sys.executable, str(Path(__file__).with_name("rondas.py")), "--salida", str(metricas_ruta)], check=True)
    metricas = json.loads(metricas_ruta.read_text(encoding="utf-8"))
    md = markdown(metricas, lista_rondas(a.rondas), lista_rondas(a.variantes), a.deepseek, a.referencia)
    if a.salida:
        Path(a.salida).write_text(md, encoding="utf-8")
        print(f"→ {a.salida}", file=sys.stderr)
    else:
        sys.stdout.reconfigure(encoding="utf-8")
        print(md)


if __name__ == "__main__":
    main()
