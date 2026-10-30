#!/usr/bin/env python3
"""Compuerta automática de una ronda: ¿el tamaño de los dictámenes se salió de lo esperado? (solo lectura de web/.data)

Protege la cuota cuando se programan rondas encadenadas: si una ronda ya infló los dictámenes (más del tope por corrida), la
siguiente no se lanza. No evalúa calidad ni acierto: solo el tamaño, que es lo que se midió como señal temprana de problemas.

Uso: python scripts/compuerta_ronda.py --ronda 9 --tope "Casco Antiguo=60,San Francisco=50"
Sale con 0 si todas las corridas terminadas respetan el tope y hay al menos una; con 1 si alguna lo supera o no hay ninguna.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import diagnostico_variacion as d  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--ronda", type=int, required=True)
    ap.add_argument("--tope", required=True, help="plano=máximo de decisiones por corrida, separados por coma")
    ap.add_argument("--datos", default=str(d.RAIZ / "web" / ".data"))
    a = ap.parse_args(argv)
    topes = {k.strip(): int(v) for k, v in (x.split("=") for x in a.tope.split(","))}
    corridas = [c for c in d.cargar_corridas(Path(a.datos)) if c["ronda"] == a.ronda and c["plano"] in topes]
    if not corridas:
        print(f"COMPUERTA: no hay corridas terminadas de la ronda {a.ronda}")
        return 1
    mal = [c for c in corridas if c["decisiones_total"] > topes[c["plano"]]]
    for c in corridas:
        print(f"  {c['plano']} · {c['modelo']}: {c['decisiones_total']} decisiones (tope {topes[c['plano']]})" + ("  <-- SUPERA" if c in mal else ""))
    print("COMPUERTA:", "FALLA" if mal else "OK")
    return 1 if mal else 0


if __name__ == "__main__":
    raise SystemExit(main())
