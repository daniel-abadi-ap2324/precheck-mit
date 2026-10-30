"""Evaluador puro de reglas del PreCheck MUPA: sin E/S, determinista.

Produce CUMPLE / NO_CUMPLE / REQUIERE_REVISION / NO_APLICA para una regla y unos hechos.
Extraído de motor.py (ADR-0001); motor.py lo reutiliza como envoltorio de compatibilidad.
"""
import ast
import operator
import re

CUMPLE, NO_CUMPLE, REVISION, NO_APLICA = "CUMPLE", "NO_CUMPLE", "REQUIERE_REVISION", "NO_APLICA"


class DatoFaltante(Exception):
    pass


def obtener_hecho(hechos, ruta):
    nodo = hechos
    for parte in ruta.split("."):
        if not isinstance(nodo, dict) or parte not in nodo:
            raise DatoFaltante(ruta)
        nodo = nodo[parte]
    if isinstance(nodo, dict) and "valor" in nodo:
        return nodo
    return {"valor": nodo, "confianza": 1.0}


# --- Evaluador de expresiones restringido -----------------------------------

_BIN = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}
_CMP = {ast.Eq: operator.eq, ast.NotEq: operator.ne, ast.Lt: operator.lt, ast.LtE: operator.le,
        ast.Gt: operator.gt, ast.GtE: operator.ge, ast.In: lambda a, b: a in b,
        ast.NotIn: lambda a, b: a not in b}
_FUNC = {"len": len, "min": min, "max": max, "abs": abs}


def _normalizar(expr):
    return re.sub(r"\b(true|false|null)\b", lambda m: {"true": "True", "false": "False", "null": "None"}[m.group(1)], expr)


def _ruta(nodo):
    if isinstance(nodo, ast.Name):
        return nodo.id
    if isinstance(nodo, ast.Attribute):
        return _ruta(nodo.value) + "." + nodo.attr
    raise ValueError("expresión no permitida")


class Evaluador:
    def __init__(self, hechos):
        self.hechos = hechos
        self.usados = {}
        self.confianzas = {}

    def valor(self, ruta):
        hecho = obtener_hecho(self.hechos, ruta)
        self.usados[ruta] = {k: hecho[k] for k in ("valor", "confianza", "fuente", "unidad") if k in hecho}
        self.confianzas[ruta] = float(hecho.get("confianza", 1.0))
        if hecho["valor"] is None:
            raise DatoFaltante(ruta)
        return hecho["valor"]

    def eval(self, expr):
        return self._ev(ast.parse(_normalizar(expr), mode="eval").body)

    def _ev(self, n):
        if isinstance(n, ast.Constant):
            return n.value
        if isinstance(n, (ast.Name, ast.Attribute)):
            if isinstance(n, ast.Name) and n.id in ("True", "False", "None"):
                return {"True": True, "False": False, "None": None}[n.id]
            return self.valor(_ruta(n))
        if isinstance(n, ast.List):
            return [self._ev(e) for e in n.elts]
        if isinstance(n, ast.BoolOp):
            # cortocircuito: "tramite == 'X' and dato" no debe exigir dato si el trámite no aplica
            es_and = isinstance(n.op, ast.And)
            for v in n.values:
                r = self._ev(v)
                if es_and and not r:
                    return False
                if not es_and and r:
                    return True
            return es_and
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.Not):
            return not self._ev(n.operand)
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub):
            return -self._ev(n.operand)
        if isinstance(n, ast.BinOp) and type(n.op) in _BIN:
            return _BIN[type(n.op)](self._ev(n.left), self._ev(n.right))
        if isinstance(n, ast.Compare):
            izq = self._ev(n.left)
            for op, der_n in zip(n.ops, n.comparators, strict=True):
                der = self._ev(der_n)
                if type(op) not in _CMP or not _CMP[type(op)](izq, der):
                    return False
                izq = der
            return True
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name):
            if n.func.id == "existe":
                try:
                    self.valor(_ruta(n.args[0]))
                    return True
                except DatoFaltante:
                    return False
            if n.func.id in _FUNC:
                return _FUNC[n.func.id](*[self._ev(a) for a in n.args])
        raise ValueError(f"expresión no permitida: {ast.dump(n)[:80]}")


# --- Tolerancia: detectar resultados en el borde --------------------------

def en_borde(regla, ev):
    """True si alguna comparación numérica cae dentro de la tolerancia."""
    tol = regla.get("tolerancia")
    if not tol:
        return False
    arbol = ast.parse(_normalizar(regla["condicion"]), mode="eval").body
    for n in ast.walk(arbol):
        if isinstance(n, ast.Compare) and len(n.ops) == 1 and type(n.ops[0]) in (ast.Lt, ast.LtE, ast.Gt, ast.GtE):
            try:
                a, b = ev._ev(n.left), ev._ev(n.comparators[0])
            except Exception:
                continue
            if isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) <= tol:
                return True
    return False


def vigente(regla, fecha):
    v = regla.get("vigencia") or {}
    desde, hasta = str(v.get("desde") or "0000"), v.get("hasta")
    return desde <= fecha and (hasta is None or fecha <= str(hasta))


