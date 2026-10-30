#!/usr/bin/env python3
"""Nombres de las corridas de prueba de modelos (par en TypeScript: web/src/lib/corridas-prueba.ts).

  «<Plano> - prueba <N> con <Modelo>»        repetición 1
  «<Plano> - prueba <N> con <Modelo> (k)»    repetición k ≥ 2 (ADR-0015)

Las primeras rondas no llevan número («prueba con …») y algunas se llamaron «<Plano> - IA <Modelo>»: las dos son la
ronda 1. Los demás scripts tienen su propia expresión con el mismo grupo opcional « (k)»; esta es la de referencia.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

NOMBRE = re.compile(r"^(?P<plano>.+?) - (?:IA|prueba(?: (?P<ronda>\d+))? con) (?P<modelo>.+?)(?: \((?P<repeticion>\d+)\))?$")


def leer(nombre: str) -> dict | None:
    """{plano, ronda, modelo, repeticion} de un nombre de corrida de prueba; None si no sigue el formato."""
    m = NOMBRE.match((nombre or "").strip())
    if not m:
        return None
    return {"plano": m["plano"].strip(), "ronda": int(m["ronda"] or 1), "modelo": m["modelo"].strip(),
            "repeticion": int(m["repeticion"] or 1)}


CATALOGO = Path(__file__).resolve().parents[2] / "docs" / "demo" / "rondas.json"


def grupos_de_rondas(catalogo: Path | None = None) -> dict[int, tuple[int, ...]]:
    """{ronda: rondas de su grupo} según `grupos` de docs/demo/rondas.json (versión 2). Las rondas que no están en
    ningún grupo no aparecen: forman un grupo propio (use `grupo_de`). Sin catálogo legible, todas van sueltas."""
    try:
        datos = json.loads((catalogo or CATALOGO).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    grupos: dict[int, tuple[int, ...]] = {}
    for g in datos.get("grupos") or []:
        rondas = tuple(sorted(n for n in (g.get("rondas") or []) if isinstance(n, int)))
        for n in rondas:
            grupos.setdefault(n, rondas)  # una ronda en dos grupos se queda en el primero, como en la web
    return grupos


def grupo_de(ronda: int, grupos: dict[int, tuple[int, ...]]) -> tuple[int, ...]:
    return grupos.get(ronda, (ronda,))


def etiqueta_grupo(rondas: tuple[int, ...]) -> str:
    """«43–45», «59» (como etiquetaGrupo en web/src/features/rondas/lib/rondas.ts)."""
    if len(rondas) == 1:
        return str(rondas[0])
    seguidas = all(b == a + 1 for a, b in zip(rondas, rondas[1:]))
    return f"{rondas[0]}–{rondas[-1]}" if seguidas else ", ".join(map(str, rondas))


def nombre_corrida(plano: str, ronda: int, modelo: str, repeticion: int = 1) -> str:
    """La repetición 1 no lleva sufijo: así los nombres de las rondas anteriores siguen valiendo."""
    return f"{plano} - prueba {ronda} con {modelo}" + (f" ({repeticion})" if repeticion > 1 else "")
