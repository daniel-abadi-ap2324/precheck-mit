#!/usr/bin/env python3
"""Aplica al catálogo las correcciones de la revisión del 9-oct-2026 (docs/revision-catalogo/revision-subagentes.md).

Dos pasos, cada uno idempotente y en su propio commit:

  notas      Normaliza la nota de versión del catálogo definitivo («vN (fecha, revisión definitiva de anteproyecto): …» →
             «Versión N (fecha, revisión definitiva de anteproyecto): …»), la convención que exige tests/test_zonas_exceptuadas.py.
             No sube la versión: solo cambia el formato de la nota.
  aplicar    Aplica las correcciones de CORRECCIONES (abajo), identificadas por id. Cada corrección lleva la versión que tiene
             hoy la regla en el catálogo (`version`): si la regla está en esa versión, se aplica y sube a version + 1 con la
             nota «Versión N: …»; si ya está en version + 1 con esa nota, se omite (ya aplicada); si está en otra versión,
             el script rehúsa tocarla y sale con 1 sin escribir nada. También actualiza scripts/hechos_documentales.json.

Antes de escribir valida todo: gramática de aplica_si y condición, cita literal en normativa/, claves de la condición
dentro de entradas ∪ entradas_opcionales e ids únicos. Si algo falla no escribe nada y sale con 1.
Cada archivo conserva su sangría (1 o 2 espacios, detectada por archivo) y ensure_ascii=False.

Uso: python scripts/aplicar_correcciones_reglas.py {notas|aplicar} [--grupo a,b,…] [--simular]
(--grupo limita «aplicar» a los grupos del encargo: a=hallazgo 12, b=15, e=19, f=20, g=8, h=14; sin él, todos)
"""
import argparse
import ast
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "scripts"))
from aplicar_catalogo_definitivo import escribir, leer, textos_normativa, variables  # noqa: E402
from precheck.motor.evaluador import _normalizar, validar_expresion  # noqa: E402
from precheck.motor.verificar_citas import cita_en_normativa  # noqa: E402

FECHA = "2026-10-09"
A270 = "Acuerdo N°270 de 23-09-2025 (G.O. 30388-A), Anexo 2: Fichas Actualizadas de San Francisco"

# --- Paso 1: formato de la nota ------------------------------------------------------------------------------------------
NOTA_DEFINITIVA = re.compile(r"(^|\| )v(\d+) \((\d{4}-\d{2}-\d{2}), revisión definitiva de anteproyecto\):")


def normalizar_nota(nota):
    return NOTA_DEFINITIVA.sub(lambda m: f"{m.group(1)}Versión {m.group(2)} ({m.group(3)}, revisión definitiva de anteproyecto):",
                               nota)


