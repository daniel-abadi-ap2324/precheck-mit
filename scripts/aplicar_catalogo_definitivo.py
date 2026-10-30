#!/usr/bin/env python3
"""Aplica al catálogo las decisiones de la revisión definitiva de anteproyecto (docs/catalogo-definitivo/decisiones.json).

Cada decisión es una fila {id, veredicto, severidad_final, tipo_final, aplica_si_final, condicion_final, entradas_final,
cita_final, mensaje_final, motivo, ...} (los campos _final en null no cambian nada):
  MANTENER            la regla queda igual; si cambia la severidad, sube la versión
  CORREGIR            se reemplazan los campos indicados y sube la versión, con una nota del cambio
  ELIMINAR            la regla sale de reglas/ y se guarda en reglas_retiradas/<archivo> con su motivo
  FUSIONAR_EN:<id>    igual que ELIMINAR, anotando la regla que la absorbe

Antes de escribir valida todo (gramática de aplica_si y condición, cita literal en normativa/, ids únicos, condición en las
reglas computables, variables de la condición dentro de entradas). Si algo falla no escribe nada y sale con 1.
Las entradas nuevas se agregan a scripts/hechos_documentales.json (contrato de datos de las reglas).

Uso: python scripts/aplicar_catalogo_definitivo.py [--decisiones docs/catalogo-definitivo/decisiones.json] [--simular]
"""
import argparse
import ast
import json
import re
import sys
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
from precheck.motor.evaluador import _normalizar, validar_expresion  # noqa: E402
from precheck.motor.verificar_citas import cita_en_normativa, norm  # noqa: E402

HOY = date.today().isoformat()
FUNCIONES = {"len", "min", "max", "abs", "existe", "True", "False", "None"}


def variables(expr):
    """Claves con punto que usa una expresión (lote.area_m2, proyecto.x…)."""
    if not expr:
        return set()
    salida = set()

    def ruta(n):
        if isinstance(n, ast.Name):
            return n.id
        if isinstance(n, ast.Attribute):
            r = ruta(n.value)
            return r + "." + n.attr if r else None
        return None

    arbol = ast.parse(_normalizar(expr), mode="eval")
    hijos_de_attr = {id(n.value) for n in ast.walk(arbol) if isinstance(n, ast.Attribute)}
    for n in ast.walk(arbol):
        if isinstance(n, (ast.Name, ast.Attribute)) and id(n) not in hijos_de_attr:
            r = ruta(n)
            if r and r not in FUNCIONES:
                salida.add(r)
    return salida


def leer(p):
    texto = p.read_text(encoding="utf-8")
    m = re.match(r"\[\s*\n(\s+)\{", texto)
    return json.loads(texto), (len(m.group(1)) if m else 1)


def escribir(p, datos, sangria):
    p.write_text(json.dumps(datos, ensure_ascii=False, indent=sangria) + "\n", encoding="utf-8")


def textos_normativa(raiz):
    rutas = [raiz / "normativa" / "acuerdo-110" / "texto-completo.md", *sorted((raiz / "normativa").glob("*/textos/*.txt"))]
    return norm("\n".join(p.read_text(encoding="utf-8", errors="replace") for p in rutas if p.exists()))


