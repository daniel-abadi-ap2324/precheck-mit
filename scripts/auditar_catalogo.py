#!/usr/bin/env python3
"""Auditoría del catálogo de reglas para la revisión humana (solo lectura: no toca reglas/ ni la bitácora).

Para cada regla de reglas/*.json calcula banderas que ayudan a revisarla y decide si entra en el alcance de un
anteproyecto (RLA): su aplica_si se evalúa con tramite = 'RLA' conocido y todo lo demás desconocido (lógica de tres
valores); si sale falso, la regla no aplica a un anteproyecto y va a «fuera de alcance» con su motivo.

Banderas:
  cita_no_encontrada / cita_en_otra_norma  la cita_textual no está literal en normativa/ (o solo en otra norma)
  esquema:<detalle>                        faltan campos, expresión fuera de la gramática, sin condición siendo computable,
                                           severidad/subsanación/tipo fuera de lo permitido o incoherentes (ADR-0017)
  comparte_cita (informativa) / duplicada_logica  otra regla (que no es su equivalente por unidad territorial) tiene la misma
                                           cita larga, o el mismo aplica_si y la misma condición
  cita_corta                               la cita tiene menos de 25 caracteres («50%»): no prueba de qué norma sale
  sospechada                               aparece en docs/propuestas/catalogo/correcciones-catalogo.md
  aplica_rla_dudoso                        documental sin trámite en aplica_si: puede no ser de anteproyecto

Uso: python scripts/auditar_catalogo.py [--prechecks DIR] [--salida docs/revision-catalogo]
Escribe auditoria.json (reglas en alcance, con banderas y uso real) y fuera-de-alcance.csv.
"""
import argparse
import ast
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
from precheck.motor.evaluador import _normalizar, validar_expresion  # noqa: E402
from precheck.motor.verificar_citas import norm  # noqa: E402
from precheck.reglas.firmeza import errores_de_invariantes, errores_de_valores  # noqa: E402

TRAMITE = "RLA"
DESCONOCIDO = None  # tercer valor

# Entradas que solo existen en trámites posteriores al anteproyecto (obra en ejecución, permiso, ocupación).
PREFIJOS_OTRO_TRAMITE = ("atc.", "obra.", "permiso_construccion.", "cerca_temporal.", "constructor.", "explosivos.",
                         "generador.", "letrero.", "uso_acera.", "plano_registrado.", "permiso_solicitado.")

# Texto de norma esperado según fuente.norma (para distinguir «en otra norma»).
NORMA_A_TEXTO = [
    (r"Acuerdo N°\s*110|Acuerdo 110", ["acuerdo-110"]), (r"Acuerdo N°\s*128", ["acuerdo128"]),
    (r"Acuerdo N°\s*270|San Francisco", ["acuerdo270"]), (r"Anexo 4|Acuerdo N°\s*61|PLOT", ["anexo4", "acuerdo61"]),
    (r"L[íi]nea 1", ["metro_l1"]), (r"L[íi]nea 2", ["metro_l2"]), (r"160", ["res160"]), (r"127", ["res127"]),
    (r"N°\s*15|La Cresta", ["res15_"]), (r"192|El Carmen", ["res192"]), (r"352|Panam[áa] Viejo", ["res352"]),
    (r"Costa del Este", ["costa_del_este"]), (r"Ley\s*(N°\s*)?21", ["ley21"]),
]
CITA_CORTA = 25  # caracteres: una cita así («50%», «20 m») aparece en muchas normas y no prueba de dónde salió el valor

CAMPOS = ("id", "version", "titulo", "tipo", "severidad", "fuente", "vigencia", "estado_revision", "mensaje_no_cumple")


# --- Alcance: aplica_si con tramite='RLA' y lo demás desconocido ----------------------------------------------

def _ruta(n):
    if isinstance(n, ast.Name):
        return n.id
    if isinstance(n, ast.Attribute):
        return _ruta(n.value) + "." + n.attr
    raise ValueError