# --- Paso 2: correcciones por id -----------------------------------------------------------------------------------------
# Hallazgo 12: claves que la condición lee y no estaban declaradas. Todas están solo dentro de una rama de un «or» (en
# PLOT-R1..R5-RETIROS y LC-R2B-LOTE-AREA el «or» está anidado bajo un «and»): van a entradas_opcionales, porque el motor
# exige TODAS las `entradas` antes de evaluar y en `entradas` dejarían la regla en revisión aunque la otra rama baste.
H12 = {
    "A110-ART144-TITULAR-O-TRANSFERENCIA": (1, ["expediente.transferencia_permiso_registrada"]),
    "A110-ART182-SOLICITANTE-OCUPACION": (1, ["expediente.declaracion_abandono_o_defuncion.adjunto"]),
    "A110-ART113-EIA-ATC": (1, ["expediente.aplica_guia_buenas_practicas"]),
    "A110-ART29-VIGENCIA-ANTEPROYECTO": (1, ["anteproyecto.revalidado"]),
    "A110-ART109-PROFESIONAL-O-CESION": (1, ["expediente.cesion_derechos_notariada.adjunto"]),
    "A110-ART164-PDC-O-ATC-VIGENTE": (1, ["atc.vigente"]),
    "CA-RMH2-DENSIDAD": (2, ["expediente.aprobacion_mivi_tolerancia_densidad.adjunto"]),
    "LC-R2A-LOTE-AREA": (2, ["proyecto.unidades_vivienda"]),
    "LC-R2B-LOTE-AREA": (2, ["proyecto.unidades_vivienda"]),
    "LC-R2B-LOTE-FRENTE": (2, ["proyecto.unidades_vivienda"]),
    "ML1-COMBINADO-ALTURA-COMERCIAL": (2, ["lote.codigo_zona"]),
    "ML1-TODAS-LINEA-CONSTRUCCION": (2, ["lote.lc_oficial_desde_lp_m"]),
    "ML2-TODAS-LINEA-CONSTRUCCION": (2, ["lote.lc_oficial_desde_lp_m"]),
    "PLOT-R1-RETIROS": (2, ["lote.lc_oficial_desde_lp_m"]),
    "PLOT-R2-RETIROS": (2, ["lote.lc_oficial_desde_lp_m"]),
    "PLOT-R3-RETIROS": (2, ["lote.lc_oficial_desde_lp_m", "proyecto.retiro_lateral_m"]),
    "PLOT-R4-RETIROS": (2, ["lote.lc_oficial_desde_lp_m", "lote.lc_oficial_establecida", "proyecto.retiro_frontal_m",
                            "proyecto.retiro_lateral_m"]),
    "PLOT-R5-RETIROS": (2, ["lote.lc_oficial_desde_lp_m", "lote.lc_oficial_establecida", "proyecto.retiro_frontal_m",
                            "proyecto.retiro_lateral_m"]),
    "SF-PAITILLA-UT1-R6-ALTURA": (2, ["lote.area_m2", "proyecto.cumple_condiciones_pisos_adicionales"]),
}


def _correcciones_h12():
    for rid, (version, claves) in H12.items():
        yield {"id": rid, "version": version, "grupo": "a",
               "entradas_opcionales": claves,
               "nota": (f"se declaran en entradas_opcionales las claves que la condición lee y no estaban declaradas "
                        f"({', '.join(claves)}): solo se leen en una rama de un «o», así que se piden al profesional y a la IA "
                        "(scripts/datos_pedidos.py) sin dejar la regla en revisión cuando la otra rama basta. Hallazgo 12 de "
                        "la revisión del 9-oct-2026. Sin cambio de valores ni de cita.")}


# Hallazgo 15: la cita de estas 10 reglas está literal en el Acuerdo 270 (Anexo 2), pero la fuente decía «Anexo 4 PLOT,
# Ficha R2/R6»: contra esa fuente la cita no es literal. Se corrige norma, artículo y página (página impresa del Anexo 2
# donde está la cita). Línea = normativa/zonificacion/textos/acuerdo270_sf_y_anexo2.txt.
H15 = [
    ("SF-VILLA-LILLA-UT1-R6-PROG-RETIROS", "Villa Lilla", 1, 2, "130-148"),
    ("SF-VILLA-LILLA-UT3-R6-RETIROS", "Villa Lilla", 3, 6, "283-293"),
    ("SF-PAITILLA-UT1-R6-LOTE-AREA", "Paitilla", 1, 31, "1384-1388"),
    ("SF-LOMA-ALEGRE-Y-ALTOS-DEL-GOLF-UT1-R2-DENSIDAD", "Loma Alegre y Altos del Golf", 1, 73, "3639-3643"),
    ("SF-LOMA-ALEGRE-Y-ALTOS-DEL-GOLF-UT1-R2-PROG-DENSIDAD", "Loma Alegre y Altos del Golf", 1, 73, "3639-3645"),
    ("SF-LOMA-ALEGRE-Y-ALTOS-DEL-GOLF-UT1-R2-LOTE-AREA", "Loma Alegre y Altos del Golf", 1, 74, "3753-3759"),
    ("SF-LOMA-ALEGRE-Y-ALTOS-DEL-GOLF-UT1-R2-PROG-LOTE-AREA", "Loma Alegre y Altos del Golf", 1, 74, "3757-3762"),
    ("SF-LOMA-ALEGRE-Y-ALTOS-DEL-GOLF-UT1-R2-RETIROS", "Loma Alegre y Altos del Golf", 1, 74, "3763-3773"),
    ("SF-LOMA-ALEGRE-Y-ALTOS-DEL-GOLF-UT1-R2-PROG-RETIROS", "Loma Alegre y Altos del Golf", 1, 74, "3763-3773"),
    ("SF-LOMA-ALEGRE-Y-ALTOS-DEL-GOLF-UT1-R2-ESTACIONAMIENTOS", "Loma Alegre y Altos del Golf", 1, 74, "3777-3782"),
]


