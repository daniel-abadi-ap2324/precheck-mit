#!/usr/bin/env python3
"""Diagnóstico de la variación entre corridas de la IA: de dónde sale y qué parte es medición, cobertura o interpretación.

Solo lectura de web/.data (proyectos «<Plano> - prueba [N] con <Modelo>», sus dictamen.json, lote.json y la extracción del
plano). Escribe docs/demo/diagnostico-variacion-datos.md (la explicación para Josué está en diagnostico-variacion.md).

Secciones:
  1. Extracción automática: cuántos datos halla el extractor antes de que intervenga la IA.
  2. Cobertura: qué datos escribe cada corrida en lote.json (la IA los aporta cuando el extractor no los halla).
  3. Dispersión: cuánto cambia el valor de un mismo dato entre corridas (rango, mediana, coeficiente de variación).
  4. Reglas del catálogo en las que las corridas no coinciden.
  5. Hallazgos fuera del catálogo: núcleo (en al menos 2 de cada 3 corridas) y cola (en una sola).
  6. Por modelo y ronda.

Uso: python scripts/diagnostico_variacion.py [--datos web/.data] [--salida docs/demo/diagnostico-variacion-datos.md]
"""
import argparse
import importlib.util
import json
import re
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("reporte_estabilidad", RAIZ / "scripts" / "reporte_estabilidad.py")
reporte = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(reporte)
_spec2 = importlib.util.spec_from_file_location("datos_pedidos", RAIZ / "scripts" / "datos_pedidos.py")
pedidos_mod = importlib.util.module_from_spec(_spec2)
_spec2.loader.exec_module(pedidos_mod)

# Datos que una revisión completa debería tener (los que piden las reglas de retiros, densidad, ocupación y alturas).
LIMITE_REGLAS = 12
DATOS_CLAVE = [
    "lote.area_m2", "lote.frente_m", "lote.finca", "proyecto.pisos_totales", "proyecto.altura_m", "proyecto.unidades_vivienda",
    "proyecto.densidad_pers_ha", "proyecto.ocupacion_pct", "proyecto.area_libre_pct", "proyecto.retiro_frontal_m",
    "proyecto.retiro_lateral_m", "proyecto.retiro_posterior_m", "proyecto.estacionamientos",
]


def hechos_de(lote: dict) -> dict:
    """{«lote.area_m2»: (valor, confianza, método)} de un lote.json (hechos con forma {valor, confianza, fuente})."""
    salida = {}

    def recorrer(x, pre=""):
        if isinstance(x, dict):
            if "valor" in x and "confianza" in x:
                salida[pre] = (x["valor"], x["confianza"], (x.get("fuente") or {}).get("metodo"))
                return
            for k, v in x.items():
                recorrer(v, f"{pre}.{k}" if pre else k)

    recorrer(lote)
    return salida


def cargar_corridas(datos: Path):
    """Corridas con la IA terminada: plano, ronda, modelo, hechos que escribió, decisiones, hallazgos, extracción del plano."""
    corridas = []
    for f in sorted((datos / "proyectos").glob("prj-web-*.json")):
        try:
            p = json.loads(f.read_text(encoding="utf8"))["project"]
        except (ValueError, KeyError, TypeError, AttributeError):  # proyecto vacío o a medio escribir
            continue
        m = reporte.RONDA.match(p["name"])
        if not m or not p.get("precheckId"):
            continue
        carpeta = datos / "prechecks" / p["precheckId"]
        try:
            estado = json.loads((carpeta / "estado.json").read_text(encoding="utf8"))
            decisiones = json.loads((carpeta / "dictamen.json").read_text(encoding="utf8"))["decisiones"]
            lote = json.loads((carpeta / "lote.json").read_text(encoding="utf8"))
        except (OSError, ValueError, KeyError):
            continue
        if (estado.get("ia") or {}).get("status") != "done":
            continue
        extraccion = None
        for pid in estado.get("planIds", [])[:1]:
            try:
                extraccion = json.loads((datos / "planos" / pid / "extraccion.json").read_text(encoding="utf8"))
            except (OSError, ValueError):
                pass
        corridas.append(dict(
            plano=m["plano"], ronda=int(m["n"] or 1), modelo=m["modelo"], hechos=hechos_de(lote), extraccion=extraccion,
            decisiones_total=len(decisiones),
            pedidos=pedidos_de(carpeta),
            cat={x["regla_id"]: x for x in decisiones if not str(x["regla_id"]).startswith("HALLAZGO")},
            hall=[(x["regla_id"], x.get("titulo") or "", x["decision"]) for x in decisiones if str(x["regla_id"]).startswith("HALLAZGO")],
            marcas=sum(len(e.get("marcas") or []) for x in decisiones for e in (x.get("evidencia") or [])),
            aviso=bool((estado["ia"]).get("aviso")),
        ))
    return corridas