def aplicar_fila(regla, d):
    """Regla nueva a partir de la original y la decisión (sin validar)."""
    r = json.loads(json.dumps(regla))
    cambios = []
    if d.get("severidad_final") and d["severidad_final"] != r.get("severidad"):
        cambios.append(f"severidad {r.get('severidad')} → {d['severidad_final']}")
        r["severidad"] = d["severidad_final"]
    if d["veredicto"] == "CORREGIR":
        if d.get("tipo_final") and d["tipo_final"] != r.get("tipo"):
            cambios.append(f"tipo {r.get('tipo')} → {d['tipo_final']}")
            r["tipo"] = d["tipo_final"]
        for campo, clave in (("aplica_si_final", "aplica_si"), ("condicion_final", "condicion"), ("entradas_final", "entradas"),
                             ("entradas_opcionales_final", "entradas_opcionales"), ("mensaje_final", "mensaje_no_cumple")):
            if d.get(campo) is not None and d[campo] != r.get(clave):
                cambios.append(clave)
                r[clave] = d[campo]
        if d.get("cita_final") and d["cita_final"] != (r.get("fuente") or {}).get("cita_textual"):
            cambios.append("cita")
            r.setdefault("fuente", {})["cita_textual"] = d["cita_final"]
        for campo, clave in (("articulo_final", "articulo"), ("pagina_final", "pagina_pdf")):
            if d.get(campo) is not None and d[campo] != (r.get("fuente") or {}).get(clave):
                cambios.append(clave)
                r.setdefault("fuente", {})[clave] = d[campo]
        if r.get("tipo") == "criterio":
            r.pop("condicion", None)
            r.pop("tolerancia", None)
    # El motor exige TODAS las entradas antes de evaluar: en condiciones con «or» solo van las imprescindibles (las demás
    # se leen si hacen falta). Solo si la regla no declara ninguna se toman todas las variables de la condición.
    if r.get("condicion") and not r.get("entradas"):
        r["entradas"] = sorted(variables(r["condicion"]))
        cambios.append("entradas")
    if cambios:
        r["version"] = int(r.get("version") or 1) + 1
        nota = f"Versión {r['version']} ({HOY}, revisión definitiva de anteproyecto): {d.get('motivo') or ''} Cambios: {', '.join(dict.fromkeys(cambios))}."
        r["nota"] = (r.get("nota") + " | " if r.get("nota") else "") + nota
    return r, cambios


def validar(r, texto_norma):
    errores = []
    for campo in ("aplica_si", "condicion"):
        if r.get(campo):
            try:
                validar_expresion(r[campo])
            except ValueError as e:
                errores.append(f"{campo}: {e}")
    if r.get("tipo") != "criterio" and not r.get("condicion"):
        errores.append(f"tipo {r.get('tipo')} sin condicion")
    cita = (r.get("fuente") or {}).get("cita_textual")
    if not cita_en_normativa(cita, texto_norma):
        errores.append("la cita no está literal en normativa/")
    return errores


def planificar(raiz, decisiones):
    """(archivos nuevos {ruta: (datos, sangría)}, retiradas {nombre: [reglas]}, errores, resumen)."""
    por_id = {d["id"]: d for d in decisiones}
    texto_norma = textos_normativa(raiz)
    nuevos, retiradas, errores, vistos = {}, {}, [], set()
    resumen = {"MANTENER": 0, "MANTENER_CON_CAMBIO": 0, "CORREGIR": 0, "ELIMINAR": 0, "FUSIONAR": 0, "sin_decision": 0}
    ids_finales = []
    for f in sorted((raiz / "reglas").glob("*.json")):
        datos, sangria = leer(f)
        salida = []
        for regla in datos:
            d = por_id.get(regla["id"])
            if not d:
                resumen["sin_decision"] += 1
                salida.append(regla)
                ids_finales.append(regla["id"])
                continue
            vistos.add(regla["id"])
            v = d["veredicto"]
            if v == "ELIMINAR" or v.startswith("FUSIONAR_EN:"):
                destino = v.split(":", 1)[1] if ":" in v else None
                if destino and destino not in {x["id"] for x in datos} and destino not in por_id:
                    errores.append((regla["id"], f"fusiona en {destino}, que no existe"))
                retiradas.setdefault(f.name, []).append({**regla, "retirada": {"fecha": HOY, "motivo": d.get("motivo"), **({"fusionada_en": destino} if destino else {})}})
                resumen["FUSIONAR" if destino else "ELIMINAR"] += 1
                continue
            if v not in ("MANTENER", "CORREGIR"):
                errores.append((regla["id"], f"veredicto desconocido {v!r}"))
                salida.append(regla)
                continue
            nueva, cambios = aplicar_fila(regla, d)
            errores += [(regla["id"], e) for e in validar(nueva, texto_norma)]
            resumen["CORREGIR" if v == "CORREGIR" else ("MANTENER_CON_CAMBIO" if cambios else "MANTENER")] += 1
            salida.append(nueva)
            ids_finales.append(nueva["id"])
        nuevos[f] = (salida, sangria)
    for i in sorted(set(por_id) - vistos):
        errores.append((i, "la decisión no corresponde a ninguna regla del catálogo"))
    dup = sorted({i for i in ids_finales if ids_finales.count(i) > 1})
    errores += [(i, "id repetido") for i in dup]
    return nuevos, retiradas, errores, resumen