def _correcciones_h15():
    for rid, sector, ut, pagina, lineas in H15:
        yield {"id": rid, "version": 2, "grupo": "b",
               "fuente": {"norma": A270, "articulo": f"Anexo 2, {sector}, Unidad Territorial {ut}", "pagina_pdf": pagina},
               "nota": (f"la fuente decía «Anexo 4 PLOT, Ficha {'R2' if 'LOMA-ALEGRE' in rid else 'R6'}», pero la cita está literal en el Acuerdo 270, Anexo 2 "
                        f"({sector}, Unidad Territorial {ut}; acuerdo270_sf_y_anexo2.txt, líneas {lineas}): se corrigen norma, "
                        f"artículo y página ({pagina}). Contra la fuente anterior la cita no era literal (hallazgo 15). "
                        "Sin cambio de cita ni de valores: el valor de la condición coincide con esas líneas.")}


CORRECCIONES = [
    *_correcciones_h12(),
    *_correcciones_h15(),
    # Hallazgo 19: grafías que no usa ninguna ficha ni el Documento Gráfico; la correcta ya está en la lista.
    {"id": "PLOT-ART89-EQUIPARACION-SF", "version": 1, "grupo": "e",
     "aplica_si": ("lote.norma_aplicable == 'PLOT-A61-2021+A270-2025' and lote.codigo_zona in ['R2', '1R2', 'RM', '1RM', "
                   "'RM-2', '1RM-2', 'ZM4', '1ZM4', 'ZM8', '1ZM8', 'EP', '1EP']"),
     "nota": ("se quitan del aplica_si 'RM2' y '1RM2': el Art. 89 escribe «1RM-2» (acuerdo61_2021_plot_gaceta.txt, línea 2250) "
              "y las fichas del Anexo 4 solo usan «RM-2»; la grafía sin guion solo aparece una vez en el OCR del listado de "
              "códigos (línea 1147). 'RM-2' y '1RM-2' ya estaban en la lista; zona.clave() sigue sugiriendo la grafía con "
              "guion si la CEUS llega sin él (hallazgo 19).")},
    {"id": "PLOT-ART54-4AA-DISTANCIA-30M", "version": 1, "grupo": "e",
     "aplica_si": "lote.norma_aplicable == 'PLOT-A61-2021' and lote.codigo_zona in ['4A-A'] and proyecto.obra_nueva == true",
     "nota": ("se quita del aplica_si '4AA': el PLOT escribe «4A-A» (acuerdo61_2021_plot_gaceta.txt, líneas 1432 y 1464; "
              "codigos-zona.md) y '4AA' no aparece en ningún texto de normativa/; '4A-A' ya estaba en la lista (hallazgo 19).")},
    # Hallazgo 20: el Art. 123 está en el Capítulo XII «Permiso digital para obras menores» (el Art. 119 incluye las cercas).
    {"id": "A110-CERCA-TEMP-LATERAL", "version": 1, "grupo": "f",
     "aplica_si": "existe(cerca_temporal.altura_lateral_m) and tramite == 'OBRAS_MENORES'",
     "nota": ("se acota al trámite de obras menores: el Art. 123 («En caso de solicitudes que tengan que ver con cercas "
              "temporales…») está en el Capítulo XII, «PERMISO DIGITAL PARA OBRAS MENORES», y el Art. 119 incluye las "
              "«cercas» en esa categoría (texto-completo.md, líneas 635-638 y 685-687). Antes aplicaba a cualquier trámite "
              "con el dato (hallazgo 20).")},
    {"id": "A110-CERCA-TEMP-FRONTAL", "version": 1, "grupo": "f",
     "aplica_si": "existe(cerca_temporal.altura_frontal_m) and tramite == 'OBRAS_MENORES'",
     "nota": ("se acota al trámite de obras menores: el Art. 123 («En caso de solicitudes que tengan que ver con cercas "
              "temporales…») está en el Capítulo XII, «PERMISO DIGITAL PARA OBRAS MENORES», y el Art. 119 incluye las "
              "«cercas» en esa categoría (texto-completo.md, líneas 635-638 y 685-687). Antes aplicaba a cualquier trámite "
              "con el dato (hallazgo 20).")},
    # Hallazgo 8: el requisito es para «adiciones y mejoras a edificaciones incorporadas al Régimen de Propiedad Horizontal»
    # (Arts. 21.5, 35.9, 121.4, 132.5 y 157.6). En el fotovoltaico (Art. 96.6) el texto es «paneles fotovoltaicos sobre
    # edificaciones existentes incorporadas al Régimen»: ahí se mantiene el hecho expediente.propiedad_horizontal.
    {"id": "A110-ART21-PH-REGLAMENTO-COPROPIETARIOS", "version": 1, "grupo": "g",
     "aplica_si": ("(tramite in ['RLA', 'PLANO_MISCELANEO', 'OBRAS_MENORES', 'PDC', 'DEMOLICION'] and "
                   "expediente.adiciones_mejoras_edificacion_ph == true) or "
                   "(tramite == 'FOTOVOLTAICO' and expediente.propiedad_horizontal == true)"),
     "nota": ("se acota a «adiciones y mejoras a edificaciones incorporadas al Régimen de Propiedad Horizontal», que es lo que "
              "dicen el Art. 21, num. 5 (texto-completo.md, línea 135) y sus equivalentes 35.9 (línea 224), 121.4 (672), "
              "132.5 (738) y 157.6 (906), con el hecho nuevo expediente.adiciones_mejoras_edificacion_ph. Antes bastaba "
              "expediente.propiedad_horizontal y la regla bloqueaba, p. ej., el anteproyecto de un edificio PH nuevo, que aún "
              "no tiene reglamento de copropietarios. En el plano fotovoltaico se mantiene expediente.propiedad_horizontal: el "
              "Art. 96, num. 6 (línea 529) habla de «paneles fotovoltaicos sobre edificaciones existentes incorporadas al "
              "Régimen» (hallazgo 8).")},
]

