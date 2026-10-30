#!/usr/bin/env python3
"""Comprueba que una cita aparezca literal en un texto de normativa/ (misma comparación que verificar_citas.py).

Uso: python scripts/verificar_fundamento.py normativa/<archivo> "<cita>"
Imprime OK o FALTA y sale con 0 o 1. Lo usan los subagentes de la revisión de ADR-0017 antes de proponer un fundamento.
"""
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
from precheck.motor.verificar_citas import cita_en_normativa, norm  # noqa: E402


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 2:
        sys.exit(__doc__)
    texto = norm((RAIZ / argv[0]).read_text(encoding="utf-8", errors="replace"))
    ok = cita_en_normativa(argv[1], texto)
    print("OK" if ok else "FALTA")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