def umbral_efectivo(regla, umbral):
    """Una regla puede subir el umbral global de confianza, nunca bajarlo (spec §8)."""
    return max(float(umbral), float(regla.get("umbral_confianza") or 0))


_NODOS = (ast.Expression, ast.BoolOp, ast.And, ast.Or, ast.UnaryOp, ast.Not, ast.USub, ast.BinOp, ast.Add,
          ast.Sub, ast.Mult, ast.Div, ast.Compare, ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.In,
          ast.NotIn, ast.Constant, ast.Name, ast.Attribute, ast.Load, ast.List, ast.Call)


def validar_expresion(expr):
    """Comprueba que la expresión use solo la gramática del esquema de reglas (review A3).
    Lanza ValueError si no."""
    try:
        arbol = ast.parse(_normalizar(expr or ""), mode="eval")
    except SyntaxError as e:
        raise ValueError(f"sintaxis inválida: {e.msg}") from None
    for n in ast.walk(arbol):
        if not isinstance(n, _NODOS):
            raise ValueError(f"construcción no permitida: {type(n).__name__}")
        if isinstance(n, ast.Call) and not (isinstance(n.func, ast.Name) and n.func.id in (*_FUNC, "existe")):
            raise ValueError("solo se permiten las funciones len, min, max, abs y existe")


def _dudosos(ev, umbral):
    return {r: c for r, c in ev.confianzas.items() if c < umbral}


def _motivo_confianza(bajos, umbral):
    return "; ".join(f"la confianza de {r} ({c:.2f}) está bajo el mínimo {umbral:g}" for r, c in bajos.items())


def evaluar_regla(regla, hechos, umbral):
    """Nunca lanza: cualquier fallo al evaluar una regla da REQUIERE_REVISION (sad §8, review A3)."""
    umbral = umbral_efectivo(regla, umbral)
    ev = Evaluador(hechos)
    try:
        return _evaluar(regla, ev, umbral)
    except Exception as e:  # noqa: BLE001 — una regla defectuosa no puede tumbar la evaluación
        return {"regla_id": regla.get("id"), "regla_version": regla.get("version"),
                "fuente_norma": regla.get("fuente"), "severidad": regla.get("severidad"),
                "resultado": REVISION, "motivo": f"error al evaluar la regla: {type(e).__name__}: {e}",
                "valores_usados": ev.usados, "causa": {"tipo": "error"}}


def _evaluar(regla, ev, umbral):
    base = {"regla_id": regla["id"], "regla_version": regla.get("version"),
            "fuente_norma": regla.get("fuente"), "severidad": regla.get("severidad")}

    def fin(resultado, motivo, causa=None):
        base.update(resultado=resultado, motivo=motivo, valores_usados=ev.usados)
        if resultado == NO_CUMPLE:
            base["mensaje"] = regla.get("mensaje_no_cumple")
        if causa:
            # Por qué queda en revisión, sin interpretar el motivo: la decisión de respaldo (respaldo.py) la lee.
            base["causa"] = causa
        return base

    try:
        if regla.get("aplica_si") and not ev.eval(regla["aplica_si"]):
            bajos = _dudosos(ev, umbral)
            if bajos:   # review A5: un dato dudoso no puede sacar la regla del expediente
                return fin(REVISION, "no se puede determinar si aplica: " + _motivo_confianza(bajos, umbral),
                           {"tipo": "dudoso", "en": "aplica_si", "campos": bajos, "resultado": NO_APLICA})
            return fin(NO_APLICA, "condición aplica_si falsa")
    except DatoFaltante as e:
        return fin(REVISION, f"no se puede determinar si aplica: falta {e}", {"tipo": "faltante", "en": "aplica_si", "campo": str(e)})

    if regla.get("tipo") == "criterio":
        return fin(REVISION, "regla de criterio: requiere juicio del revisor", {"tipo": "criterio"})

    for ruta in regla.get("entradas", []):
        try:
            ev.valor(ruta)
        except DatoFaltante:
            return fin(REVISION, f"dato faltante: {ruta}", {"tipo": "faltante", "en": "condicion", "campo": ruta})

    try:
        ok = ev.eval(regla["condicion"])
    except DatoFaltante as e:
        return fin(REVISION, f"dato faltante: {e}", {"tipo": "faltante", "en": "condicion", "campo": str(e)})
    except (ValueError, TypeError, ZeroDivisionError) as e:
        return fin(REVISION, f"error al evaluar la regla: {e}", {"tipo": "error"})

    bajos = _dudosos(ev, umbral)
    if bajos:
        return fin(REVISION, _motivo_confianza(bajos, umbral),
                   {"tipo": "dudoso", "en": "condicion", "campos": bajos, "resultado": CUMPLE if ok else NO_CUMPLE})
    if en_borde(regla, ev):
        return fin(REVISION, f"valor dentro de la tolerancia ({regla['tolerancia']}) del límite",
                   {"tipo": "borde", "resultado": CUMPLE if ok else NO_CUMPLE})
    return fin(CUMPLE if ok else NO_CUMPLE, "condición evaluada")
