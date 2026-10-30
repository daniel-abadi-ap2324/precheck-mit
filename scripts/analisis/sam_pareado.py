#!/usr/bin/env python3
"""Prueba pareada de SAM (ONNX) en la propuesta de regiones con visión: la misma respuesta del modelo, con y sin SAM.

Cada repetición llama al modelo una vez (sin SAM), guarda sus respuestas y las reproduce en una segunda propuesta con SAM:
así la única diferencia es el afinado. Mide las dos con scripts/medir_regiones.py contra la verdad.

El modelo es cualquiera de `regiones.ejecutor_vision`: un Claude (alias o id completo) o `deepseek-flash`. Con DeepSeek,
`--gasto` es la carpeta de `deepseek_gasto.json` (la de la web, para que el gasto sume en el mismo contador) y el tope
es el de PRECHECK_DEEPSEEK_TOPE_USD. Una repetición que falla queda anotada con su error y no corta las demás.

Uso: python scripts/analisis/sam_pareado.py --pdf original.pdf --extraccion extraccion.json --verdad verdad.json
         --modelo-sam <carpeta ONNX> --salida <carpeta> [--repeticiones 3] [--modelo sonnet] [--gasto <carpeta>]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ))

from precheck.planos import regiones as rg  # noqa: E402
from precheck.planos.sam_onnx import PredictorOnnx  # noqa: E402


def medir(propuesta: Path, verdad: Path, salida: Path) -> dict:
    subprocess.run([sys.executable, str(RAIZ / "scripts" / "medir_regiones.py"), "--propuesta", str(propuesta),
                    "--verdad", str(verdad), "--json", str(salida)], check=True, capture_output=True)
    return json.loads(salida.read_text(encoding="utf-8"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--extraccion", required=True)
    ap.add_argument("--verdad", required=True)
    ap.add_argument("--modelo-sam", required=True)
    ap.add_argument("--salida", required=True)
    ap.add_argument("--repeticiones", type=int, default=3)
    ap.add_argument("--modelo", default="sonnet")
    ap.add_argument("--gasto", default=None, help="carpeta de deepseek_gasto.json (solo DeepSeek)")
    a = ap.parse_args()
    sam = PredictorOnnx(a.modelo_sam)
    gasto = Path(a.gasto) if a.gasto else None
    resumen = []
    for i in range(1, a.repeticiones + 1):
        grabadas: list[str] = []
        uso: list[dict] = []
        deepseek = a.modelo.startswith("deepseek")
        llamar = rg.ejecutor_vision(a.modelo, gasto) if deepseek else (lambda p, c: rg.llamar_claude(p, c, a.modelo, uso=uso))
        usd_antes = float(rg.leer_gasto_deepseek(gasto).get("usd") or 0) if deepseek and gasto else None

        def grabar(prompt: str, carpeta: Path) -> str:
            texto = llamar(prompt, carpeta)
            grabadas.append(texto)
            return texto

        base = Path(a.salida) / f"rep{i}"
        fila: dict = {"rep": i, "modelo": a.modelo}
        t0 = time.time()
        avisos: list[str] = []
        rg.proponer(a.pdf, base / "sin-sam", vision=True, extraccion=a.extraccion, ejecutar=grabar, sam=False, avisos=avisos)
        fila["segundos"] = round(time.time() - t0, 1)
        fila["llamadas"] = len(grabadas)
        fila["avisos"] = avisos
        if deepseek and usd_antes is not None:
            fila["costo_usd"] = round(float(rg.leer_gasto_deepseek(gasto).get("usd") or 0) - usd_antes, 4)
            fila["costo_nota"] = "precio de lista de DeepSeek (el contador de la web)"
        elif uso:
            fila["costo_usd"] = round(sum(float(u.get("costo_usd") or 0) for u in uso), 4)
            fila["costo_nota"] = "estimación de Claude Code a precios de la API, no la cuota de la suscripción"
        if not grabadas:
            # La llamada falló antes de responder (proponer la omite con un aviso): no hay nada que reproducir con SAM.
            fila["error"] = "el modelo no respondió; ver avisos"
            resumen.append(fila)
            (Path(a.salida) / "resumen.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"rep {i} sin respuesta: {fila['avisos']}", flush=True)
            continue
        # `sam=False` no es None: proponer no intenta cargar ningún SAM. Con la respuesta grabada, ahora con SAM.
        avisos_sam: list[str] = []
        rg.proponer(a.pdf, base / "con-sam", vision=True, extraccion=a.extraccion, ejecutar=lambda p, c, it=iter(list(grabadas)): next(it),
                    sam=sam, avisos=avisos_sam)
        fila["avisos_con_sam"] = avisos_sam
        for nombre, carpeta in (("sin", base / "sin-sam"), ("con", base / "con-sam")):
            m = medir(carpeta / "regiones.json", Path(a.verdad), carpeta / "metricas.json")
            fila[nombre] = m
        resumen.append(fila)
        (Path(a.salida) / "resumen.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"rep {i} listo", flush=True)
    print(json.dumps(resumen, ensure_ascii=False)[:4000])


if __name__ == "__main__":
    main()