# Contrato de datos (scripts/hechos_documentales.json): reglas que usan cada dato y datos nuevos.
HECHOS_REGLAS = {
    # Hallazgo 14 (verificación): las reglas del Anexo III creadas el 9-oct usan los mismos hechos que sus pares del Anexo IV.
    "plano.localizacion_regional.escala_1_5000": ["A110-AIII-4-ESCALA-REGIONAL"],
    "plano.localizacion_general.linderos_con_rumbos": ["A110-AIII-5-LINDEROS-RUMBOS"],
    "plano.localizacion_general.uso_colindantes": ["A110-AIII-5-USO-COLINDANTES"],
    "plano.estacionamientos.discapacidad_contemplados": ["A110-AIII-5-ESTAC-DISCAPACIDAD"],
    "plano.secciones.transversal_y_longitudinal": ["A110-AIII-8-SECCIONES"],
    "proyecto.estacionamientos": ["A110-AIII-5-ESTAC-DISCAPACIDAD"],
}
HECHOS_DEFINICION = {
    "plano.localizacion_general.ocupacion_maxima_indicada": {
        "productor": "ia",
        "definicion": "Anteproyecto: área de ocupación máxima indicada en la localización general (cita: «Área de ocupación máxima.»)"},
}
HECHOS_NUEVOS = [
    {"clave": "expediente.adiciones_mejoras_edificacion_ph", "tipo": "bool", "productor": "expediente (adjunto) o IA",
     "definicion": ("El trámite es de adiciones y mejoras a una edificación ya incorporada al Régimen de Propiedad Horizontal "
                    "(cita: «En caso de tratarse de adiciones y mejoras a edificaciones incorporadas al Régimen de Propiedad "
                    "Horizontal»). Un edificio PH nuevo no lo es."),
     "reglas": ["A110-ART21-PH-REGLAMENTO-COPROPIETARIOS"]},
]


