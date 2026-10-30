#!/usr/bin/env python3
"""Pasa reglas propuestas (docs/propuestas/catalogo/reglas-nuevas-*.borrador.json) a reglas/ como `borrador` y documenta sus datos.

No aprueba nada: «borrador» es el estado de las otras reglas del catálogo (resultado indicativo y no oficial). Para cada archivo:
- copia las reglas cuyo id no existe en reglas/ a reglas/reglas_<nombre>_borrador.json, con la nota ajustada;
- agrega a scripts/hechos_documentales.json los datos de entrada que no usaba ninguna regla anterior (quién los produce y qué se verifica).

Uso: python scripts/activar_propuestas.py [--simular] [archivo.borrador.json ...]   (sin archivos: todos los reglas-nuevas-*)
"""
import argparse
import glob
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PROPUESTAS = RAIZ / "docs" / "propuestas" / "catalogo"
CONTRATO = RAIZ / "scripts" / "hechos_documentales.json"
NOTA_VIEJA = re.compile(r"PROPUESTA no aprobada \(docs/propuestas/catalogo\)(?:: entra al catálogo solo por el gobierno de reglas con cuatro ojos\.|\.)")
NOTA_NUEVA = "Borrador sin aprobar (origen: docs/propuestas/catalogo): su aprobación oficial es por el gobierno de reglas con cuatro ojos."
CLAVE = re.compile(r"[a-z_]+(?:\.[a-z_0-9]+)+")
#: No son datos del contrato: la norma y la zona tienen su propia lectura; el trámite lo pone la plataforma.
FUERA_DEL_CONTRATO = ("lote.norma_aplicable", "lote.codigo_zona", "tramite")
FORMULARIO = {"expediente.requiere_bcbrp", "lote.servidumbre_fluvial_o_pluvial", "lote.servidumbre_otra_entidad", "proyecto.es_urbanizacion_o_parcelacion"}


def cargar(ruta: Path):
    return json.loads(ruta.read_text(encoding="utf-8"))


def claves_de(regla: dict) -> list[str]:
    """Datos del contrato que usa la regla. Las `entradas` pasan por el mismo filtro: con ellas entró «tramite», que
    pone la plataforma, como dato sí/no de la IA (ADR-0019)."""
    salida = []
    for m in list(regla.get("entradas", [])) + CLAVE.findall((regla.get("aplica_si") or "") + " " + (regla.get("condicion") or "")):
        if m not in salida and m not in FUERA_DEL_CONTRATO and "." in m and not m.startswith(("re.", "json.")):
            salida.append(m)
    return salida


def tipo_de(clave: str, reglas: list[dict]) -> str:
    patron = re.compile(re.escape(clave) + r"\s*(?:<=|>=|<|>)")
    return "numero" if any(patron.search(r.get("condicion", "") + " " + r.get("aplica_si", "")) for r in reglas) else "bool"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("archivos", nargs="*")
    ap.add_argument("--simular", action="store_true")
    a = ap.parse_args(argv)
    archivos = [Path(x) for x in a.archivos] or sorted(PROPUESTAS.glob("reglas-nuevas-*.borrador.json"))
    existentes = {r["id"] for f in (RAIZ / "reglas").glob("*.json") for r in cargar(f)}
    contrato = cargar(CONTRATO)
    conocidas = {d["clave"] for d in contrato["datos"]}
    total = 0
    for f in archivos:
        reglas = [r for r in cargar(f) if r["id"] not in existentes]
        if not reglas:
            print(f"{f.name}: nada nuevo")
            continue
        nombre = f.name.removeprefix("reglas-nuevas-").removesuffix(".borrador.json").replace("-", "_")
        destino = RAIZ / "reglas" / f"reglas_ampliacion_{nombre}_borrador.json"   # nunca el nombre de un archivo existente
        if destino.exists() and not a.simular:
            print(f"{f.name}: {destino.name} ya existe; no se sobrescribe")
            continue
        for r in reglas:
            r["nota"] = NOTA_VIEJA.sub(NOTA_NUEVA, r.get("nota", ""))
        usos: dict[str, list[dict]] = {}
        for r in reglas:
            for k in claves_de(r):
                usos.setdefault(k, []).append(r)
        nuevas = {k: v for k, v in usos.items() if k not in conocidas}
        print(f"{f.name}: {len(reglas)} reglas -> {destino.name}; {len(nuevas)} datos nuevos en el contrato")
        total += len(reglas)
        if a.simular:
            continue
        destino.write_text(json.dumps(reglas, ensure_ascii=False, indent=2), encoding="utf-8")
        for k, rs in nuevas.items():
            productor = "formulario" if k in FORMULARIO else "expediente (adjunto) o IA" if k.startswith("expediente.") else "ia"
            contrato["datos"].append({"clave": k, "tipo": tipo_de(k, rs), "productor": productor,
                                      "definicion": f"{rs[0]['titulo']} (cita: «{rs[0]['fuente']['cita_textual'][:90]}»)", "reglas": [r["id"] for r in rs]})
            conocidas.add(k)
        for k, rs in usos.items():  # los datos que ya estaban en el contrato suman estas reglas
            if k not in nuevas:
                d = next(x for x in contrato["datos"] if x["clave"] == k)
                d["reglas"] = sorted(set(d["reglas"]) | {r["id"] for r in rs})
        existentes |= {r["id"] for r in reglas}
    if not a.simular:
        CONTRATO.write_text(json.dumps(contrato, ensure_ascii=False, indent=1), encoding="utf-8")
    print("total de reglas", total, "(simulación)" if a.simular else "")
    return 0


if __name__ == "__main__":
    sys.exit(main())