def _tri(n):
    """Evalúa con tramite conocido; devuelve True, False, DESCONOCIDO o un valor concreto."""
    if isinstance(n, ast.Constant):
        return n.value
    if isinstance(n, ast.List):
        vals = [_tri(e) for e in n.elts]
        return DESCONOCIDO if any(v is DESCONOCIDO for v in vals) else vals
    if isinstance(n, (ast.Name, ast.Attribute)):
        if isinstance(n, ast.Name) and n.id in ("True", "False", "None"):
            return {"True": True, "False": False, "None": None}[n.id]
        return TRAMITE if _ruta(n) == "tramite" else DESCONOCIDO
    if isinstance(n, ast.BoolOp):
        vals = [_tri(v) for v in n.values]
        if isinstance(n.op, ast.And):
            if any(v is False for v in vals):
                return False
            return True if all(v is True for v in vals) else DESCONOCIDO
        if any(v is True for v in vals):
            return True
        return False if all(v is False for v in vals) else DESCONOCIDO
    if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.Not):
        v = _tri(n.operand)
        return DESCONOCIDO if v is DESCONOCIDO else (not v)
    if isinstance(n, ast.Compare) and len(n.ops) == 1:
        a, b = _tri(n.left), _tri(n.comparators[0])
        if a is DESCONOCIDO or b is DESCONOCIDO:
            return DESCONOCIDO
        op = n.ops[0]
        try:
            if isinstance(op, ast.Eq):
                return a == b
            if isinstance(op, ast.NotEq):
                return a != b
            if isinstance(op, ast.In):
                return a in b
            if isinstance(op, ast.NotIn):
                return a not in b
        except TypeError:
            return DESCONOCIDO
        return DESCONOCIDO
    if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "existe":
        try:
            return True if _ruta(n.args[0]) == "tramite" else DESCONOCIDO
        except ValueError:
            return DESCONOCIDO
    return DESCONOCIDO


def tramites_nombrados(aplica_si):
    return sorted(set(re.findall(r"'([A-Z][A-Z_]+)'", " ".join(re.findall(r"tramite\s*(?:==|!=|in|not in)\s*(\[[^\]]*\]|'[^']*')", aplica_si or "")))))


def alcance(regla):
    """(entra, motivo). entra=False => la regla no aplica a un anteproyecto."""
    if regla.get("tipo") == "plazo":
        return False, "regla de plazo (vigencias de ATC/permisos), no de anteproyecto"
    otras = [e for e in regla.get("entradas") or [] if e.startswith(PREFIJOS_OTRO_TRAMITE)]
    if otras:
        return False, "pide datos de obra o permiso: " + ", ".join(otras[:3])
    a = regla.get("aplica_si")
    if not a:
        return True, ""
    try:
        v = _tri(ast.parse(_normalizar(a), mode="eval").body)
    except (SyntaxError, ValueError):
        return True, ""
    if v is False:
        t = tramites_nombrados(a)
        return False, "aplica solo a " + (", ".join(t) if t else "otro trámite")
    return True, ""


# --- Citas ----------------------------------------------------------------------------------------------------

def cargar_normativa(raiz):
    """Solo los textos fuente (no los resúmenes como codigos-zona.md ni el OCR crudo)."""
    rutas = [raiz / "normativa" / "acuerdo-110" / "texto-completo.md", *sorted((raiz / "normativa").glob("*/textos/*.txt"))]
    return {str(p.relative_to(raiz)).replace("\\", "/"): norm(p.read_text(encoding="utf-8", errors="replace")) for p in rutas if p.exists()}


def esperadas(norma):
    return [t for patron, textos in NORMA_A_TEXTO if re.search(patron, norma or "") for t in textos]


def estado_cita(cita, norma, textos):
    if not cita:
        return "sin_cita", []
    c = norm(cita)
    donde = [k for k, t in textos.items() if c in t]
    if not donde:
        return "no_encontrada", []
    esp = esperadas(norma)
    if esp and not any(e in d for d in donde for e in esp):
        return "en_otra_norma", donde
    return "ok", donde


# --- Esquema --------------------------------------------------------------------------------------------------