def actualizar_contrato(raiz, nuevos):
    """Agrega a hechos_documentales.json las entradas que ninguna regla había usado antes."""
    p = raiz / "scripts" / "hechos_documentales.json"
    contrato = json.loads(p.read_text(encoding="utf-8"))
    conocidas = {d["clave"] for d in contrato["datos"]}
    usadas = {}
    for datos, _ in nuevos.values():
        for r in datos:
            for e in (r.get("entradas") or []) + (r.get("entradas_opcionales") or []):
                usadas.setdefault(e, []).append(r["id"])
    antes = {e for f in (raiz / "reglas").glob("*.json") for r in json.loads(f.read_text(encoding="utf-8")) for e in r.get("entradas") or []}
    agregadas = []
    for clave, ids in sorted(usadas.items()):
        if clave in conocidas or clave in antes or clave.startswith(("expediente.", "registro_publico.", "tramite", "lote.norma_aplicable", "lote.codigo_zona")):
            continue
        es_numero = bool(re.search(r"(_m|_m2|_pct|_ha|_ml|cantidad|numero|unidades|pisos)$", clave))
        contrato["datos"].append({"clave": clave, "tipo": "numero" if es_numero else "bool", "productor": "declarado en el plano (prerrequisito) o IA",
                                  "definicion": f"Dato que pide la revisión definitiva de anteproyecto ({HOY}).", "reglas": sorted(set(ids))})
        agregadas.append(clave)
    if agregadas:
        p.write_text(json.dumps(contrato, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return agregadas


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--decisiones", default=str(RAIZ / "docs" / "catalogo-definitivo" / "decisiones.json"))
    ap.add_argument("--simular", action="store_true", help="valida y cuenta sin escribir")
    ap.add_argument("--nuevas", help="reglas nuevas (lista JSON) que se escriben en reglas/reglas_definitivo_nuevas_borrador.json")
    a = ap.parse_args(argv)
    decisiones = json.loads(Path(a.decisiones).read_text(encoding="utf-8"))
    nuevos, retiradas, errores, resumen = planificar(RAIZ, decisiones)
    archivo_nuevas = RAIZ / "reglas" / "reglas_definitivo_nuevas_borrador.json"
    if a.nuevas:
        nuevas = json.loads(Path(a.nuevas).read_text(encoding="utf-8"))
        existentes = {r["id"] for datos, _ in nuevos.values() for r in datos}
        texto_norma = textos_normativa(RAIZ)
        for r in nuevas:
            if r.get("condicion") and not r.get("entradas"):
                r["entradas"] = sorted(variables(r["condicion"]))
            if r["id"] in existentes:
                errores.append((r["id"], "regla nueva con id ya existente"))
            errores += [(r["id"], e) for e in validar(r, texto_norma)]
            existentes.add(r["id"])
        nuevos[archivo_nuevas] = (nuevas, 1)
        resumen["NUEVAS"] = len(nuevas)
    print(json.dumps(resumen, ensure_ascii=False))
    if errores:
        for i, e in errores[:200]:
            print(f"ERROR {i}: {e}")
        print(f"{len(errores)} errores: no se escribió nada")
        return 1
    if a.simular:
        print("simulación: todo válido, no se escribió nada")
        return 0
    agregadas = actualizar_contrato(RAIZ, nuevos)
    for f, (datos, sangria) in nuevos.items():
        escribir(f, datos, sangria)
    destino = RAIZ / "reglas_retiradas"
    destino.mkdir(exist_ok=True)
    for nombre, reglas in retiradas.items():
        p = destino / nombre
        previas = json.loads(p.read_text(encoding="utf-8")) if p.exists() else []
        escribir(p, previas + reglas, 1)
    print(f"escrito: {len(nuevos)} archivos de reglas, {sum(len(v) for v in retiradas.values())} retiradas, {len(agregadas)} datos nuevos en el contrato")
    return 0


if __name__ == "__main__":
    sys.exit(main())
