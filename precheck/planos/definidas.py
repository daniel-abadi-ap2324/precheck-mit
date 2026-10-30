"""Variables definidas por el arquitecto: lo que decide al 100 % y la revisión no cuestiona.

El servidor escribe `definidas.json` ({"valores": {"lote.codigo_zona": "R2-A", "proyecto.altura_m": 12}}) en la carpeta del
PreCheck. En cada evaluación (`revisar`) esos valores se imponen sobre lo que haya en los hechos, aunque la IA haya
escrito otro: entran con confianza 1.0, procedencia «declarado» y la marca `definido`, que `sensatez` y la zona de trabajo
respetan (no las bajan de confianza). La zona definida gana al plano, pero si el plano dice otra queda como supuesto, y un
documento oficial del expediente (CEUS, nota DPU) gana a la definida (ADR-0016). Si la IA había escrito otro valor, queda un
aviso informativo `VARIABLE_DEFINIDA`; nunca un cambio silencioso.

Lo definido sigue sujeto a la validación del servidor (rangos físicos) y al aviso previo de la pantalla; aquí no se juzga.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

ARCHIVO = "definidas.json"
DETALLE = "definida por el arquitecto: se usa tal cual, sin cuestionarla"


def cargar(carpeta: str | Path) -> dict[str, Any]:
    """Valores definidos de la carpeta del PreCheck; vacío si no hay archivo o está dañado."""
    try:
        v = json.loads((Path(carpeta) / ARCHIVO).read_text(encoding="utf-8")).get("valores")
    except (OSError, ValueError, AttributeError):
        return {}
    return {str(k): x for k, x in v.items() if x is not None and x != ""} if isinstance(v, dict) else {}


def es_definido(nodo: Any) -> bool:
    return isinstance(nodo, dict) and bool(nodo.get("definido"))


def _leer(hechos: dict, ruta: str) -> Any:
    actual: Any = hechos
    for p in ruta.split("."):
        if not isinstance(actual, dict) or p not in actual:
            return None
        actual = actual[p]
    return actual


def imponer(hechos: dict, valores: dict[str, Any]) -> tuple[dict, list[str]]:
    """Copia de `hechos` con los valores definidos puestos a confianza 1.0 y un aviso por cada valor que la lectura o la
    IA había escrito distinto."""
    if not valores:
        return hechos, []
    res = copy.deepcopy(hechos)
    avisos: list[str] = []
    for ruta, valor in valores.items():
        previo = _leer(res, ruta)
        v_previo = previo.get("valor") if isinstance(previo, dict) else previo
        if v_previo is not None and str(v_previo).strip().lower() != str(valor).strip().lower() and not es_definido(previo):
            avisos.append(f"VARIABLE_DEFINIDA: {ruta} = {valor!r} (definida por el arquitecto); la lectura o la revisión había puesto {v_previo!r} y se descartó.")
        *padres, hoja = ruta.split(".")
        nodo = res
        for p in padres:
            nodo = nodo.setdefault(p, {})
        nodo[hoja] = {"valor": valor, "confianza": 1.0, "definido": True, "fuente": {"metodo": "declarado", "detalle": DETALLE}}
    return res, avisos
