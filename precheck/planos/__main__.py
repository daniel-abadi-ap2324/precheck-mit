import argparse
import sys

from precheck.planos.extraer import extraer


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m precheck.planos", description="Extrae datos de un plano PDF (texto vectorial u OCR).")
    ap.add_argument("pdf")
    ap.add_argument("--salida", required=True, help="carpeta donde escribir extraccion.json y las miniaturas")
    ap.add_argument("--lineas", action="store_true", help="guardar también lineas.json (texto leído, para calibrar)")
    a = ap.parse_args(argv)
    try:
        extraer(a.pdf, a.salida, guardar_lineas=a.lineas)
    except Exception as e:  # noqa: BLE001 — la CLI informa y sale con código distinto de 0
        print(f"No se pudo leer el plano: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
