"""Forma de los valores antes de pasarlos al motor: cada dato con el tipo y la escritura del contrato (ADR-0019).

Las reglas comparan textos exactos (`lote.orden_conservacion == 'tercer'`). En la ronda 80, DeepSeek escribió «TERCER
ORDEN» en Casco Antiguo: el dato estaba bien leído, pero la regla no lo reconoció y dos reglas salieron «no aplica» sin
avisar. Aquí cada valor pasa a la forma que dice el contrato (`scripts/hechos_documentales.json`):

- un sí/no escrito como texto («false», «sí») pasa a true/false;
- un número escrito como texto con su unidad («733.14 m2») pasa a número;
- un sí/no donde va un número: false o «no» pasa a 0 («ninguno»); true o «sí» no dice cuánto y no se usa;
- un texto que coincide con uno de los `valores` del dato sin importar mayúsculas, tildes, guiones ni las palabras de
  relleno del dato («TERCER ORDEN» → «tercer», «Corregimiento de San Felipe» → «San Felipe») pasa a esa escritura.

Lo que no tiene la forma del contrato no se usa: si el dato es sí/no o número y el texto no lo es, o si la lista del dato
es cerrada (`cerrada: true`) y el texto no es ninguno de sus valores, el dato queda sin valor (`valor_leido` guarda lo que
se escribió) y el motor lo trata como faltante: la regla va a revisión en vez de salir «no aplica». Cada cambio deja un
aviso que la IA ve al reevaluar. Nada de esto inventa un valor: solo cambia la escritura de lo que se leyó.
"""
from __future__ import annotations

import copy
import json
import re
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
CONTRATO = RAIZ / "scripts" / "hechos_documentales.json"

#: Datos con su propia lectura y equivalencias (precheck/motor/zona.py y la norma aplicable) y el trámite, que pone la
#: plataforma: aquí no se tocan.
PROPIOS = {"lote.codigo_zona", "lote.norma_aplicable", "tramite"}
#: Palabras que no cambian el valor de ningún texto.
RUIDO = {"de", "del", "la", "las", "el", "los", "y", "en"}
SI = {"true", "si", "verdadero", "yes"}
NO = {"false", "no", "falso"}
#: Datos numéricos por su nombre, aunque el contrato no los tenga (los de zonificación vienen de las fichas).
NUMERICO = re.compile(r"(_m|_m2|_pct|_cm|_mm|_ha|_pers_ha|cantidad|\.estacionamientos|pisos_totales|unidades_vivienda)$")
NUMERO = re.compile(r"^\s*(-?\d+(?:[.,]\d+)?)\s*(?:m2|m²|mts2|ml|m|mts|metros|cm|mm|%|pers/ha|ha|pisos?|unidades|u)?\.?\s*$", re.I)
MILES = re.compile(r"^\s*(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*(?:m2|m²|ml|m|%)?\s*$", re.I)


def cargar(ruta: Path = CONTRATO) -> dict[str, dict]:
    """Contrato de datos: clave → {tipo, valores, cerrada, sinonimos, ruido}."""
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))["datos"]
    except (OSError, ValueError, KeyError):
        return {}
    return {d["clave"]: d for d in datos if isinstance(d, dict) and d.get("clave")}


def plegar(texto: str) -> list[str]:
    """Palabras de un texto sin tildes, en minúsculas, sin guiones ni signos («Curundú» → ['curundu'])."""
    t = unicodedata.normalize("NFKD", texto)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", t).split()


def canonico(valor: str, entrada: dict) -> str | None:
    """El valor del contrato que dice `valor`, o None si no es ninguno (o si podría ser más de uno)."""
    sinonimos = {" ".join(plegar(k)): v for k, v in (entrada.get("sinonimos") or {}).items()}
    palabras = [sinonimos.get(p, p) for p in plegar(valor)]
    # Un sinónimo puede ser un valor con mayúsculas o tildes: se pliega otra vez.
    palabras = [q for p in palabras for q in plegar(p)]
    ruido = RUIDO | {q for r in entrada.get("ruido") or [] for q in plegar(r)}
    candidatos = []
    for v in entrada.get("valores") or []:
        objetivo = plegar(v)
        if palabras == objetivo:
            return v
        n = len(objetivo)
        for i in range(len(palabras) - n + 1):
            resto = palabras[:i] + palabras[i + n:]
            if n and palabras[i:i + n] == objetivo and all(p in ruido for p in resto):
                candidatos.append(v)
                break
    return candidatos[0] if len(candidatos) == 1 else None