def pedidos_de(carpeta: Path) -> list:
    """Datos que piden las reglas que aplican al plano de la corrida (según su resultado.json final); vacío si no se pueden calcular."""
    try:
        return [k for k, _n, _escrita in pedidos_mod.datos_pedidos(carpeta, RAIZ / "reglas")]
    except (OSError, ValueError, KeyError):
        return []


def fraccion(c) -> float:
    """Qué parte de los datos que piden las reglas de su plano escribió la corrida (con los 13 fijos si no se conocen)."""
    claves = c["pedidos"] or DATOS_CLAVE
    return sum(1 for k in claves if k in c["hechos"]) / len(claves)


def numero(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def cv(valores):
    m = statistics.mean(valores)
    return statistics.pstdev(valores) / m if m else 0.0


def nucleo_y_cola(corridas):
    """Agrupa los hallazgos de las corridas (mismo criterio que el reporte de estabilidad) y cuenta en cuántas corridas aparece cada grupo."""
    grupos = []  # cada grupo: dict(titulo, ids, corridas:set)
    for i, c in enumerate(corridas):
        for h in c["hall"]:
            for g in grupos:
                if reporte.mismo_hallazgo(g["ref"], h) and i not in g["corridas"]:
                    g["corridas"].add(i)
                    break
            else:
                grupos.append(dict(ref=h, corridas={i}))
    return grupos


def generar(corridas) -> str:
    por_plano = defaultdict(list)
    for c in corridas:
        por_plano[c["plano"]].append(c)
    L = ["# Diagnóstico de la variación entre corridas (datos)", "",
         "Generado por `scripts/diagnostico_variacion.py` (solo lectura de `web/.data`). Preliminar y no oficial. "
         "La «verdad aproximada» de un dato es lo que dicen las corridas; **no está verificada por un humano**.", ""]

    # 1. Extracción automática
    L += ["## 1. Qué halla el extractor automático antes de la IA", "",
          "| Plano | Datos | Hallados (ok) | No encontrados | En revisión | Láminas escaneadas (OCR) |", "|---|---|---|---|---|---|"]
    for plano, cs in sorted(por_plano.items()):
        ext = next((c["extraccion"] for c in cs if c["extraccion"]), None)
        if not ext:
            continue
        est = Counter(h["estado"] for h in ext["hechos"])
        esc = sum(1 for p in ext["paginas"] if p.get("tipo") == "escaneada")
        L.append(f"| {plano} | {len(ext['hechos'])} | {est.get('ok', 0)} | {est.get('no_encontrado', 0)} | {est.get('revision', 0)} | {esc} de {len(ext['paginas'])} |")
    L.append("")

    # 2. Cobertura de datos que escribe cada corrida
    L += ["## 2. Cobertura: datos que cada corrida escribió en `lote.json`", "",
          "Cuántas corridas del plano escribieron cada dato que piden las reglas que aplican a ese plano (el motor solo decide con datos de confianza ≥ 0.85). "
          "Si no se pudo calcular la lista del plano, se usan los 13 datos clave fijos.", ""]
    for plano, cs in sorted(por_plano.items()):
        pedidos = sorted({k for c in cs for k in c["pedidos"]}) or DATOS_CLAVE
        L += [f"**{plano}** ({len(cs)} corridas)", "", "| Dato | Lo piden las reglas en | Corridas que lo escribieron |", "|---|---|---|"]
        for k in pedidos:
            n = sum(1 for c in cs if k in c["hechos"])
            pide = sum(1 for c in cs if k in c["pedidos"])
            L.append(f"| `{k}` | {pide} de {len(cs)} corridas | {n} de {len(cs)} |")
        L.append("")

    # 3. Dispersión de los datos numéricos
    L += ["## 3. Dispersión: el mismo dato, distinto valor entre corridas", "",
          "| Plano | Dato | Corridas | Mín | Mediana | Máx | CV |", "|---|---|---|---|---|---|---|"]
    for plano, cs in sorted(por_plano.items()):
        claves = sorted({k for c in cs for k in c["hechos"]})
        for k in claves:
            vals = [numero(c["hechos"][k][0]) for c in cs if k in c["hechos"]]
            vals = [v for v in vals if v is not None]
            if len(vals) >= 3 and max(vals) != min(vals):
                L.append(f"| {plano} | `{k}` | {len(vals)} | {min(vals):g} | {statistics.median(vals):g} | {max(vals):g} | {cv(vals):.0%} |")
    L.append("")

    # 4. Reglas del catálogo en desacuerdo
    L += ["## 4. Reglas del catálogo en las que las corridas no coinciden", "",
          "Solo cuentan las corridas que decidieron la regla (si el motor la decidió solo, no está en el dictamen).", "",
          "| Plano | Regla | Decisiones (corridas) |", "|---|---|---|"]
    for plano, cs in sorted(por_plano.items()):
        reglas = sorted({r for c in cs for r in c["cat"]})
        en_desacuerdo = []
        for r in reglas:
            dec = Counter(c["cat"][r]["decision"] for c in cs if r in c["cat"])
            if len(dec) > 1:
                en_desacuerdo.append((r, dec))
        # Primero las que más decisiones distintas tienen y más corridas las decidieron.
        en_desacuerdo.sort(key=lambda x: (-len(x[1]), -sum(x[1].values()), x[0]))
        for r, dec in en_desacuerdo[:LIMITE_REGLAS]:
            L.append(f"| {plano} | `{r}` | " + ", ".join(f"{k}: {v}" for k, v in dec.most_common()) + " |")
        if len(en_desacuerdo) > LIMITE_REGLAS:
            L.append(f"| {plano} | … y {len(en_desacuerdo) - LIMITE_REGLAS} reglas más | casi todas por el alcance del dictamen (sección 7) |")
        if not en_desacuerdo:
            L.append(f"| {plano} | (ninguna) | — |")
    L.append("")

    # 5. Hallazgos: núcleo y cola (por plano y ronda: mezclar rondas mezcla instrucciones distintas)
    L += ["## 5. Hallazgos fuera del catálogo: núcleo y cola", "",
          "Por plano y ronda. Núcleo = aparece en al menos 2 de cada 3 corridas de esa ronda; cola = aparece en una sola.", "",
          "| Plano | Ronda | Corridas | Hallazgos distintos | Núcleo | En una sola corrida (cola) |", "|---|---|---|---|---|---|"]
    rondas = defaultdict(list)
    for c in corridas:
        rondas[(c["plano"], c["ronda"])].append(c)
    for (plano, ronda), cs in sorted(rondas.items()):
        if len(cs) < 2:
            continue
        g = nucleo_y_cola(cs)
        nucleo = sum(1 for x in g if len(x["corridas"]) / len(cs) >= 2 / 3)
        cola = sum(1 for x in g if len(x["corridas"]) == 1)
        L.append(f"| {plano} | {ronda} | {len(cs)} | {len(g)} | {nucleo} | {cola} |")
    L.append("")

    # 6. Por modelo
    L += ["## 6. Por modelo", "", "| Modelo | Corridas | Hallazgos por corrida (media) | Marcas por corrida (media) | Datos pedidos escritos (media) | Con aviso de superficial |", "|---|---|---|---|---|---|"]
    por_modelo = defaultdict(list)
    for c in corridas:
        por_modelo[c["modelo"]].append(c)
    for modelo, cs in sorted(por_modelo.items()):
        n = len(cs)
        L.append(f"| {modelo} | {n} | {sum(len(c['hall']) for c in cs) / n:.1f} | {sum(c['marcas'] for c in cs) / n:.1f} | "
                 f"{sum(fraccion(c) for c in cs) / n:.0%} | {sum(c['aviso'] for c in cs)} |")
    L += ["", "### Datos pedidos escritos por ronda (todos los planos)", "", "| Ronda | Corridas | Datos pedidos escritos (media) |", "|---|---|---|"]
    por_ronda = defaultdict(list)
    for c in corridas:
        por_ronda[c["ronda"]].append(c)
    for ronda, cs in sorted(por_ronda.items()):
        L.append(f"| {ronda} | {len(cs)} | {sum(fraccion(c) for c in cs) / len(cs):.0%} |")
    L += ["", "## 7. Alcance del dictamen: cuántas decisiones lista cada corrida", "",
          "Una corrida puede decidir una por una cientos de reglas de otras zonas o unidades territoriales (todas «no aplica») y otra no listarlas: "
          "cambia el número de decisiones, no las conclusiones.", "", "| Plano | Decisiones por corrida (de menor a mayor) |", "|---|---|"]
    for plano, cs in sorted(por_plano.items()):
        L.append(f"| {plano} | " + " · ".join(str(c["decisiones_total"]) for c in sorted(cs, key=lambda c: c["decisiones_total"])) + " |")
    return "\n".join(L) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--datos", default=str(RAIZ / "web" / ".data"))
    ap.add_argument("--salida", default=None)
    a = ap.parse_args(argv)
    corridas = cargar_corridas(Path(a.datos))
    if not corridas:
        print("No hay corridas terminadas.", file=sys.stderr)
        return 1
    texto = generar(corridas)
    print(texto)
    if a.salida:
        Path(a.salida).write_text(texto, encoding="utf8")
        print(f"Escrito {a.salida}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