def problemas_esquema(r):
    p = [f"falta {c}" for c in CAMPOS if not r.get(c)]
    p += errores_de_valores(r)        # ADR-0017: severidad, subsanación, tipo y criterio con valores permitidos
    if r.get("subsanacion"):
        p += errores_de_invariantes(r)
    f = r.get("fuente") or {}
    p += [f"fuente sin {c}" for c in ("norma", "articulo", "cita_textual") if not f.get(c)]
    if "pagina_pdf" not in f:
        p.append("fuente sin pagina_pdf")
    if "aplica_si" not in r:
        p.append("falta aplica_si")
    if "entradas" not in r:
        p.append("falta entradas")
    if r.get("tipo") != "criterio" and not r.get("condicion"):
        p.append("sin condicion siendo " + str(r.get("tipo")))
    for campo in ("aplica_si", "condicion"):
        if r.get(campo):
            try:
                validar_expresion(r[campo])
            except ValueError as e:
                p.append(f"{campo}: {e}")
    return p


# --- Datos: de dónde sale cada entrada ------------------------------------------------------------------------

MEDIDOS = re.compile(r"(_m|_m2|_pct|_ha|_ml)$|^(proyecto\.(pisos_totales|unidades_vivienda|estacionamientos\w*|niveles\w*)|rampa\.|acceso_vehicular\.)")


def origen_dato(clave, documentales, editables):
    if clave.startswith(("expediente.", "registro_publico.")) or clave == "tramite":
        return "expediente u otro documento"
    if clave in ("lote.norma_aplicable", "lote.codigo_zona"):
        return "declarado en el formulario"
    if MEDIDOS.search(clave):
        return "medido a escala o contado en el plano"
    prod = documentales.get(clave)
    if prod:
        return f"documental ({prod})"
    return "leído del plano"


# --- Uso real en corridas guardadas ---------------------------------------------------------------------------