def _numero(texto: str) -> float | int | None:
    m = MILES.match(texto)
    if m:
        s = m.group(1).replace(",", "")
    else:
        m = NUMERO.match(texto)
        if not m:
            return None
        s = m.group(1).replace(",", ".")
    n = float(s)
    return int(n) if n.is_integer() and "." not in s else n


def _tipo(ruta: str, entrada: dict | None) -> str | None:
    if entrada and entrada.get("tipo"):
        return entrada["tipo"]
    return "numero" if NUMERICO.search(ruta) else None


def _recorrer(nodo, ruta=""):
    if isinstance(nodo, dict):
        if "valor" in nodo and ("confianza" in nodo or "fuente" in nodo):
            yield ruta, nodo
            return
        for k, v in nodo.items():
            yield from _recorrer(v, f"{ruta}.{k}" if ruta else k)


def _descartar(nodo: dict, ruta: str, motivo: str, avisos: list[str]) -> None:
    nodo["valor_leido"] = nodo["valor"]
    nodo["valor"] = None
    nodo["descartado"] = motivo
    avisos.append(f"VALOR_SIN_FORMA: {ruta} = {nodo['valor_leido']!r} no se usa: {motivo} El motor lo trata como faltante; "
                  "escríbelo con la forma del contrato.")


def normalizar(hechos: dict, contrato: dict[str, dict]) -> tuple[dict, list[str]]:
    """Devuelve los hechos con cada valor en la forma del contrato y un aviso por cada valor cambiado o descartado."""
    res = copy.deepcopy(hechos)
    avisos: list[str] = []
    for ruta, nodo in _recorrer(res):
        v = nodo.get("valor")
        entrada = contrato.get(ruta) or {}
        tipo = _tipo(ruta, entrada)
        if ruta in PROPIOS or v is None:
            continue
        if not isinstance(v, str):
            # Un número o un sí/no donde va un texto de lista cerrada (p. ej. el orden 3) se lee como texto. Un sí/no
            # donde va un número también: el motor compararía `true` como 1 (rotura de cordón `true` salía CUMPLE).
            if not (tipo == "texto" and entrada.get("cerrada")) and not (tipo == "numero" and isinstance(v, bool)):
                continue
            v = str(v).lower() if isinstance(v, bool) else f"{v:g}" if isinstance(v, float) else str(v)
        plegado = " ".join(plegar(v))
        nuevo, motivo = v, None
        if tipo == "bool":
            nuevo = True if plegado in SI else False if plegado in NO else None
            motivo = "es un dato sí/no (true o false)." if nuevo is None else None
        elif tipo == "numero":
            # «no» o false es «ninguno» (0); «sí» o true no dice cuánto, así que no se usa.
            nuevo = 0 if plegado in NO else _numero(v)
            motivo = None if nuevo is not None else ("es un número: «sí» no dice cuánto." if plegado in SI
                                                      else "es un número (sin unidades ni texto).")
        elif tipo == "texto" and entrada.get("valores"):
            nuevo = canonico(v, entrada)
            if nuevo is None:
                if not entrada.get("cerrada"):
                    continue
                motivo = f"tiene que ser uno de: {', '.join(repr(x) for x in entrada['valores'])}."
        else:
            continue
        if motivo:
            if not nodo.get("definido"):  # lo definido por el arquitecto no se descarta
                _descartar(nodo, ruta, motivo, avisos)
        elif nuevo != v:
            nodo["valor_leido"] = v
            nodo["valor"] = nuevo
            avisos.append(f"FORMA: {ruta} = {v!r} se usa como {nuevo!r} (escritura del contrato de datos).")
    return res, avisos
