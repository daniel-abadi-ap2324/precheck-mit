"""Familias de zona: nombre, uso, densidad y densidad máxima de cada código, con su cita literal (ADR-0016).

Sirven para elegir la zona de trabajo cuando el plano declara un código de otra norma (R3 del PLOT en el Área del
Canal): «Residencial de baja densidad» lleva a la familia R1 de la Res. 160-2002. Los datos están en
`normativa/zonificacion/datos/familias_zona.json` y tests/test_familias_zona.py comprueba cada cita y cada número
contra el texto de la norma.
"""
from __future__ import annotations

import json
from pathlib import Path

RUTA = Path(__file__).resolve().parents[2] / "normativa" / "zonificacion" / "datos" / "familias_zona.json"


def cargar(ruta: Path = RUTA) -> list[dict]:
    """Las familias del archivo; lista vacía si no existe o está dañado (sin familias no se eligen candidatas)."""
    try:
        datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    familias = datos.get("familias") if isinstance(datos, dict) else None
    return [f for f in familias or [] if isinstance(f, dict) and f.get("norma") and f.get("codigo")]
