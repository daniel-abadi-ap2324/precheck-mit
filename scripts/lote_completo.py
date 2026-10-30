"""¿Terminó el lote? Sale con 0 si cada corrida del resumen de lote_ia.py quedó hecha o no se lanzó a propósito.

Uso: python scripts/lote_completo.py tmp/noche/<nombre>.json

Cuenta como terminada: estado «done», «no lanzada…» (no alcanzaba antes de la hora tope) o un error de tope de gasto.
Cualquier otra (interrumpida, fallida, sigue en curso) deja el lote incompleto y scripts/lote.sh lo vuelve a correr.
"""
import json
import sys


def completo(resumen: list[dict]) -> bool:
    return all(
        r.get("estado") == "done" or str(r.get("estado", "")).startswith("no lanzada") or "Tope" in (r.get("error") or "")
        for r in resumen
    )


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as f:
        sys.exit(0 if completo(json.load(f)["resumen"]) else 1)