def uso_real(dir_prechecks):
    uso = defaultdict(Counter)
    if not dir_prechecks or not Path(dir_prechecks).is_dir():
        return uso, 0
    n = 0
    for c in Path(dir_prechecks).iterdir():
        try:
            res = json.loads((c / "resultado.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        n += 1
        decision = {}
        try:
            dic = json.loads((c / "dictamen.json").read_text(encoding="utf-8"))
            decision = {d["regla_id"]: d.get("decision") for d in dic.get("decisiones", []) if d.get("regla_id")}
        except (OSError, ValueError, KeyError, TypeError):
            pass
        for r in res.get("resultados", []):
            rid = r.get("regla_id")
            if rid:
                uso[rid]["motor:" + str(r.get("resultado"))] += 1
                if rid in decision:
                    uso[rid]["ia:" + str(decision[rid])] += 1
    return uso, n


# --- Principal ------------------------------------------------------------------------------------------------

def sospechadas(raiz):
    p = raiz / "docs" / "propuestas" / "catalogo" / "correcciones-catalogo.md"
    if not p.exists():
        return {}
    salida = {}
    titulo = ""
    for linea in p.read_text(encoding="utf-8").splitlines():
        if linea.startswith("## "):
            titulo = linea[3:].strip()
            ids = re.findall(r"\b([A-Z0-9]+(?:-[A-Z0-9]+)+)\b", linea)
            # «LC-R1B-, LC-R2A- y LC-RM-ESTACIONAMIENTOS-VISITAS»: los prefijos toman el sufijo del último id completo.
            sufijo = ids[-1].split("-", 2)[-1] if ids else ""
            ids += [p + sufijo for p in re.findall(r"\b([A-Z0-9]+-[A-Z0-9]+-)(?=[,\s])", linea)]
            for rid in ids:
                salida.setdefault(rid, titulo)
    return salida


def equivalente(rid):
    """Clave sin sector y unidad territorial: las reglas equivalentes por UT no cuentan como duplicadas."""
    return re.sub(r"^([A-Z0-9]+)-.*?-UT\d+-", r"\1-*-UT*-", rid)


def auditar(raiz=RAIZ, dir_prechecks=None):
    textos = cargar_normativa(raiz)
    documentales = {}
    try:
        documentales = {d["clave"]: d.get("productor", "") for d in json.loads((raiz / "scripts" / "hechos_documentales.json").read_text(encoding="utf-8"))["datos"]}
    except (OSError, ValueError, KeyError):
        pass
    sosp = sospechadas(raiz)
    uso, corridas = uso_real(dir_prechecks)
    filas, fuera = [], []
    for f in sorted((raiz / "reglas").glob("*.json")):
        for r in json.loads(f.read_text(encoding="utf-8")):
            entra, motivo = alcance(r)
            base = {"id": r.get("id"), "archivo": f.name, "tipo": r.get("tipo"), "severidad": r.get("severidad")}
            if not entra:
                fuera.append({**base, "tramites": ", ".join(tramites_nombrados(r.get("aplica_si"))), "motivo": motivo})
                continue
            fuente = r.get("fuente") or {}
            cita_estado, donde = estado_cita(fuente.get("cita_textual"), fuente.get("norma"), textos)
            banderas = []
            if cita_estado in ("no_encontrada", "sin_cita"):
                banderas.append("cita_no_encontrada")
            elif cita_estado == "en_otra_norma":
                banderas.append("cita_en_otra_norma")
            if len((fuente.get("cita_textual") or "").strip()) < CITA_CORTA:
                banderas.append("cita_corta")
            esquema = problemas_esquema(r)
            banderas += ["esquema" for _ in esquema[:1]]
            if r.get("id") in sosp:
                banderas.append("sospechada")
            if r.get("tipo") == "documental" and not tramites_nombrados(r.get("aplica_si")):
                banderas.append("aplica_rla_dudoso")
            filas.append({
                **base,
                "titulo": r.get("titulo"),
                "norma": fuente.get("norma"), "articulo": fuente.get("articulo"), "pagina_pdf": fuente.get("pagina_pdf"),
                "cita": fuente.get("cita_textual"), "cita_estado": cita_estado, "cita_en": donde[:3],
                "aplica_si": r.get("aplica_si"), "condicion": r.get("condicion"), "tolerancia": r.get("tolerancia"),
                "unidad": r.get("unidad"), "mensaje": r.get("mensaje_no_cumple"), "nota": r.get("nota"),
                "entradas": [{"clave": e, "origen": origen_dato(e, documentales, None)} for e in r.get("entradas") or []],
                "esquema": esquema, "sospecha": sosp.get(r.get("id")),
                "uso": dict(uso.get(r.get("id"), {})),
                "banderas": banderas,
            })
    # Duplicados entre las reglas en alcance (sin contar las equivalentes por unidad territorial).
    por_cita, por_logica = defaultdict(set), defaultdict(set)
    for x in filas:
        if len(x["cita"] or "") >= CITA_CORTA:
            por_cita[norm(x["cita"])].add(x["id"])
        if x["condicion"]:
            por_logica[(x["aplica_si"] or "", x["condicion"])].add(x["id"])
    for x in filas:
        for grupo, bandera in ((por_cita.get(norm(x["cita"] or "")), "comparte_cita"), (por_logica.get((x["aplica_si"] or "", x["condicion"] or "")), "duplicada_logica")):
            otros = sorted(i for i in (grupo or ()) if i != x["id"] and equivalente(i) != equivalente(x["id"]))
            if otros:
                x["banderas"].append(bandera)
                x.setdefault("duplicada_con", []).extend(o for o in otros[:5] if o not in x.get("duplicada_con", []))
    return filas, fuera, corridas


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--prechecks", help="carpeta con las corridas guardadas (web/.data/prechecks) para contar el uso real")
    ap.add_argument("--salida", default=str(RAIZ / "docs" / "revision-catalogo"))
    a = ap.parse_args(argv)
    filas, fuera, corridas = auditar(RAIZ, a.prechecks)
    salida = Path(a.salida)
    salida.mkdir(parents=True, exist_ok=True)
    resumen = {
        "en_alcance": len(filas), "fuera_de_alcance": len(fuera), "corridas_leidas": corridas,
        "por_tipo": Counter(x["tipo"] for x in filas), "por_severidad": Counter(x["severidad"] for x in filas),
        "banderas": Counter(b for x in filas for b in set(x["banderas"])),
        "aplicaron_en_corridas": sum(1 for x in filas if x["uso"]),
    }
    (salida / "auditoria.json").write_text(json.dumps({"resumen": resumen, "reglas": filas}, ensure_ascii=False, indent=1), encoding="utf-8")
    with open(salida / "fuera-de-alcance.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["id", "archivo", "tipo", "severidad", "tramites", "motivo"])
        w.writeheader()
        w.writerows(fuera)
    print(json.dumps(resumen, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
