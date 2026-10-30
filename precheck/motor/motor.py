#!/usr/bin/env python3
"""Motor de reglas de referencia para el PreCheck MUPA.

Evalúa reglas declarativas (JSON o YAML) contra los hechos de un proyecto y
produce CUMPLE / NO_CUMPLE / REQUIERE_REVISION / NO_APLICA con registro
auditable. Sin dependencias obligatorias (pyyaml es opcional).
"""
import argparse
import datetime as dt
import hashlib
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from precheck.motor.evaluador import (  # noqa: E402,F401
    CUMPLE,
    NO_APLICA,
    NO_CUMPLE,
    REVISION,
    DatoFaltante,
    Evaluador,
    en_borde,
    evaluar_regla,
    obtener_hecho,
    vigente,
)


def cargar(ruta):
    with open(ruta, encoding="utf-8") as f:
        texto = f.read()
    if ruta.endswith((".yaml", ".yml")):
        try:
            import yaml
        except ImportError:
            sys.exit("pyyaml no está instalado: usa reglas en JSON o instala pyyaml")
        return yaml.safe_load(texto)
    return json.loads(texto)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--reglas", required=True)
    p.add_argument("--proyecto", required=True)
    p.add_argument("--salida")
    p.add_argument("--umbral-confianza", type=float, default=0.85)
    p.add_argument("--fecha", help="fecha de ingreso del expediente (AAAA-MM-DD); por defecto hoy")
    p.add_argument("--modo-prueba", action="store_true", help="evalúa también reglas en borrador")
    a = p.parse_args()

    reglas = cargar(a.reglas)
    reglas = reglas.get("reglas", reglas) if isinstance(reglas, dict) else reglas
    hechos = cargar(a.proyecto)
    fecha = a.fecha or dt.date.today().isoformat()
    ahora = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

    resultados = []
    for r in reglas:
        estado = r.get("estado_revision", "borrador")
        if estado == "retirada" or (estado != "aprobada" and not a.modo_prueba) or not vigente(r, fecha):
            continue
        res = evaluar_regla(r, hechos, a.umbral_confianza)
        res["evaluado_en"] = ahora
        res["hash"] = hashlib.sha256(json.dumps(res, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()
        resultados.append(res)

    resumen = {}
    for r in resultados:
        resumen[r["resultado"]] = resumen.get(r["resultado"], 0) + 1
    bloqueantes = [r["regla_id"] for r in resultados if r["resultado"] == NO_CUMPLE and r.get("severidad") == "bloqueante"]
    # Sin reglas evaluadas no hay nada que afirmar: el global nunca es CUMPLE (principio 2).
    if bloqueantes:
        global_ = NO_CUMPLE
    elif not resultados or resumen.get(REVISION):
        global_ = REVISION
    else:
        global_ = CUMPLE
    # Las reglas en borrador de --modo-prueba no emiten resultado oficial (ADR-0005).
    oficial = bool(resultados) and not a.modo_prueba
    salida = {"fecha_expediente": fecha, "resultado_global": global_, "oficial": oficial, "resumen": resumen,
              "bloqueantes": bloqueantes, "modo_prueba": a.modo_prueba, "resultados": resultados}
    texto = json.dumps(salida, indent=2, ensure_ascii=False, default=str)
    if a.salida:
        with open(a.salida, "w", encoding="utf-8") as f:
            f.write(texto)
    print(texto if not a.salida else f"{global_} {resumen} -> {a.salida}")


if __name__ == "__main__":
    main()