def _ramas_or(expr):
    """Claves que la expresión solo lee dentro de una rama de un «or» (no en un conjunto «and» de la raíz)."""
    raiz = ast.parse(_normalizar(expr), mode="eval").body
    conjuntos = raiz.values if isinstance(raiz, ast.BoolOp) and isinstance(raiz.op, ast.And) else [raiz]
    siempre = set()
    for c in conjuntos:
        if not (isinstance(c, ast.BoolOp) and isinstance(c.op, ast.Or)):
            siempre |= variables(ast.unparse(c))
    return variables(expr) - siempre


def aplicar_correccion(regla, c):
    """(regla nueva, estado) con estado 'aplicada', 'ya_aplicada' o un mensaje de rechazo."""
    actual = int(regla.get("version") or 1)
    nueva_version = c["version"] + 1
    texto = f"Versión {nueva_version} ({FECHA}, revisión de subagentes): {c['nota']}"
    # Una versión posterior (p. ej. el cambio de severidad del 16-oct) conserva la corrección: sigue aplicada.
    if actual >= nueva_version and texto in (regla.get("nota") or ""):
        return regla, "ya_aplicada"
    if actual != c["version"]:
        return regla, f"está en versión {actual} y la corrección espera la {c['version']}: no se toca"
    r = json.loads(json.dumps(regla))
    if "aplica_si" in c:
        r["aplica_si"] = c["aplica_si"]
    if "fuente" in c:
        r.setdefault("fuente", {}).update(c["fuente"])
    if "entradas_opcionales" in c:
        r["entradas_opcionales"] = list(dict.fromkeys((r.get("entradas_opcionales") or []) + c["entradas_opcionales"]))
    r["version"] = nueva_version
    r["nota"] = (r["nota"] + " | " if r.get("nota") else "") + texto
    return r, "aplicada"


def validar(r, texto_norma):
    errores = []
    for campo in ("aplica_si", "condicion"):
        if r.get(campo):
            try:
                validar_expresion(r[campo])
            except ValueError as e:
                errores.append(f"{campo}: {e}")
    if not cita_en_normativa((r.get("fuente") or {}).get("cita_textual"), texto_norma):
        errores.append("la cita no está literal en normativa/")
    if r.get("condicion"):
        faltan = variables(r["condicion"]) - set(r.get("entradas") or []) - set(r.get("entradas_opcionales") or [])
        if faltan:
            errores.append(f"claves de la condición sin declarar: {sorted(faltan)}")
        imprescindibles = set(r.get("entradas_opcionales") or []) - _ramas_or(r["condicion"])
        if imprescindibles & variables(r["condicion"]):
            errores.append(f"entradas_opcionales que la condición lee siempre: {sorted(imprescindibles)}")
    return errores


def planificar(raiz=RAIZ, correcciones=CORRECCIONES):
    """(archivos {ruta: (datos, sangría)} con cambios, resumen {estado: [ids]}, errores)."""
    por_id = {c["id"]: c for c in correcciones}
    texto_norma = textos_normativa(raiz)
    archivos, resumen, errores, ids = {}, {"aplicada": [], "ya_aplicada": []}, [], []
    for f in sorted((raiz / "reglas").glob("*.json")):
        datos, sangria = leer(f)
        salida, cambio = [], False
        for regla in datos:
            ids.append(regla["id"])
            c = por_id.get(regla["id"])
            if not c:
                salida.append(regla)
                continue
            nueva, estado = aplicar_correccion(regla, c)
            if estado in resumen:
                resumen[estado].append(regla["id"])
                if estado == "aplicada":
                    errores += [(regla["id"], e) for e in validar(nueva, texto_norma)]
                    cambio = True
            else:
                errores.append((regla["id"], estado))
            salida.append(nueva)
        if cambio:
            archivos[f] = (salida, sangria)
    for i in sorted(set(por_id) - set(ids)):
        errores.append((i, "la corrección no corresponde a ninguna regla del catálogo"))
    errores += [(i, "id repetido en reglas/") for i in sorted({i for i in ids if ids.count(i) > 1})]
    return archivos, resumen, errores


def actualizar_contrato(raiz=RAIZ, escribir_archivo=True, grupos=None):
    """Aplica HECHOS_REGLAS, HECHOS_DEFINICION y HECHOS_NUEVOS. Devuelve la lista de cambios (vacía si ya estaba)."""
    p = raiz / "scripts" / "hechos_documentales.json"
    contrato = json.loads(p.read_text(encoding="utf-8"))
    por_clave = {d["clave"]: d for d in contrato["datos"]}
    cambios = []
    con_h = grupos is None or "h" in grupos
    con_g = grupos is None or "g" in grupos
    for clave, ids in (HECHOS_REGLAS.items() if con_h else ()):
        d = por_clave[clave]
        for i in ids:
            if i not in d["reglas"]:
                d["reglas"] = sorted(d["reglas"] + [i])
                cambios.append(f"{clave}: + {i}")
    for clave, campos in (HECHOS_DEFINICION.items() if con_h else ()):
        for k, v in campos.items():
            if por_clave[clave].get(k) != v:
                por_clave[clave][k] = v
                cambios.append(f"{clave}: {k}")
    for nuevo in (HECHOS_NUEVOS if con_g else ()):
        if nuevo["clave"] not in por_clave:
            contrato["datos"].append(nuevo)
            cambios.append(f"{nuevo['clave']}: nuevo")
    if cambios and escribir_archivo:
        p.write_text(json.dumps(contrato, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return cambios


def paso_notas(simular):
    total = 0
    for f in sorted((RAIZ / "reglas").glob("*.json")):
        datos, sangria = leer(f)
        n = 0
        for r in datos:
            nota = normalizar_nota(r.get("nota") or "")
            if r.get("nota") and nota != r["nota"]:
                r["nota"] = nota
                n += 1
        if n and not simular:
            escribir(f, datos, sangria)
        total += n
    faltan = [r["id"] for f in sorted((RAIZ / "reglas").glob("*.json")) for r in leer(f)[0]
              if int(r.get("version") or 1) > 1 and f"Versión {r['version']}" not in normalizar_nota(r.get("nota") or "")]
    print(f"notas normalizadas: {total}; reglas con versión > 1 sin «Versión N»: {len(faltan)} {faltan[:10]}")
    return 1 if faltan else 0


def paso_aplicar(simular, grupos=None):
    elegidas = [c for c in CORRECCIONES if grupos is None or c["grupo"] in grupos]
    archivos, resumen, errores = planificar(correcciones=elegidas)
    print(json.dumps({k: len(v) for k, v in resumen.items()}, ensure_ascii=False))
    if errores:
        for i, e in errores:
            print(f"ERROR {i}: {e}")
        print(f"{len(errores)} errores: no se escribió nada")
        return 1
    cambios = actualizar_contrato(escribir_archivo=not simular, grupos=grupos)
    if simular:
        print(f"simulación: {len(resumen['aplicada'])} correcciones y {len(cambios)} cambios del contrato por aplicar")
        return 0
    for f, (datos, sangria) in archivos.items():
        escribir(f, datos, sangria)
    print(f"escrito: {len(archivos)} archivos de reglas, {len(cambios)} cambios en hechos_documentales.json")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("paso", choices=["notas", "aplicar"])
    ap.add_argument("--grupo", help="grupos separados por coma (a, b, e, f, g, h)")
    ap.add_argument("--simular", action="store_true", help="valida y cuenta sin escribir")
    a = ap.parse_args(argv)
    grupos = set(a.grupo.split(",")) if a.grupo else None
    return paso_notas(a.simular) if a.paso == "notas" else paso_aplicar(a.simular, grupos)


if __name__ == "__main__":
    sys.exit(main())
